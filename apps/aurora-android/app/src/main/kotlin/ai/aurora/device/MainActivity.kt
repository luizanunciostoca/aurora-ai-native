package ai.aurora.device

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.TextView
import ai.aurora.device.bootstrap.GatewayBootstrapSetupActivity
import ai.aurora.device.config.AuroraEnvironment
import ai.aurora.device.ui.AuroraActivityUi
import ai.aurora.device.wake.AuroraWakeModelStore
import ai.aurora.device.wake.WakeRuntimePreferences
import ai.aurora.device.wake.WakeRuntimeStatusStore
import ai.aurora.device.wake.WakeSetupActivity
import ai.aurora.device.wake.WakeSetupUiPolicy

class MainActivity : Activity() {
    private lateinit var aurora: AuroraApplication
    private lateinit var statusView: TextView

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
        statusView = AuroraActivityUi.body(this, centered = true)
        layout.addView(statusView)
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
        renderStatus()
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

    private fun renderStatus() {
        if (!::statusView.isInitialized) return
        val presence = aurora.presenceSnapshot()
        val runtime = WakeRuntimeStatusStore(this).snapshot()
        val wakeEnabled = WakeRuntimePreferences(this).wakeEnabled()
        val modelReady = AuroraWakeModelStore(this).hasValidModel()
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
                append("Runtime: $runtimeLabel")
                errorLabel?.let { append("\nAtenção: $it") }
            }
    }

    private fun presenceLabel(value: String): String =
        when (value) {
            "FOREGROUND" -> "em primeiro plano"
            "BACKGROUND" -> "em segundo plano"
            else -> value.lowercase().replace('_', ' ')
        }
}
