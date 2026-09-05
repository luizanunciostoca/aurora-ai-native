package ai.aurora.device.voice

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import ai.aurora.device.wake.AuroraAudioArbiter.AudioOwner
import ai.aurora.device.wake.AuroraAudioRuntime
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Bounded Android STT capture used after a wake candidate. Transcript/confidence are intelligence
 * inputs only and can never authorize execution, prove outcome, or authorize retry.
 */
data class BoundedSpeechRecognitionResult(
    val transcript: String,
    val confidence: Double?,
    val languageTag: String,
    val authorizesExecution: Boolean = false,
    val provesExecutionSuccess: Boolean = false,
    val retryAuthorized: Boolean = false,
) {
    init {
        require(transcript.length <= MAX_TRANSCRIPT_CHARS)
        require(confidence == null || (confidence.isFinite() && confidence in 0.0..1.0))
        require(languageTag.isNotBlank())
        require(!authorizesExecution)
        require(!provesExecutionSuccess)
        require(!retryAuthorized)
    }

    companion object {
        const val MAX_TRANSCRIPT_CHARS = 2_048
    }
}

enum class BoundedSpeechRecognitionFailure {
    ALREADY_ACTIVE,
    PRIVACY_BLOCKED,
    MICROPHONE_PERMISSION_REQUIRED,
    RECOGNIZER_UNAVAILABLE,
    AUDIO_OWNERSHIP_UNAVAILABLE,
    TIMEOUT,
    NO_MATCH,
    RECOGNIZER_ERROR,
}

