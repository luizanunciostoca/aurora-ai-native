package ai.aurora.device.wake

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import ai.aurora.device.concurrent.AudioResourceLeaseGate
import ai.aurora.device.concurrent.CloseableOperationGate
import ai.aurora.device.wake.AuroraAudioArbiter.AudioOwner
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

/** User-initiated, bounded enrollment capture. Never persists PCM. */
class AuroraWakeEnrollmentRecorder(
    context: Context,
) : AutoCloseable {
    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor =
        Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "AuroraWakeEnrollment") }
    private val lifecycle = CloseableOperationGate()
    private val audioLease = AudioResourceLeaseGate()
    private val captureGeneration = AtomicLong(0)
    private val recorder = AtomicReference<AudioRecord?>(null)

    fun capture(
        onState: (String) -> Unit,
        onSuccess: (WakeFeatureVector) -> Unit,
        onError: (String) -> Unit,
    ) {
        if (!lifecycle.tryStart()) {
            onError("wake enrollment is already active or closed")
            return
        }
        val generation = captureGeneration.incrementAndGet()
        if (
            appContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            lifecycle.tryFinish()
            onError("microphone permission is required for wake enrollment")
            return
        }
        if (!AuroraAudioRuntime.arbiter.tryAcquire(AudioOwner.ENROLLMENT)) {
            lifecycle.tryFinish()
            onError("exclusive microphone ownership is unavailable for wake enrollment")
            return
        }
        if (
            !audioLease.markHeldAndValidate(
                isLifecycleActive = lifecycle::isActive,
                release = { AuroraAudioRuntime.arbiter.release(AudioOwner.ENROLLMENT) },
            )
        ) {
            return
        }

        try {
            executor.execute {
                val segmenter = AuroraWakeVadSegmenter(maxSpeechMs = 1_800)
                try {
                    if (!isCurrentActive(generation)) return@execute
                    val audioRecord = createAudioRecord()
                    recorder.set(audioRecord)
                    if (!isCurrentActive(generation)) {
                        releaseRecorder()
                        return@execute
                    }
                    audioRecord.startRecording()
                    postState(generation, onState, "SAY_AURORA")
                    val frame = ShortArray(AudioRecordAuroraWakeEngine.FRAME_SAMPLES)
                    val deadline = System.currentTimeMillis() + CAPTURE_TIMEOUT_MS
                    var features: WakeFeatureVector? = null
                    while (
                        isCurrentActive(generation) &&
                            System.currentTimeMillis() < deadline &&
                            features == null
                    ) {
                        val read = audioRecord.read(frame, 0, frame.size, AudioRecord.READ_BLOCKING)
                        if (read < 0) error("AudioRecord read failed: $read")
                        if (read != frame.size) continue
                        val candidate = segmenter.accept(frame) ?: continue
                        features = AuroraWakeFeatureExtractor.extract(candidate)
                    }
                    val result = features
                    if (result == null) {
                        postTerminalError(
                            generation,
                            onError,
                            "wake enrollment sample was not clear enough",
                        )
                    } else {
                        postTerminalSuccess(generation, onSuccess, result)
                    }
                } catch (throwable: Throwable) {
                    postTerminalError(
                        generation,
                        onError,
                        "wake enrollment failed: ${throwable.javaClass.simpleName}",
                    )
                } finally {
                    segmenter.clear()
                    releaseRecorder()
                    releaseAudioLease()
                }
            }
        } catch (_: RejectedExecutionException) {
            releaseAudioLease()
            if (captureGeneration.get() == generation && lifecycle.tryFinish()) {
                onError("wake enrollment worker is unavailable")
            }
        }
    }

    fun cancel() {
        captureGeneration.incrementAndGet()
        lifecycle.tryFinish()
        releaseRecorder()
        releaseAudioLease()
    }

    override fun close() {
        captureGeneration.incrementAndGet()
        lifecycle.close()
        releaseRecorder()
        releaseAudioLease()
        executor.shutdownNow()
    }

    private fun isCurrentActive(generation: Long): Boolean =
        captureGeneration.get() == generation && lifecycle.isActive()

    private fun postState(
        generation: Long,
        onState: (String) -> Unit,
        state: String,
    ) {
        mainHandler.post {
            if (isCurrentActive(generation)) onState(state)
        }
    }

    private fun postTerminalSuccess(
        generation: Long,
        onSuccess: (WakeFeatureVector) -> Unit,
        result: WakeFeatureVector,
    ) {
        mainHandler.post {
            if (captureGeneration.get() != generation || !lifecycle.tryFinish()) return@post
            onSuccess(result)
        }
    }

    private fun postTerminalError(
        generation: Long,
        onError: (String) -> Unit,
        message: String,
    ) {
        mainHandler.post {
            if (captureGeneration.get() != generation || !lifecycle.tryFinish()) return@post
            onError(message)
        }
    }

    @SuppressLint("MissingPermission")
    private fun createAudioRecord(): AudioRecord {
        val minBuffer =
            AudioRecord.getMinBufferSize(
                AudioRecordAuroraWakeEngine.SAMPLE_RATE_HZ,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
            )
        require(minBuffer > 0)
        val record =
            AudioRecord.Builder()
                .setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(AudioRecordAuroraWakeEngine.SAMPLE_RATE_HZ)
                        .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                        .build(),
                )
                .setBufferSizeInBytes(
                    maxOf(minBuffer, AudioRecordAuroraWakeEngine.FRAME_SAMPLES * 2 * 8),
                )
                .build()
        require(record.state == AudioRecord.STATE_INITIALIZED)
        return record
    }

    private fun releaseRecorder() {
        val current = recorder.getAndSet(null)
        runCatching { current?.stop() }
        runCatching { current?.release() }
    }

    private fun releaseAudioLease() {
        audioLease.releaseIfHeld { AuroraAudioRuntime.arbiter.release(AudioOwner.ENROLLMENT) }
    }

    companion object {
        private const val CAPTURE_TIMEOUT_MS = 6_000L
    }
}
