package ai.aurora.device.wake

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import ai.aurora.device.concurrent.AudioResourceLeaseGate
import ai.aurora.device.wake.AuroraAudioArbiter.AudioOwner
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * Local microphone wake detector. It emits only a non-authoritative WakeCandidate and never stores
 * raw PCM. Permission/privacy are revalidated while capture is active.
 */
class AudioRecordAuroraWakeEngine(
    context: Context,
    private val model: AuroraWakeTemplateModel,
    private val config: WakeConfig = WakeConfig(),
    private val privacyBlocked: () -> Boolean,
    private val playbackState: () -> WakePlaybackSnapshot,
    private val onState: (WakeState) -> Unit,
    private val onConfirmed: (WakeCandidate) -> Unit,
    private val onRejectedOrIgnored: () -> Unit = {},
    private val onError: (String) -> Unit,
) : AutoCloseable {
    private val appContext = context.applicationContext
    private val running = AtomicBoolean(false)
    private val audioLease = AudioResourceLeaseGate()
    private val executor =
        Executors.newSingleThreadExecutor { runnable ->
            Thread(runnable, "AuroraWakeAudio").apply { priority = Thread.NORM_PRIORITY }
        }
    private val recorder = AtomicReference<AudioRecord?>(null)
    private val echoCanceler = AtomicReference<AcousticEchoCanceler?>(null)
    private val noiseSuppressor = AtomicReference<NoiseSuppressor?>(null)
    private val segmenter = AuroraWakeVadSegmenter()
    private val stateMachine = WakeStateMachine(config, WakeProcessAcceptanceRuntime.history)

    fun start(): Boolean {
        if (!running.compareAndSet(false, true)) return true
        if (privacyBlocked()) {
            running.set(false)
            onState(WakeState.PRIVACY_BLOCKED)
            return false
        }
        if (
            appContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            running.set(false)
            onState(WakeState.PERMISSION_REQUIRED)
            return false
        }
        if (!AuroraAudioRuntime.arbiter.tryAcquire(AudioOwner.HOTWORD_MONITOR)) {
            running.set(false)
            onState(WakeState.ENGINE_UNAVAILABLE)
            onError("wake audio ownership unavailable")
            return false
        }
        if (
            !audioLease.markHeldAndValidate(
                isLifecycleActive = running::get,
                release = { AuroraAudioRuntime.arbiter.release(AudioOwner.HOTWORD_MONITOR) },
            )
        ) {
            return false
        }
        return runCatching {
            if (!running.get()) {
                releaseAudio()
                return@runCatching false
            }
            val audioRecord = createAudioRecord()
            recorder.set(audioRecord)
            if (!running.get()) {
                releaseAudio()
                return@runCatching false
            }
            if (AcousticEchoCanceler.isAvailable()) {
                echoCanceler.set(
                    AcousticEchoCanceler.create(audioRecord.audioSessionId)?.apply { enabled = true },
                )
            }
            if (NoiseSuppressor.isAvailable()) {
                noiseSuppressor.set(
                    NoiseSuppressor.create(audioRecord.audioSessionId)?.apply { enabled = true },
                )
            }
            if (!running.get()) {
                releaseAudio()
                return@runCatching false
            }
            stateMachine.arm()
            onState(stateMachine.state)
            audioRecord.startRecording()
            if (!running.get()) {
                releaseAudio()
                return@runCatching false
            }
            executor.execute(::readLoop)
            true
        }.getOrElse { throwable ->
            val unexpectedWhileActive = running.getAndSet(false)
            releaseAudio()
            if (unexpectedWhileActive) {
                onState(WakeState.ENGINE_UNAVAILABLE)
                onError("wake audio engine unavailable: ${throwable.javaClass.simpleName}")
            }
            false
        }
    }

    fun currentState(): WakeState = stateMachine.state

    override fun close() {
        running.set(false)
        segmenter.clear()
        releaseAudio()
        executor.shutdownNow()
    }

    private fun readLoop() {
        val frame = ShortArray(FRAME_SAMPLES)
        try {
            while (running.get()) {
                if (privacyBlocked()) {
                    onState(WakeState.PRIVACY_BLOCKED)
                    break
                }
                if (
                    appContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
                        PackageManager.PERMISSION_GRANTED
                ) {
                    onState(WakeState.PERMISSION_REQUIRED)
                    break
                }
                val read =
                    recorder.get()?.read(frame, 0, frame.size, AudioRecord.READ_BLOCKING)
                        ?: AudioRecord.ERROR_INVALID_OPERATION
                if (read < 0) throw IllegalStateException("AudioRecord read failed: $read")
                if (read != frame.size) continue
                val candidatePcm = segmenter.accept(frame) ?: continue
                val features =
                    runCatching { AuroraWakeFeatureExtractor.extract(candidatePcm) }.getOrNull()
                if (features == null) {
                    onRejectedOrIgnored()
                    continue
                }
                val confidence = model.confidence(features)
                val playback = playbackState()
                val observation =
                    WakeObservation(
                        observedAtMs = System.currentTimeMillis(),
                        confidence = confidence,
                        featureFingerprint = fingerprint(features),
                        ttsActive = playback.ttsActive,
                        playbackCorrelation =
                            when {
                                !playback.ttsActive -> null
                                playback.keywordPlaybackActive -> 1.0
                                else -> 0.0
                            },
                        microphonePermissionGranted = true,
                        privacyBlocked = false,
                    )
                when (val evaluation = stateMachine.evaluate(observation)) {
                    is WakeEvaluation.Confirmed -> {
                        running.set(false)
                        onState(WakeState.HOTWORD_CONFIRMED)
                        // The successor STT must never race a still-live AudioRecord or logical
                        // HOTWORD lease. Release both before handing the candidate to the platform.
                        releaseAudio()
                        onConfirmed(evaluation.candidate)
                    }
                    is WakeEvaluation.Rejected -> onRejectedOrIgnored()
                }
            }
        } catch (throwable: Throwable) {
            if (running.get()) {
                onState(WakeState.ERROR)
                onError("wake audio loop failed: ${throwable.javaClass.simpleName}")
            }
        } finally {
            running.set(false)
            segmenter.clear()
            releaseAudio()
        }
    }

    @SuppressLint("MissingPermission")
    private fun createAudioRecord(): AudioRecord {
        val minBuffer =
            AudioRecord.getMinBufferSize(
                SAMPLE_RATE_HZ,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
            )
        require(minBuffer > 0) { "invalid AudioRecord minimum buffer" }
        val record =
            AudioRecord.Builder()
                .setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(SAMPLE_RATE_HZ)
                        .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                        .build(),
                )
                .setBufferSizeInBytes(maxOf(minBuffer, FRAME_SAMPLES * 2 * 8))
                .build()
        require(record.state == AudioRecord.STATE_INITIALIZED) { "AudioRecord did not initialize" }
        return record
    }

    private fun releaseAudio() {
        runCatching { echoCanceler.getAndSet(null)?.release() }
        runCatching { noiseSuppressor.getAndSet(null)?.release() }
        val current = recorder.getAndSet(null)
        runCatching { current?.stop() }
        runCatching { current?.release() }
        audioLease.releaseIfHeld { AuroraAudioRuntime.arbiter.release(AudioOwner.HOTWORD_MONITOR) }
    }

    private fun fingerprint(vector: WakeFeatureVector): String {
        val canonical =
            vector.values.joinToString(",") { "%.8f".format(java.util.Locale.US, it) }
        return MessageDigest.getInstance("SHA-256")
            .digest(canonical.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte) }
            .take(64)
    }

    companion object {
        const val SAMPLE_RATE_HZ = 16_000
        const val FRAME_SAMPLES = 320
    }
}
