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
import ai.aurora.device.wake.AuroraAudioArbiter.AudioOwner
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** User-initiated, bounded enrollment capture. Never persists PCM. */
class AuroraWakeEnrollmentRecorder(
    context: Context,
) : AutoCloseable {
    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor =
        Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "AuroraWakeEnrollment") }
    private val active = AtomicBoolean(false)
    private val audioLeaseHeld = AtomicBoolean(false)
    private var recorder: AudioRecord? = null

    fun capture(
        onState: (String) -> Unit,
        onSuccess: (WakeFeatureVector) -> Unit,
        onError: (String) -> Unit,
    ) {
        if (!active.compareAndSet(false, true)) {
            onError("wake enrollment is already active")
            return
        }
        if (
            appContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            active.set(false)
            onError("microphone permission is required for wake enrollment")
            return
        }
        if (!AuroraAudioRuntime.arbiter.tryAcquire(AudioOwner.STT)) {
            active.set(false)
            onError("exclusive microphone ownership is unavailable for wake enrollment")
            return
        }
        audioLeaseHeld.set(true)

        executor.execute {
            val segmenter = AuroraWakeVadSegmenter(maxSpeechMs = 1_800)
            try {
                val audioRecord = createAudioRecord()
                recorder = audioRecord
                audioRecord.startRecording()
                mainHandler.post { onState("SAY_AURORA") }
                val frame = ShortArray(AudioRecordAuroraWakeEngine.FRAME_SAMPLES)
                val deadline = System.currentTimeMillis() + CAPTURE_TIMEOUT_MS
                var features: WakeFeatureVector? = null
                while (active.get() && System.currentTimeMillis() < deadline && features == null) {
                    val read = audioRecord.read(frame, 0, frame.size, AudioRecord.READ_BLOCKING)
                    if (read < 0) error("AudioRecord read failed: $read")
                    if (read != frame.size) continue
                    val candidate = segmenter.accept(frame) ?: continue
                    features = AuroraWakeFeatureExtractor.extract(candidate)
                }
                val result = features
                if (result == null) {
                    mainHandler.post { onError("wake enrollment sample was not clear enough") }
                } else {
                    mainHandler.post { onSuccess(result) }
                }
            } catch (throwable: Throwable) {
                mainHandler.post { onError("wake enrollment failed: ${throwable.javaClass.simpleName}") }
            } finally {
                active.set(false)
                segmenter.clear()
                releaseRecorder()
                releaseAudioLease()
            }
        }
    }

    fun cancel() {
        active.set(false)
        runCatching { recorder?.stop() }
        releaseRecorder()
        releaseAudioLease()
    }

    override fun close() {
        cancel()
        executor.shutdownNow()
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
        val current = recorder
        recorder = null
        runCatching { current?.stop() }
        runCatching { current?.release() }
    }

    private fun releaseAudioLease() {
        if (audioLeaseHeld.compareAndSet(true, false)) {
            AuroraAudioRuntime.arbiter.release(AudioOwner.STT)
        }
    }

    companion object {
        private const val CAPTURE_TIMEOUT_MS = 6_000L
    }
}
