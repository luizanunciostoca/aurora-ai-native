package ai.aurora.device.wake

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import ai.aurora.device.AuroraApplication
import ai.aurora.device.MainActivity
import ai.aurora.device.executor.DeviceExecutionOutcome
import ai.aurora.device.executor.W15JDeviceCommandConsumptionResult
import ai.aurora.device.ui.AuroraAssistantResponseComposer
import ai.aurora.device.ui.AuroraAssistantStage
import ai.aurora.device.ui.AuroraAssistantSurface
import ai.aurora.device.voice.AuroraTextToSpeechOutput
import ai.aurora.device.voice.BoundedSpeechRecognitionFailure
import ai.aurora.device.voice.BoundedSpeechRecognizer
import ai.aurora.device.voice.SingleFlightWorkDispatcher
import ai.aurora.device.voice.WakeVoiceRoute
import ai.aurora.device.voice.WakeVoiceRuntimeRegistry

/**
 * Foreground handoff after an acoustic wake or explicit system-assistant invocation. It makes the
 * accepted W15-G foreground lifecycle gate observable before STT. It never grants authority; an
 * accepted deterministic candidate may be handed to the separately governed W15-J consumer.
 */
class WakeVoiceActivity : Activity() {
    private lateinit var surface: AuroraAssistantSurface
    private lateinit var statusStore: WakeRuntimeStatusStore
    private lateinit var preferences: WakeRuntimePreferences
    private var recognizer: BoundedSpeechRecognizer? = null
    private var speechOutput: AuroraTextToSpeechOutput? = null
    private var started = false
    private var completionRunnable: Runnable? = null
    private var leavingAfterCompletion = false
    private var lastTranscript: String? = null
    private var lastResponse: String? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private val governedWork = SingleFlightWorkDispatcher()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        statusStore = WakeRuntimeStatusStore(this)
        preferences = WakeRuntimePreferences(this)
        surface = AuroraAssistantSurface.create(this)
        surface.clearActions()
        surface.render(AuroraAssistantStage.LISTENING)
        surface.setStatusLine("Microfone ativo  •  Wake pausado durante a conversa")
        surface.setDiagnostics("Voz local • STT limitado • autoridade e execução permanecem governadas")
        setContentView(surface.root)
    }

    override fun onResume() {
        super.onResume()
        if (started) return
        started = true
        if (preferences.privacyModeEnabled()) {
            complete(
                state = "VOICE_PRIVACY_BLOCKED",
                display = "O modo de privacidade está ativo. Não usei o microfone.",
                stage = AuroraAssistantStage.BLOCKED,
            )
            return
        }
        statusStore.update("STT_LISTENING")
        surface.render(AuroraAssistantStage.LISTENING)
        recognizer =
            BoundedSpeechRecognizer(
                context = this,
                privacyBlocked = preferences::privacyModeEnabled,
            ).also { capture ->
                capture.start(
                    onResult = { result ->
                        runOnUiThread {
                            if (isFinishing || isDestroyed) return@runOnUiThread
                            lastTranscript = result.transcript
                            surface.showConversation(result.transcript, null)
                            surface.render(AuroraAssistantStage.UNDERSTANDING)
                            surface.setStatusLine("Processando sua solicitação…")
                        }
                        dispatchGovernedVoiceTurn(
                            transcript = result.transcript,
                            transcriptConfidence = result.confidence,
                        )
                    },
                    onFailure = { failure ->
                        runOnUiThread {
                            if (isFinishing || isDestroyed) return@runOnUiThread
                            complete(
                                state = "STT_${failure.name}",
                                display = failureMessage(failure),
                                stage = AuroraAssistantStage.BLOCKED,
                            )
                        }
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
            speechOutput?.close()
            speechOutput = null

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
        speechOutput?.close()
        speechOutput = null
        completionRunnable?.let(mainHandler::removeCallbacks)
        completionRunnable = null
        // Do not interrupt an in-flight governed effect. The worker rejects new turns immediately
        // and lets the already-started W07/W14/W15 path reach its own receipt/reconciliation state.
        governedWork.close()
        super.onDestroy()
    }

    private fun dispatchGovernedVoiceTurn(
        transcript: String,
        transcriptConfidence: Double?,
    ) {
        val accepted =
            governedWork.submit(
                operation = {
                    val route =
                        WakeVoiceRuntimeRegistry.route(
                            activity = this,
                            transcript = transcript,
                            transcriptConfidence = transcriptConfidence,
                        )
                    when (route) {
                        is WakeVoiceRoute.ConversationFallback ->
                            GovernedVoiceTurnWorkResult.Fallback(route)
                        is WakeVoiceRoute.AuthoritySubmitted -> {
                            val application = application as? AuroraApplication
                            val consumption =
                                if (application == null) {
                                    W15JDeviceCommandConsumptionResult.NoEffect(
                                        reason = "governed device consumer is unavailable",
                                    )
                                } else {
                                    runCatching {
                                        application.consumeLocalGovernedDeviceCommand(
                                            route.dispatch.commandId,
                                        )
                                    }.getOrElse {
                                        W15JDeviceCommandConsumptionResult.NoEffect(
                                            reason =
                                                "governed device consumer raised before confirmed effect",
                                            requiresReconciliation = true,
                                        )
                                    }
                                }
                            GovernedVoiceTurnWorkResult.Authority(route, consumption)
                        }
                    }
                },
                onComplete = { work ->
                    runOnUiThread {
                        if (isFinishing || isDestroyed) return@runOnUiThread
                        when (work) {
                            is GovernedVoiceTurnWorkResult.Fallback ->
                                complete(
                                    state = "VOICE_FALLBACK_${work.route.reason.name}",
                                    display = AuroraAssistantResponseComposer.fallback(work.route),
                                    stage = AuroraAssistantStage.DEGRADED,
                                )
                            is GovernedVoiceTurnWorkResult.Authority ->
                                handleGovernedConsumption(work.route, work.consumption)
                        }
                    }
                },
                onFailure = { failure ->
                    runOnUiThread {
                        if (isFinishing || isDestroyed) return@runOnUiThread
                        complete(
                            state = "VOICE_ROUTE_FAILED",
                            display = "Não consegui concluir essa solicitação agora.",
                            stage = AuroraAssistantStage.DEGRADED,
                        )
                        surface.setDiagnostics(
                            "Voice route failure: ${failure.javaClass.simpleName}",
                        )
                    }
                },
            )

        if (!accepted) {
            statusStore.update(
                "VOICE_DUPLICATE_TURN_IGNORED",
                lastError = "a governed voice turn is already in flight",
            )
        }
    }

    private fun handleGovernedConsumption(
        route: WakeVoiceRoute.AuthoritySubmitted,
        consumption: W15JDeviceCommandConsumptionResult,
    ) {
        surface.render(AuroraAssistantStage.ACTING)
        surface.setStatusLine("Executando com segurança…")
        when (consumption) {
            is W15JDeviceCommandConsumptionResult.NoEffect ->
                complete(
                    if (consumption.requiresReconciliation) {
                        "W15_DEVICE_NO_EFFECT_RECONCILIATION_REQUIRED"
                    } else {
                        "W15_DEVICE_NO_EFFECT"
                    },
                    AuroraAssistantResponseComposer.unavailableAction(
                        consumption.requiresReconciliation,
                    ),
                    AuroraAssistantStage.DEGRADED,
                )
            is W15JDeviceCommandConsumptionResult.Executed ->
                when (consumption.outcome) {
                    DeviceExecutionOutcome.SUCCEEDED ->
                        complete(
                            "W15_DEVICE_LOCAL_EFFECT_OBSERVED",
                            AuroraAssistantResponseComposer.successForCapability(
                                route.dispatch.capabilityId,
                            ),
                            AuroraAssistantStage.COMPLETED,
                        )
                    DeviceExecutionOutcome.FAILED ->
                        complete(
                            "W15_DEVICE_LOCAL_EFFECT_FAILED",
                            AuroraAssistantResponseComposer.failedAction(),
                            AuroraAssistantStage.BLOCKED,
                        )
                    DeviceExecutionOutcome.EXECUTION_UNCERTAIN ->
                        complete(
                            "W15_DEVICE_EXECUTION_UNCERTAIN",
                            AuroraAssistantResponseComposer.uncertainAction(),
                            AuroraAssistantStage.BLOCKED,
                        )
                }
        }
    }

    private fun complete(
        state: String,
        display: String,
        stage: AuroraAssistantStage,
    ) {
        recognizer?.close()
        recognizer = null
        statusStore.update(state)
        lastResponse = display
        surface.showConversation(lastTranscript, display)
        surface.render(stage)
        surface.setStatusLine(if (stage == AuroraAssistantStage.COMPLETED) "Concluído" else "")
        speakAndFinish(display, stage)
    }

    private fun speakAndFinish(
        display: String,
        finalStage: AuroraAssistantStage,
    ) {
        speechOutput?.close()
        val output = AuroraTextToSpeechOutput(this)
        speechOutput = output
        surface.render(AuroraAssistantStage.SPEAKING, detailOverride = display)
        surface.setStatusLine("Respondendo por voz…")
        output.speak(
            text = display,
            onComplete = {
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    speechOutput?.close()
                    speechOutput = null
                    surface.render(finalStage)
                    surface.showConversation(lastTranscript, display)
                    scheduleVisibleFinishAndRearm(COMPLETION_DISPLAY_MS)
                }
            },
            onFailure = {
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    speechOutput?.close()
                    speechOutput = null
                    surface.render(finalStage)
                    surface.showConversation(lastTranscript, display)
                    scheduleVisibleFinishAndRearm(COMPLETION_DISPLAY_MS)
                }
            },
        )
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
                lastTranscript?.let { putExtra(MainActivity.EXTRA_LAST_TRANSCRIPT, it) }
                lastResponse?.let { putExtra(MainActivity.EXTRA_LAST_RESPONSE, it) }
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
            BoundedSpeechRecognitionFailure.ALREADY_ACTIVE -> "O reconhecimento de voz já está ativo."
            BoundedSpeechRecognitionFailure.PRIVACY_BLOCKED -> "O modo de privacidade bloqueou o microfone."
            BoundedSpeechRecognitionFailure.MICROPHONE_PERMISSION_REQUIRED ->
                "Preciso da permissão de microfone para ouvir você."
            BoundedSpeechRecognitionFailure.RECOGNIZER_UNAVAILABLE ->
                "O reconhecimento de voz está indisponível neste dispositivo."
            BoundedSpeechRecognitionFailure.AUDIO_OWNERSHIP_UNAVAILABLE ->
                "O áudio está ocupado por outro fluxo. Tente novamente em instantes."
            BoundedSpeechRecognitionFailure.TIMEOUT -> "Não ouvi um pedido dentro do tempo esperado."
            BoundedSpeechRecognitionFailure.NO_MATCH -> "Não entendi com confiança suficiente. Pode repetir?"
            BoundedSpeechRecognitionFailure.RECOGNIZER_ERROR -> "O reconhecimento de voz encontrou uma falha."
        }

    companion object {
        const val EXTRA_WAKE_ID = "ai.aurora.extra.WAKE_ID"
        const val EXTRA_WAKE_CONFIDENCE = "ai.aurora.extra.WAKE_CONFIDENCE"
        const val EXTRA_SYSTEM_ASSIST_INVOCATION = "ai.aurora.extra.SYSTEM_ASSIST_INVOCATION"
        private const val COMPLETION_DISPLAY_MS = 1_100L
    }
}

private sealed interface GovernedVoiceTurnWorkResult {
    data class Fallback(
        val route: WakeVoiceRoute.ConversationFallback,
    ) : GovernedVoiceTurnWorkResult

    data class Authority(
        val route: WakeVoiceRoute.AuthoritySubmitted,
        val consumption: W15JDeviceCommandConsumptionResult,
    ) : GovernedVoiceTurnWorkResult
}
