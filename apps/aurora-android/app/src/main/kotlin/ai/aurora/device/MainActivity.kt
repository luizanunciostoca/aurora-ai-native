package ai.aurora.device

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import ai.aurora.device.bootstrap.GatewayBootstrapSetupActivity
import ai.aurora.device.config.AuroraEnvironment
import ai.aurora.device.ui.AuroraActivityUi
import ai.aurora.device.wake.AuroraAssistantRoleCoordinator
import ai.aurora.device.wake.AuroraAssistantSelectionLaunch
import ai.aurora.device.wake.AuroraWakeModelStore
import ai.aurora.device.wake.WakeRuntimePreferences
import ai.aurora.device.wake.WakeRuntimeStatusStore
import ai.aurora.device.wake.WakeSetupActivity
import ai.aurora.device.wake.WakeSetupUiPolicy

class MainActivity : Activity() {
    private lateinit var aurora: AuroraApplication
    private lateinit var interactionView: TextView
    private lateinit var statusView: TextView
    private lateinit var assistantButton: Button
    private lateinit var assistantSettingsButton: Button
    private var assistantFeedback: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        aurora = application as AuroraApplication

        val screen = AuroraActivityUi.createScrollableScreen(this)
        val layout = screen.content
        layout.addView(AuroraActivityUi.heading(this, "Aurora"))
        layout.addView(
            AuroraActivityUi.body(
                this,
                "Assistente local no tablet. Estados de dispositivo e voz são precondições/evidência; autoridade continua no plano governado.",
                centered = true,
            ),
        )
        interactionView = AuroraActivityUi.body(this, centered = true)
        layout.addView(interactionView)
        statusView = AuroraActivityUi.body(this, centered = true)
        layout.addView(statusView)

        assistantButton =
            AuroraActivityUi.actionButton(this, "Definir Aurora como assistente padrão") {
                handleAssistantLaunch(
                    AuroraAssistantRoleCoordinator.requestSelection(this, REQUEST_ASSISTANT_ROLE),
                )
            }
        assistantSettingsButton =
            AuroraActivityUi.actionButton(this, "Abrir apps padrão do Android") {
                handleAssistantLaunch(AuroraAssistantRoleCoordinator.openSystemSelection(this))
            }
        layout.addView(assistantButton)
        layout.addView(assistantSettingsButton)

        layout.addView(
            AuroraActivityUi.actionButton(this, "Configurar voz e wake word") {
                startActivity(Intent(this@MainActivity, WakeSetupActivity::class.java))
            },
        )
        if (
            aurora.environmentConfig.environment == AuroraEnvironment.LOCAL &&
            aurora.environmentConfig.allowCleartextTraffic
        ) {
            layout.addView(
                AuroraActivityUi.actionButton(this, "Carregar bootstrap local temporário") {
                    startActivity(
                        Intent(this@MainActivity, GatewayBootstrapSetupActivity::class.java),
                    )
                },
            )
        }
        setContentView(screen.root)
        renderInvocation(intent)
        renderStatus()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (::interactionView.isInitialized) renderInvocation(intent)
    }

    override fun onResume() {
        super.onResume()
        if (::statusView.isInitialized) {
            // ActivityLifecycleCallbacks publish FOREGROUND after the Activity resume callback.
            // Render once on the next UI turn so the visible screen does not remain stuck on the
            // pre-resume BACKGROUND snapshot seen during physical tablet testing.
            statusView.post { renderStatus() }
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
                "Aurora ainda não foi selecionada. Use “Abrir apps padrão do Android” e escolha Aurora como assistente digital."
            }
        renderStatus()
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
                    "O Android não expôs uma tela de seleção de assistente. Abra Configurações > Apps > Apps padrão e selecione Aurora manualmente."
            }
        renderStatus()
    }

    private fun renderInvocation(currentIntent: Intent?) {
        val fromVoice = currentIntent?.getBooleanExtra(EXTRA_OPENED_FROM_VOICE, false) == true
        val fromSystemAssist = currentIntent?.action == Intent.ACTION_ASSIST
        interactionView.text =
            when {
                fromVoice ->
                    "Sessão de voz concluída. A interface da Aurora permaneceu aberta para continuar a interação."
                fromSystemAssist ->
                    "Aurora aberta pelo atalho de assistente do Android."
                else -> ""
            }
    }

    private fun renderStatus() {
        if (!::statusView.isInitialized) return
        val presence = aurora.presenceSnapshot()
        val runtime = WakeRuntimeStatusStore(this).snapshot()
        val wakeEnabled = WakeRuntimePreferences(this).wakeEnabled()
        val modelReady = AuroraWakeModelStore(this).hasValidModel()
        val assistant = AuroraAssistantRoleCoordinator.snapshot(this)
        val runtimeLabel =
            WakeSetupUiPolicy.runtimeLabel(
                state = runtime.state,
                modelReady = modelReady,
                wakeEnabled = wakeEnabled,
            )
        val errorLabel = WakeSetupUiPolicy.userFacingError(runtime.lastError)

        statusView.text =
            buildString {
                appendLine("Ambiente: ${aurora.environmentConfig.environment.name}")
                appendLine("Presença: ${presenceLabel(presence.visibility.name)}")
                appendLine("Wake word: ${if (wakeEnabled) "ativado" else "desativado"}")
                appendLine("Modelo local: ${if (modelReady) "pronto" else "não treinado"}")
                appendLine("Assistente padrão: ${if (assistant.selected) "Aurora" else "não"}")
                append("Runtime: $runtimeLabel")
                assistantFeedback?.let { append("\n$it") }
                errorLabel?.let { append("\nAtenção: $it") }
            }

        assistantButton.text =
            if (assistant.selected) {
                "Aurora já é o assistente padrão"
            } else {
                "Definir Aurora como assistente padrão"
            }
        assistantButton.isEnabled = !assistant.selected
        assistantSettingsButton.isEnabled = !assistant.selected
    }

    private fun presenceLabel(value: String): String =
        when (value) {
            "FOREGROUND" -> "em primeiro plano"
            "BACKGROUND" -> "em segundo plano"
            else -> value.lowercase().replace('_', ' ')
        }

    companion object {
        const val EXTRA_OPENED_FROM_VOICE = "ai.aurora.extra.OPENED_FROM_VOICE"
        private const val REQUEST_ASSISTANT_ROLE = 1401
    }
}
