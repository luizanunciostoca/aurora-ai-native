package ai.aurora.device.voice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import ai.aurora.device.wake.AuroraAudioArbiter.AudioOwner
import ai.aurora.device.wake.AuroraAudioRuntime
import ai.aurora.device.wake.WakePlaybackAwareness
import java.util.Locale
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

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
    AUDIO_FOCUS_UNAVAILABLE,
    AUDIO_FOCUS_LOST,
    ENGINE_UNAVAILABLE,
    SPEAK_FAILED,
    TIMEOUT,
}

internal fun isTtsAudioFocusLoss(focusChange: Int): Boolean =
    focusChange == AudioManager.AUDIOFOCUS_LOSS ||
        focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT ||
        focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK

/**
 * Atomic lifecycle fence for asynchronous TTS callbacks. close() is terminal for an output instance
 * and competes atomically with onDone/onError, so a callback that loses to close cannot escape late.
 */
internal class TtsLifecycleGate {
    private enum class State {
        IDLE,
        ACTIVE,
        CLOSED,
    }

    private val state = AtomicReference(State.IDLE)

    fun tryStart(): Boolean = state.compareAndSet(State.IDLE, State.ACTIVE)

    fun isActive(): Boolean = state.get() == State.ACTIVE

    fun tryFinish(): Boolean = state.compareAndSet(State.ACTIVE, State.IDLE)

    /** Returns true only when close atomically claimed an active utterance. */
    fun close(): Boolean {
        while (true) {
            when (val current = state.get()) {
                State.CLOSED -> return false
                State.IDLE,
                State.ACTIVE,
                -> if (state.compareAndSet(current, State.CLOSED)) return current == State.ACTIVE
            }
        }
    }
}

