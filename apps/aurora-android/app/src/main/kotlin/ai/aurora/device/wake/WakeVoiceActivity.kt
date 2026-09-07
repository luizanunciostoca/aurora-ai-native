package ai.aurora.device.wake

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.TextView
import ai.aurora.device.MainActivity
import ai.aurora.device.ui.AuroraActivityUi
import ai.aurora.device.voice.BoundedSpeechRecognitionFailure
import ai.aurora.device.voice.BoundedSpeechRecognizer
import ai.aurora.device.voice.WakeVoiceRoute
import ai.aurora.device.voice.WakeVoiceRuntimeRegistry

/**
 * Foreground handoff after an acoustic wake or explicit system-assistant invocation. It makes the
 * accepted W15-G foreground lifecycle gate observable before STT. It does not execute commands or
 * hold authority.
 */
class WakeVoiceActivity : Activity() {
    private lateinit var statusView: TextView
    private lateinit var statusStore: WakeRuntimeStatusStore
    private lateinit var preferences: WakeRuntimePreferences
    private var recognizer: BoundedSpeechRecognizer? = null
    private var started = false
    private var completionRunnable: Runnable? = null
    private var leavingAfterCompletion = false
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        statusStore = WakeRuntimeStatusStore(this)
        preferences = WakeRuntimePreferences(this)

        val screen = AuroraActivityUi.createScrollableScreen(this, maxContentWidthDp = 640)
        screen.content.addView(AuroraActivityUi.heading(this, "Aurora ativa"))
        statusView = AuroraActivityUi.body(this, "Fale agora", centered = true).apply { textSize = 22f }
        screen.content.addView(statusView)
        screen.content.addView(
            AuroraActivityUi.body(
                this,
                "A fala será enviada somente ao fluxo governado de interpretação/autoridade. Esta tela não executa ações diretamente.",
                centered = true,
            ),
        )
        setContentView(screen.root)
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

    override fun onPause() {
        if (!leavingAfterCompletion) {
            val pendingCompletion = completionRunnable != null
            completionRunnable?.let(mainHandler::removeCallbacks)
            completionRunnable = null
            recognizer?.close()
            recognizer = null

            if (!pendingCompletion) {
                statusStore.update(
                    "STT_LIFECYCLE_BLOCKED",
                    lastError = "voice interaction left foreground before completion",
                )
            }

            // A wake/STT interaction temporarily owns the microphone instead of the hotword
            // service. Restore the configured detector while this Activity is still foreground;
            // waiting until onStop/background can make modern Android reject the microphone FGS.
            rearmFromVisibleContext()
            leavingAfterCompletion = true
            if (!isFinishing) finish()
        }
        super.onPause()
    }

    override fun onDestroy() {
        recognizer?.close()
        recognizer = null
        completionRunnable?.let(mainHandler::removeCallbacks)
        completionRunnable = null
        super.onDestroy()
    }

    private fun complete(state: String, display: String) {
        recognizer?.close()
        recognizer = null
        statusStore.update(state)
        statusView.text = display
        scheduleVisibleFinishAndRearm(COMPLETION_DISPLAY_MS)
    }

    private fun scheduleVisibleFinishAndRearm(delayMs: Long) {
        completionRunnable?.let(mainHandler::removeCallbacks)
        val task =
            Runnable {
                completionRunnable = null
                if (isFinishing || isDestroyed) return@Runnable
                // Start the microphone FGS while this Activity is still visibly foreground. Modern
                // Android may reject microphone-FGS starts after finish() moves us to background.
                rearmFromVisibleContext()
                leavingAfterCompletion = true
                openAuroraHome()
                finish()
            }
        completionRunnable = task
        mainHandler.postDelayed(task, delayMs)
    }

    private fun openAuroraHome() {
        val launch =
            Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra(MainActivity.EXTRA_OPENED_FROM_VOICE, true)
            }
        runCatching { startActivity(launch) }
            .onFailure { failure ->
                statusStore.update(
                    "AURORA_UI_HANDOFF_FAILED",
                    lastError = "Aurora home handoff failed: ${failure.javaClass.simpleName}",
                )
            }
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
        const val EXTRA_SYSTEM_ASSIST_INVOCATION = "ai.aurora.extra.SYSTEM_ASSIST_INVOCATION"
        private const val COMPLETION_DISPLAY_MS = 900L
    }
}
