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
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class AudioRecordAuroraWakeEngine(
    context: Context,
    private val model: AuroraWakeTemplateModel,
    private val config: WakeConfig = WakeConfig(),
    private val privacyBlocked: () -> Boolean,
    private val ttsActive: () -> Boolean,
    private val onState: (WakeState) -> Unit,
    private val onConfirmed: (WakeCandidate) -> Unit,
    private val onError: (String) -> Unit,
) : AutoCloseable {
    private val appContext = context.applicationContext
    private val running = AtomicBoolean(false)
    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "AuroraWakeAudio").apply { priority = Thread.NORM_PRIORITY }
    }
    private var recorder: AudioRecord? = null
    private var echoCanceler: AcousticEchoCanceler? = null
    private var noiseSuppressor: NoiseSuppressor? = null
    private val segmenter = AuroraWakeVadSegmenter()
    private val stateMachine = WakeStateMachine(config)

    fun start(): Boolean {
        if (!running.compareAndSet(false, true)) return true
        if (privacyBlocked()) {
            running.set(false)
            onState(WakeState.PRIVACY_BLOCKED)
            return false
        }
        if (appContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            running.set(false)
            onState(WakeState.PERMISSION_REQUIRED)
            return false
        }
        return runCatching {
            val audioRecord = createAudioRecord()
            recorder = audioRecord
            if (AcousticEchoCanceler.isAvailable()) {
                echoCanceler = AcousticEchoCanceler.create(audioRecord.audioSessionId)?.apply { enabled = true }
            }
            if (NoiseSuppressor.isAvailable()) {
                noiseSuppressor = NoiseSuppressor.create(audioRecord.audioSessionId)?.apply { enabled = true }
            }
            stateMachine.arm()
            onState(stateMachine.state)
            audioRecord.startRecording()
            executor.execute(::readLoop)
            true
        }.getOrElse { throwable ->
            running.set(false)
            releaseAudio()
            onState(WakeState.ENGINE_UNAVAILABLE)
            onError("Wake audio engine unavailable: ${throwable.javaClass.simpleName}")
            false
        }
    }

    fun currentState(): WakeState = stateMachine.state

    override fun close() {
        running.set(false)
        runCatching { recorder?.stop() }
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
                if (appContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    onState(WakeState.PERMISSION_REQUIRED)
                    break
                }
                val read = recorder?.read(frame, 0, frame.size, AudioRecord.READ_BLOCKING) ?: AudioRecord.ERROR_INVALID_OPERATION
                if (read < 0) throw IllegalStateException("AudioRecord read failed: $read")
                if (read != frame.size) continue
                val candidatePcm = segmenter.accept(frame) ?: continue
                val features = runCatching { AuroraWakeFeatureExtractor.extract(candidatePcm) }.getOrNull() ?: continue
                val confidence = model.confidence(features)
                val observation = WakeObservation(
                    observedAtMs = System.currentTimeMillis(),
                    confidence = confidence,
                    featureFingerprint = fingerprint(features),
                    ttsActive = ttsActive(),
                    // Until a trusted playback reference exists, null intentionally fails closed while TTS is active.
                    playbackCorrelation = null,
                    microphonePermissionGranted = true,
                    privacyBlocked = false,
                )
                when (val evaluation = stateMachine.evaluate(observation)) {
                    is WakeEvaluation.Confirmed -> {
                        running.set(false)
                        onState(WakeState.HOTWORD_CONFIRMED)
                        onConfirmed(evaluation.candidate)
                    }
                    is WakeEvaluation.Rejected -> Unit
                }
            }
        } catch (throwable: Throwable) {
            if (running.get()) {
                onState(WakeState.ERROR)
                onError("Wake audio loop failed: ${throwable.javaClass.simpleName}")
            }
        } finally {
            running.set(false)
            segmenter.clear()
            runCatching { recorder?.stop() }
            releaseAudio()
        }
    }

    @SuppressLint("MissingPermission")
    private fun createAudioRecord(): AudioRecord {
        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE_HZ,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        require(minBuffer > 0) { "invalid AudioRecord minimum buffer" }
        val record = AudioRecord.Builder()
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
        runCatching { echoCanceler?.release() }
        runCatching { noiseSuppressor?.release() }
        echoCanceler = null
        noiseSuppressor = null
        val current = recorder
        recorder = null
        runCatching { current?.release() }
    }

    private fun fingerprint(vector: WakeFeatureVector): String {
        val canonical = vector.values.joinToString(",") { "%.8f".format(java.util.Locale.US, it) }
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
