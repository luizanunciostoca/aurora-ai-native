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
    private val lifecycle = CloseableOperationGate()
    private val sttLease = AudioResourceLeaseGate()
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
        if (!lifecycle.tryStart()) {
            onFailure(BoundedSpeechRecognitionFailure.ALREADY_ACTIVE)
            return
        }
        resultCallback = onResult
        failureCallback = onFailure
        handler.post(::startOnMainThread)
    }

    override fun close() {
        val activeAtClose = lifecycle.close()
        if (Looper.myLooper() == Looper.getMainLooper()) {
            cleanupAfterClose(activeAtClose)
        } else {
            handler.post { cleanupAfterClose(activeAtClose) }
        }
    }

    private fun cleanupAfterClose(activeAtClose: Boolean) {
        if (activeAtClose) {
            finishResources(invokeFailure = null, transitionLifecycle = false)
        } else {
            sttLease.releaseIfHeld { AuroraAudioRuntime.arbiter.release(AudioOwner.STT) }
        }
    }

    private fun startOnMainThread() {
        if (!lifecycle.isActive()) return
        if (privacyBlocked()) {
            finishResources(BoundedSpeechRecognitionFailure.PRIVACY_BLOCKED)
            return
        }
        if (
            appContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            finishResources(BoundedSpeechRecognitionFailure.MICROPHONE_PERMISSION_REQUIRED)
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(appContext)) {
            finishResources(BoundedSpeechRecognitionFailure.RECOGNIZER_UNAVAILABLE)
            return
        }
        audioAcquireAttempts = 0
        attemptAcquireSttAudio()
    }

    private fun attemptAcquireSttAudio() {
        if (!lifecycle.isActive()) return
        if (privacyBlocked()) {
            finishResources(BoundedSpeechRecognitionFailure.PRIVACY_BLOCKED)
            return
        }
        if (
            appContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            finishResources(BoundedSpeechRecognitionFailure.MICROPHONE_PERMISSION_REQUIRED)
            return
        }
        if (AuroraAudioRuntime.arbiter.handoffToStt()) {
            if (
                !sttLease.markHeldAndValidate(
                    isLifecycleActive = lifecycle::isActive,
                    release = { AuroraAudioRuntime.arbiter.release(AudioOwner.STT) },
                )
            ) {
                return
            }
            startRecognizerWithLease()
            return
        }
        if (audioAcquireAttempts >= MAX_AUDIO_ACQUIRE_ATTEMPTS) {
            finishResources(BoundedSpeechRecognitionFailure.AUDIO_OWNERSHIP_UNAVAILABLE)
            return
        }
        audioAcquireAttempts += 1
        handler.postDelayed(audioAcquireRunnable, AUDIO_ACQUIRE_RETRY_MS)
    }

    private fun startRecognizerWithLease() {
        if (!lifecycle.isActive()) {
            sttLease.releaseIfHeld { AuroraAudioRuntime.arbiter.release(AudioOwner.STT) }
            return
        }
        val localRecognizer =
            runCatching { SpeechRecognizer.createSpeechRecognizer(appContext) }.getOrElse {
                finishResources(BoundedSpeechRecognitionFailure.RECOGNIZER_ERROR)
                return
            }
        recognizer = localRecognizer
        localRecognizer.setRecognitionListener(listener)
        val timeout =
            Runnable {
                if (lifecycle.isActive()) {
                    runCatching { recognizer?.cancel() }
                    finishResources(BoundedSpeechRecognitionFailure.TIMEOUT)
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
            finishResources(BoundedSpeechRecognitionFailure.RECOGNIZER_ERROR)
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
                finishResources(reason)
            }

            override fun onResults(results: Bundle?) {
                val transcripts =
                    results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
                val transcript = transcripts.firstOrNull()?.trim().orEmpty()
                if (transcript.isBlank()) {
                    finishResources(BoundedSpeechRecognitionFailure.NO_MATCH)
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
                if (!finishResources(invokeFailure = null)) return
                callback?.invoke(
                    BoundedSpeechRecognitionResult(
                        transcript = boundedTranscript,
                        confidence = confidence,
                        languageTag = Locale.forLanguageTag(languageTag).toLanguageTag(),
                    ),
                )
            }
        }

    /** Returns true only for the terminal path that owns this recognition operation. */
    private fun finishResources(
        invokeFailure: BoundedSpeechRecognitionFailure?,
        transitionLifecycle: Boolean = true,
    ): Boolean {
        if (transitionLifecycle && !lifecycle.tryFinish()) {
            sttLease.releaseIfHeld { AuroraAudioRuntime.arbiter.release(AudioOwner.STT) }
            return false
        }
        handler.removeCallbacks(audioAcquireRunnable)
        audioAcquireAttempts = 0
        timeoutRunnable?.let(handler::removeCallbacks)
        timeoutRunnable = null
        val localRecognizer = recognizer
        recognizer = null
        runCatching { localRecognizer?.cancel() }
        runCatching { localRecognizer?.destroy() }
        sttLease.releaseIfHeld { AuroraAudioRuntime.arbiter.release(AudioOwner.STT) }
        val failure = failureCallback
        resultCallback = null
        failureCallback = null
        if (invokeFailure != null) failure?.invoke(invokeFailure)
        return true
    }

    companion object {
        const val DEFAULT_TIMEOUT_MS = 8_000L
        private const val AUDIO_ACQUIRE_RETRY_MS = 50L
        private const val MAX_AUDIO_ACQUIRE_ATTEMPTS = 10
    }
}