class BoundedSpeechRecognizer(
    context: Context,
    private val privacyBlocked: () -> Boolean,
    private val languageTag: String = "pt-BR",
    private val timeoutMs: Long = DEFAULT_TIMEOUT_MS,
) : AutoCloseable {
    private val appContext = context.applicationContext
    private val handler = Handler(Looper.getMainLooper())
    private val active = AtomicBoolean(false)
    private val sttLeaseHeld = AtomicBoolean(false)
    private var recognizer: SpeechRecognizer? = null
    private var timeoutRunnable: Runnable? = null
    private var audioAcquireAttempts = 0
    private val audioAcquireRunnable = Runnable(::attemptAcquireSttAudio)
    private var resultCallback: ((BoundedSpeechRecognitionResult) -> Unit)? = null
    private var failureCallback: ((BoundedSpeechRecognitionFailure) -> Unit)? = null

    init {
        require(languageTag == "pt-BR") { "wake follow-up STT is currently bound to pt-BR" }
        require(timeoutMs in 2_000..15_000) { "STT timeout must stay bounded" }
    }

    fun start(
        onResult: (BoundedSpeechRecognitionResult) -> Unit,
        onFailure: (BoundedSpeechRecognitionFailure) -> Unit,
    ) {
        if (!active.compareAndSet(false, true)) {
            onFailure(BoundedSpeechRecognitionFailure.ALREADY_ACTIVE)
            return
        }
        resultCallback = onResult
        failureCallback = onFailure
        handler.post(::startOnMainThread)
    }

    override fun close() {
        handler.post { release(invokeFailure = null) }
    }

    private fun startOnMainThread() {
        if (!active.get()) return
        if (privacyBlocked()) {
            release(BoundedSpeechRecognitionFailure.PRIVACY_BLOCKED)
            return
        }
        if (
            appContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            release(BoundedSpeechRecognitionFailure.MICROPHONE_PERMISSION_REQUIRED)
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(appContext)) {
            release(BoundedSpeechRecognitionFailure.RECOGNIZER_UNAVAILABLE)
            return
        }
        audioAcquireAttempts = 0
        attemptAcquireSttAudio()
    }

    private fun attemptAcquireSttAudio() {
        if (!active.get()) return
        if (privacyBlocked()) {
            release(BoundedSpeechRecognitionFailure.PRIVACY_BLOCKED)
            return
        }
        if (
            appContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            release(BoundedSpeechRecognitionFailure.MICROPHONE_PERMISSION_REQUIRED)
            return
        }
        if (AuroraAudioRuntime.arbiter.handoffToStt()) {
            sttLeaseHeld.set(true)
            startRecognizerWithLease()
            return
        }
        if (audioAcquireAttempts >= MAX_AUDIO_ACQUIRE_ATTEMPTS) {
            release(BoundedSpeechRecognitionFailure.AUDIO_OWNERSHIP_UNAVAILABLE)
            return
        }
        audioAcquireAttempts += 1
        handler.postDelayed(audioAcquireRunnable, AUDIO_ACQUIRE_RETRY_MS)
    }

    private fun startRecognizerWithLease() {
        if (!active.get()) {
            release(invokeFailure = null)
            return
        }
        val localRecognizer =
            runCatching { SpeechRecognizer.createSpeechRecognizer(appContext) }.getOrElse {
                release(BoundedSpeechRecognitionFailure.RECOGNIZER_ERROR)
                return
            }
        recognizer = localRecognizer
        localRecognizer.setRecognitionListener(listener)
        val timeout =
            Runnable {
                if (active.get()) {
                    runCatching { recognizer?.cancel() }
                    release(BoundedSpeechRecognitionFailure.TIMEOUT)
                }
            }
        timeoutRunnable = timeout
        handler.postDelayed(timeout, timeoutMs)
        runCatching {
            localRecognizer.startListening(
                Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(
                        RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                        RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
                    )
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, languageTag)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                },
            )
        }.onFailure {
            release(BoundedSpeechRecognitionFailure.RECOGNIZER_ERROR)
        }
    }

    private val listener =
        object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = Unit
            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(rmsdB: Float) = Unit
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() = Unit
            override fun onPartialResults(partialResults: Bundle?) = Unit
            override fun onEvent(eventType: Int, params: Bundle?) = Unit

            override fun onError(error: Int) {
                val reason =
                    when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH,
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT,
                        -> BoundedSpeechRecognitionFailure.NO_MATCH
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                            BoundedSpeechRecognitionFailure.MICROPHONE_PERMISSION_REQUIRED
                        else -> BoundedSpeechRecognitionFailure.RECOGNIZER_ERROR
                    }
                release(reason)
            }

            override fun onResults(results: Bundle?) {
                val transcripts =
                    results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
                val transcript = transcripts.firstOrNull()?.trim().orEmpty()
                if (transcript.isBlank()) {
                    release(BoundedSpeechRecognitionFailure.NO_MATCH)
                    return
                }
                val confidence =
                    results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
                        ?.firstOrNull()
                        ?.toDouble()
                        ?.takeIf { it.isFinite() && it in 0.0..1.0 }
                val boundedTranscript =
                    transcript.take(BoundedSpeechRecognitionResult.MAX_TRANSCRIPT_CHARS)
                val callback = resultCallback
                release(invokeFailure = null)
                callback?.invoke(
                    BoundedSpeechRecognitionResult(
                        transcript = boundedTranscript,
                        confidence = confidence,
                        languageTag = Locale.forLanguageTag(languageTag).toLanguageTag(),
                    ),
                )
            }
        }

    private fun release(invokeFailure: BoundedSpeechRecognitionFailure?) {
        if (!active.compareAndSet(true, false)) return
        handler.removeCallbacks(audioAcquireRunnable)
        audioAcquireAttempts = 0
        timeoutRunnable?.let(handler::removeCallbacks)
        timeoutRunnable = null
        val localRecognizer = recognizer
        recognizer = null
        runCatching { localRecognizer?.cancel() }
        runCatching { localRecognizer?.destroy() }
        if (sttLeaseHeld.compareAndSet(true, false)) {
            AuroraAudioRuntime.arbiter.release(AudioOwner.STT)
        }
        val failure = failureCallback
        resultCallback = null
        failureCallback = null
        if (invokeFailure != null) failure?.invoke(invokeFailure)
    }

    companion object {
        const val DEFAULT_TIMEOUT_MS = 8_000L
        private const val AUDIO_ACQUIRE_RETRY_MS = 50L
        private const val MAX_AUDIO_ACQUIRE_ATTEMPTS = 10
    }
}
