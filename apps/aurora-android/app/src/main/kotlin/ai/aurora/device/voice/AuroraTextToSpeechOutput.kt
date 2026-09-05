package ai.aurora.device.voice

import android.content.Context
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import ai.aurora.device.wake.AuroraAudioArbiter.AudioOwner
import ai.aurora.device.wake.AuroraAudioRuntime
import ai.aurora.device.wake.WakePlaybackAwareness
import java.util.Locale
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Local bounded TTS output. Speech playback is presentation only: a successful TTS callback cannot
 * prove any Aurora business outcome, authorize execution, or authorize retry.
 */
data class AuroraSpeechOutputReceipt(
    val utteranceId: String,
    val renderedLocally: Boolean,
    val provesExecutionSuccess: Boolean = false,
    val authorizesExecution: Boolean = false,
    val retryAuthorized: Boolean = false,
) {
    init {
        require(utteranceId.isNotBlank())
        require(!provesExecutionSuccess)
        require(!authorizesExecution)
        require(!retryAuthorized)
    }
}

enum class AuroraSpeechOutputFailure {
    ALREADY_ACTIVE,
    AUDIO_OWNERSHIP_UNAVAILABLE,
    ENGINE_UNAVAILABLE,
    SPEAK_FAILED,
}

class AuroraTextToSpeechOutput(
    context: Context,
    private val languageTag: String = "pt-BR",
) : AutoCloseable {
    private val appContext = context.applicationContext
    private val active = AtomicBoolean(false)
    private var engine: TextToSpeech? = null
    private var ready = false
    private var pendingText: String? = null
    private var pendingUtteranceId: String? = null
    private var completion: ((AuroraSpeechOutputReceipt) -> Unit)? = null
    private var failure: ((AuroraSpeechOutputFailure) -> Unit)? = null

    init {
        require(languageTag == "pt-BR")
    }

    fun speak(
        text: String,
        onComplete: (AuroraSpeechOutputReceipt) -> Unit,
        onFailure: (AuroraSpeechOutputFailure) -> Unit,
    ) {
        require(text.isNotBlank()) { "TTS text must not be blank" }
        require(text.length <= MAX_TEXT_CHARS) { "TTS text exceeds bounded output limit" }
        if (!active.compareAndSet(false, true)) {
            onFailure(AuroraSpeechOutputFailure.ALREADY_ACTIVE)
            return
        }
        if (!AuroraAudioRuntime.arbiter.tryAcquire(AudioOwner.TTS)) {
            active.set(false)
            onFailure(AuroraSpeechOutputFailure.AUDIO_OWNERSHIP_UNAVAILABLE)
            return
        }
        pendingText = text
        pendingUtteranceId = "aurora-tts-${UUID.randomUUID()}"
        completion = onComplete
        failure = onFailure

        val existing = engine
        if (existing != null && ready) {
            speakNow(existing)
            return
        }
        engine =
            TextToSpeech(appContext) { status ->
                val local = engine
                if (status != TextToSpeech.SUCCESS || local == null) {
                    fail(AuroraSpeechOutputFailure.ENGINE_UNAVAILABLE)
                    return@TextToSpeech
                }
                val locale = Locale.forLanguageTag(languageTag)
                val languageResult = local.setLanguage(locale)
                if (
                    languageResult == TextToSpeech.LANG_MISSING_DATA ||
                    languageResult == TextToSpeech.LANG_NOT_SUPPORTED
                ) {
                    fail(AuroraSpeechOutputFailure.ENGINE_UNAVAILABLE)
                    return@TextToSpeech
                }
                ready = true
                local.setOnUtteranceProgressListener(listener)
                speakNow(local)
            }
    }

    override fun close() {
        if (active.get()) fail(null)
        val local = engine
        engine = null
        ready = false
        runCatching { local?.stop() }
        runCatching { local?.shutdown() }
    }

    private fun speakNow(local: TextToSpeech) {
        val text = pendingText ?: return fail(AuroraSpeechOutputFailure.SPEAK_FAILED)
        val utteranceId = pendingUtteranceId ?: return fail(AuroraSpeechOutputFailure.SPEAK_FAILED)
        WakePlaybackAwareness.onTtsStarted(text)
        val status = local.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle(), utteranceId)
        if (status != TextToSpeech.SUCCESS) fail(AuroraSpeechOutputFailure.SPEAK_FAILED)
    }

    private val listener =
        object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit

            override fun onDone(utteranceId: String?) {
                val expected = pendingUtteranceId
                if (expected == null || utteranceId != expected) return
                val callback = completion
                finish()
                callback?.invoke(
                    AuroraSpeechOutputReceipt(
                        utteranceId = expected,
                        renderedLocally = true,
                    ),
                )
            }

            @Deprecated("Deprecated in Android")
            override fun onError(utteranceId: String?) {
                if (utteranceId == pendingUtteranceId) fail(AuroraSpeechOutputFailure.SPEAK_FAILED)
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                if (utteranceId == pendingUtteranceId) fail(AuroraSpeechOutputFailure.SPEAK_FAILED)
            }
        }

    private fun fail(reason: AuroraSpeechOutputFailure?) {
        val callback = failure
        finish()
        if (reason != null) callback?.invoke(reason)
    }

    private fun finish() {
        WakePlaybackAwareness.onTtsStopped()
        active.set(false)
        pendingText = null
        pendingUtteranceId = null
        completion = null
        failure = null
        AuroraAudioRuntime.arbiter.release(AudioOwner.TTS)
    }

    companion object {
        const val MAX_TEXT_CHARS = 2_048
    }
}
