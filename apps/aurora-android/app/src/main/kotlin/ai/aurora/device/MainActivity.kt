package ai.aurora.device

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import ai.aurora.device.bootstrap.GatewayBootstrapSetupActivity
import ai.aurora.device.config.AuroraEnvironment
import ai.aurora.device.ui.AuroraAssistantStage
import ai.aurora.device.ui.AuroraAssistantSurface
import ai.aurora.device.wake.AuroraAssistantRoleCoordinator
import ai.aurora.device.wake.AuroraAssistantSelectionLaunch
import ai.aurora.device.wake.AuroraWakeModelStore
import ai.aurora.device.wake.WakeRuntimePreferences
import ai.aurora.device.wake.WakeRuntimeStatusStore
import ai.aurora.device.wake.WakeSetupActivity
import ai.aurora.device.wake.WakeSetupUiPolicy
import ai.aurora.device.wake.WakeVoiceActivity

class MainActivity : Activity() {
    private lateinit var aurora: AuroraApplication
    private lateinit var surface: AuroraAssistantSurface
    private var assistantFeedback: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        aurora = application as AuroraApplication
        surface = AuroraAssistantSurface.create(this)
        setContentView(surface.root)
        renderStatus()
        renderInvocation(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (::surface.isInitialized) {
            renderStatus()
            renderInvocation(intent)
        }
    }

    override fun onResume() {
        super.onResume()
        if (::surface.isInitialized) {
            surface.root.post {
                renderStatus()
                renderInvocation(intent)
            }
        }
    }

    @Deprecated("RoleManager still returns its user-consent result through the Activity result API")
    override fun onActivityResult(
        requestCode: Int,
        resultCode: Int,
        data: Intent?,
    ) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_ASSISTANT_ROLE) return
        val selected = AuroraAssistantRoleCoordinator.snapshot(this).selected
        assistantFeedback =
            if (selected) {
                "Aurora foi selecionada como assistente padrão deste dispositivo."
            } else {
                "Aurora ainda não foi selecionada. Abra os apps padrão do Android e escolha Aurora como assistente digital."
            }
        renderStatus()
    }

    private fun renderInvocation(currentIntent: Intent?) {
        val transcript = currentIntent?.getStringExtra(EXTRA_LAST_TRANSCRIPT)?.takeIf { it.isNotBlank() }
        val response = currentIntent?.getStringExtra(EXTRA_LAST_RESPONSE)?.takeIf { it.isNotBlank() }
        val fromVoice = currentIntent?.getBooleanExtra(EXTRA_OPENED_FROM_VOICE, false) == true
        val fromSystemAssist = currentIntent?.action == Intent.ACTION_ASSIST

        when {
            transcript != null || response != null -> surface.showConversation(transcript, response)
            fromVoice -> surface.showConversation(null, "Sessão de voz concluída. Estou pronta para continuar.")
            fromSystemAssist -> surface.showConversation(null, "Aurora aberta pelo atalho de assistente do Android.")
            else -> surface.showConversation(null, null)
        }
    }

    private fun renderStatus() {
        val presence = aurora.presenceSnapshot()
        val runtime = WakeRuntimeStatusStore(this).snapshot()
        val preferences = WakeRuntimePreferences(this)
        val wakeEnabled = preferences.wakeEnabled()
        val privacyEnabled = preferences.privacyModeEnabled()
        val modelReady = AuroraWakeModelStore(this).hasValidModel()
        val assistant = AuroraAssistantRoleCoordinator.snapshot(this)
        val runtimeLabel =
            WakeSetupUiPolicy.runtimeLabel(
                state = runtime.state,
                modelReady = modelReady,
                wakeEnabled = wakeEnabled,
            )
        val errorLabel = WakeSetupUiPolicy.userFacingError(runtime.lastError)
        val ready = wakeEnabled && modelReady && assistant.selected && !privacyEnabled

        surface.render(
            if (ready) AuroraAssistantStage.READY else AuroraAssistantStage.DEGRADED,
            detailOverride =
                when {
                    privacyEnabled -> "O modo de privacidade está ativo. Desative-o para usar voz."
                    !modelReady -> "Configure a wake word para eu reconhecer “Aurora”."
                    !assistant.selected -> "Defina Aurora como assistente padrão para usar o atalho do Android."
                    !wakeEnabled -> "Ative a wake word para usar a experiência mãos livres."
                    else -> null
                },
        )

        surface.setDiagnostics(
            buildString {
                append("${aurora.environmentConfig.environment.name}  •  ")
                append(if (presence.visibility.name == "FOREGROUND") "ativa" else "segundo plano")
                append("  •  wake ")
                append(if (wakeEnabled) "on" else "off")
                append("  •  modelo ")
                append(if (modelReady) "pronto" else "pendente")
                append("  •  runtime $runtimeLabel")
                assistantFeedback?.let { append("\n$it") }
                errorLabel?.let { append("\nAtenção: $it") }
            },
        )

        rebuildActions(assistant.selected)
    }

    private fun rebuildActions(assistantSelected: Boolean) {
        surface.clearActions()
        surface.addPrimaryAction("Falar com Aurora") {
            startActivity(
                Intent(this, WakeVoiceActivity::class.java).apply {
                    putExtra(WakeVoiceActivity.EXTRA_SYSTEM_ASSIST_INVOCATION, true)
                },
            )
        }

        if (!assistantSelected) {
            surface.addSecondaryAction("Definir Aurora como assistente padrão") {
                handleAssistantLaunch(
                    AuroraAssistantRoleCoordinator.requestSelection(this, REQUEST_ASSISTANT_ROLE),
                )
            }
            surface.addSecondaryAction("Abrir apps padrão do Android") {
                handleAssistantLaunch(AuroraAssistantRoleCoordinator.openSystemSelection(this))
            }
        }

        surface.addSecondaryAction("Configurar voz e wake word") {
            startActivity(Intent(this, WakeSetupActivity::class.java))
        }

        if (
            aurora.environmentConfig.environment == AuroraEnvironment.LOCAL &&
            aurora.environmentConfig.allowCleartextTraffic
        ) {
            surface.addSecondaryAction("Conectar runtime local") {
                startActivity(Intent(this, GatewayBootstrapSetupActivity::class.java))
            }
        }
    }

    private fun handleAssistantLaunch(result: AuroraAssistantSelectionLaunch) {
        assistantFeedback =
            when (result) {
                AuroraAssistantSelectionLaunch.ALREADY_SELECTED ->
                    "Aurora já é o assistente padrão deste dispositivo."
                AuroraAssistantSelectionLaunch.ROLE_REQUEST ->
                    "Confirme Aurora na tela de seleção do Android."
                AuroraAssistantSelectionLaunch.DEFAULT_APPS_SETTINGS,
                AuroraAssistantSelectionLaunch.VOICE_INPUT_SETTINGS,
                AuroraAssistantSelectionLaunch.GENERAL_SETTINGS,
                -> "Selecione Aurora como assistente digital nas configurações do Android."
                AuroraAssistantSelectionLaunch.FAILED ->
                    "O Android não expôs uma tela de seleção. Abra Configurações > Apps > Apps padrão e escolha Aurora manualmente."
            }
        renderStatus()
    }

    companion object {
        const val EXTRA_OPENED_FROM_VOICE = "ai.aurora.extra.OPENED_FROM_VOICE"
        const val EXTRA_LAST_TRANSCRIPT = "ai.aurora.extra.LAST_TRANSCRIPT"
        const val EXTRA_LAST_RESPONSE = "ai.aurora.extra.LAST_RESPONSE"
        private const val REQUEST_ASSISTANT_ROLE = 1401
    }
}