class AuroraTextToSpeechOutput(
    context: Context,
    private val languageTag: String = "pt-BR",
) : AutoCloseable {
    private val appContext = context.applicationContext
    private val handler = Handler(Looper.getMainLooper())
    private val lifecycle = TtsLifecycleGate()
    private val ttsLease = TtsResourceLeaseGate()
    private val playbackAnnounced = AtomicBoolean(false)
    private val audioFocusHeld = AtomicBoolean(false)
    private val audioManager = appContext.getSystemService(AudioManager::class.java)
    private val speechAudioAttributes =
        AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
    private var engine: TextToSpeech? = null
    private var ready = false
    private var pendingText: String? = null
    private var pendingUtteranceId: String? = null
    private var timeoutRunnable: Runnable? = null
    private var completion: ((AuroraSpeechOutputReceipt) -> Unit)? = null
    private var failure: ((AuroraSpeechOutputFailure) -> Unit)? = null
    private val audioFocusListener =
        AudioManager.OnAudioFocusChangeListener { focusChange ->
            if (isTtsAudioFocusLoss(focusChange) && lifecycle.isActive()) {
                runCatching { engine?.stop() }
                fail(AuroraSpeechOutputFailure.AUDIO_FOCUS_LOST)
            }
        }
    private val audioFocusRequest =
        AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(speechAudioAttributes)
            .setWillPauseWhenDucked(true)
            .setOnAudioFocusChangeListener(audioFocusListener, handler)
            .build()

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
        if (!lifecycle.tryStart()) {
            onFailure(AuroraSpeechOutputFailure.ALREADY_ACTIVE)
            return
        }
        if (!AuroraAudioRuntime.arbiter.tryAcquire(AudioOwner.TTS)) {
            finishResources()
            onFailure(AuroraSpeechOutputFailure.AUDIO_OWNERSHIP_UNAVAILABLE)
            return
        }
        if (
            !ttsLease.markHeldAndValidate(
                isLifecycleActive = lifecycle::isActive,
                release = { AuroraAudioRuntime.arbiter.release(AudioOwner.TTS) },
            )
        ) {
            return
        }
        pendingText = text
        pendingUtteranceId = "aurora-tts-${UUID.randomUUID()}"
        completion = onComplete
        failure = onFailure
        scheduleTimeout(text.length)

        val existing = engine
        if (existing != null && ready) {
            speakNow(existing)
            return
        }
        engine =
            TextToSpeech(appContext) { status ->
                if (!lifecycle.isActive()) return@TextToSpeech
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
                local.setAudioAttributes(speechAudioAttributes)
                ready = true
                local.setOnUtteranceProgressListener(listener)
                speakNow(local)
            }
    }

    override fun close() {
        val activeAtClose = lifecycle.close()
        val local = engine
        engine = null
        ready = false
        runCatching { local?.stop() }
        if (activeAtClose) finishResources(transitionLifecycle = false)
        releaseAudioFocusIfOwned()
        runCatching { local?.shutdown() }
    }

    private fun scheduleTimeout(textLength: Int) {
        timeoutRunnable?.let(handler::removeCallbacks)
        val timeout =
            Runnable {
                if (!lifecycle.isActive()) return@Runnable
                runCatching { engine?.stop() }
                fail(AuroraSpeechOutputFailure.TIMEOUT)
            }
        timeoutRunnable = timeout
        handler.postDelayed(timeout, timeoutForText(textLength))
    }

    private fun speakNow(local: TextToSpeech) {
        if (!lifecycle.isActive()) return
        val text = pendingText ?: return fail(AuroraSpeechOutputFailure.SPEAK_FAILED)
        val utteranceId = pendingUtteranceId ?: return fail(AuroraSpeechOutputFailure.SPEAK_FAILED)
        if (!acquireAudioFocus()) {
            fail(AuroraSpeechOutputFailure.AUDIO_FOCUS_UNAVAILABLE)
            return
        }
        playbackAnnounced.set(true)
        WakePlaybackAwareness.onTtsStarted(text)
        // close() may win immediately after playback awareness was announced. Recheck before
        // entering the platform engine and undo only this instance's announcement if it lost.
        if (!lifecycle.isActive()) {
            stopPlaybackAwarenessIfOwned()
            releaseAudioFocusIfOwned()
            return
        }
        val status = local.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle(), utteranceId)
        if (status != TextToSpeech.SUCCESS) fail(AuroraSpeechOutputFailure.SPEAK_FAILED)
    }

    private fun acquireAudioFocus(): Boolean {
        if (audioFocusHeld.get()) return true
        val result =
            runCatching { audioManager.requestAudioFocus(audioFocusRequest) }
                .getOrDefault(AudioManager.AUDIOFOCUS_REQUEST_FAILED)
        if (result != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) return false
        audioFocusHeld.set(true)
        if (!lifecycle.isActive()) {
            releaseAudioFocusIfOwned()
            return false
        }
        return true
    }

    private val listener =
        object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit

            override fun onDone(utteranceId: String?) {
                val expected = pendingUtteranceId
                if (expected == null || utteranceId != expected || !lifecycle.isActive()) return
                val callback = completion
                if (!finishResources()) return
                callback?.invoke(
                    AuroraSpeechOutputReceipt(
                        utteranceId = expected,
                        renderedLocally = true,
                    ),
                )
            }

            @Deprecated("Deprecated in Android")
            override fun onError(utteranceId: String?) {
                if (utteranceId == pendingUtteranceId && lifecycle.isActive()) {
                    fail(AuroraSpeechOutputFailure.SPEAK_FAILED)
                }
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                if (utteranceId == pendingUtteranceId && lifecycle.isActive()) {
                    fail(AuroraSpeechOutputFailure.SPEAK_FAILED)
                }
            }
        }

    private fun fail(reason: AuroraSpeechOutputFailure?) {
        if (!lifecycle.isActive()) return
        val callback = failure
        if (!finishResources()) return
        if (reason != null) callback?.invoke(reason)
    }

    /** Returns true only for the terminal callback that atomically wins this utterance. */
    private fun finishResources(transitionLifecycle: Boolean = true): Boolean {
        if (transitionLifecycle && !lifecycle.tryFinish()) return false
        timeoutRunnable?.let(handler::removeCallbacks)
        timeoutRunnable = null
        stopPlaybackAwarenessIfOwned()
        releaseAudioFocusIfOwned()
        pendingText = null
        pendingUtteranceId = null
        completion = null
        failure = null
        ttsLease.releaseIfHeld { AuroraAudioRuntime.arbiter.release(AudioOwner.TTS) }
        return true
    }

    private fun stopPlaybackAwarenessIfOwned() {
        if (playbackAnnounced.compareAndSet(true, false)) {
            WakePlaybackAwareness.onTtsStopped()
        }
    }

    private fun releaseAudioFocusIfOwned() {
        if (audioFocusHeld.compareAndSet(true, false)) {
            runCatching { audioManager.abandonAudioFocusRequest(audioFocusRequest) }
        }
    }

    companion object {
        const val MAX_TEXT_CHARS = 2_048
        private const val BASE_TIMEOUT_MS = 10_000L
        private const val PER_CHARACTER_TIMEOUT_MS = 80L
        private const val MAX_TIMEOUT_MS = 180_000L

        internal fun timeoutForText(textLength: Int): Long {
            require(textLength in 1..MAX_TEXT_CHARS)
            return (BASE_TIMEOUT_MS + textLength * PER_CHARACTER_TIMEOUT_MS)
                .coerceAtMost(MAX_TIMEOUT_MS)
        }
    }
}
