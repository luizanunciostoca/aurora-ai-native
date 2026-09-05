package ai.aurora.device.wake

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.TextView
import ai.aurora.device.voice.BoundedSpeechRecognitionFailure
import ai.aurora.device.voice.BoundedSpeechRecognizer
import ai.aurora.device.voice.WakeVoiceRoute
import ai.aurora.device.voice.WakeVoiceRuntimeRegistry

/**
 * Foreground handoff after an acoustic wake. It makes the accepted W15-G foreground lifecycle gate
 * observable before STT. It does not execute commands or hold authority.
 */
class WakeVoiceActivity : Activity() {
    private lateinit var statusView: TextView
    private lateinit var statusStore: WakeRuntimeStatusStore
    private lateinit var preferences: WakeRuntimePreferences
    private var recognizer: BoundedSpeechRecognizer? = null
    private var started = false
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        statusStore = WakeRuntimeStatusStore(this)
        preferences = WakeRuntimePreferences(this)
        statusView =
            TextView(this).apply {
                textSize = 22f
                setPadding(48, 72, 48, 48)
                text = "Aurora ativa — fale agora"
            }
        setContentView(statusView)
    }

    override fun onResume() {
        super.onResume()
        if (started) return
        started = true
        if (preferences.privacyModeEnabled()) {
            complete("VOICE_PRIVACY_BLOCKED", "Privacidade ativa")
            return
        }
        statusStore.update("STT_LISTENING")
        recognizer =
            BoundedSpeechRecognizer(
                context = this,
                privacyBlocked = preferences::privacyModeEnabled,
            ).also { capture ->
                capture.start(
                    onResult = { result ->
                        val route =
                            WakeVoiceRuntimeRegistry.route(
                                activity = this,
                                transcript = result.transcript,
                                transcriptConfidence = result.confidence,
                            )
                        when (route) {
                            is WakeVoiceRoute.AuthoritySubmitted ->
                                complete(
                                    "W07_EVALUATION_SUBMITTED",
                                    "Comando enviado apenas para avaliação de autoridade",
                                )
                            is WakeVoiceRoute.ConversationFallback ->
                                complete(
                                    "VOICE_FALLBACK_${route.reason.name}",
                                    "Encaminhamento seguro: ${route.reason.name}",
                                )
                        }
                    },
                    onFailure = { failure ->
                        complete(
                            "STT_${failure.name}",
                            failureMessage(failure),
                        )
                    },
                )
            }
    }

    override fun onDestroy() {
        recognizer?.close()
        recognizer = null
        super.onDestroy()
    }

    private fun complete(state: String, display: String) {
        statusStore.update(state)
        statusView.text = display
        mainHandler.postDelayed(
            {
                if (!isFinishing) finish()
                rearmFromVisibleContext()
            },
            COMPLETION_DISPLAY_MS,
        )
    }

    private fun rearmFromVisibleContext() {
        if (!preferences.wakeEnabled() || preferences.privacyModeEnabled()) return
        if (!AuroraWakeModelStore(this).hasValidModel()) return
        runCatching {
            startForegroundService(
                Intent(this, AuroraWakeForegroundService::class.java).setAction(
                    AuroraWakeForegroundService.ACTION_ARM,
                ),
            )
        }.onFailure { failure ->
            statusStore.update(
                "WAKE_PLATFORM_BLOCKED",
                lastError = "wake re-arm failed: ${failure.javaClass.simpleName}",
            )
        }
    }

    private fun failureMessage(failure: BoundedSpeechRecognitionFailure): String =
        when (failure) {
            BoundedSpeechRecognitionFailure.ALREADY_ACTIVE -> "Reconhecimento já está ativo"
            BoundedSpeechRecognitionFailure.PRIVACY_BLOCKED -> "Privacidade bloqueou o microfone"
            BoundedSpeechRecognitionFailure.MICROPHONE_PERMISSION_REQUIRED ->
                "Permissão de microfone necessária"
            BoundedSpeechRecognitionFailure.RECOGNIZER_UNAVAILABLE ->
                "Reconhecimento de voz indisponível"
            BoundedSpeechRecognitionFailure.AUDIO_OWNERSHIP_UNAVAILABLE ->
                "Áudio ocupado por outro fluxo"
            BoundedSpeechRecognitionFailure.TIMEOUT -> "Tempo de fala esgotado"
            BoundedSpeechRecognitionFailure.NO_MATCH -> "Não entendi com confiança suficiente"
            BoundedSpeechRecognitionFailure.RECOGNIZER_ERROR -> "Falha do reconhecimento de voz"
        }

    companion object {
        const val EXTRA_WAKE_ID = "ai.aurora.extra.WAKE_ID"
        const val EXTRA_WAKE_CONFIDENCE = "ai.aurora.extra.WAKE_CONFIDENCE"
        private const val COMPLETION_DISPLAY_MS = 900L
    }
}
