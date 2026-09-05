package ai.aurora.device

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import ai.aurora.device.bootstrap.GatewayBootstrapSetupActivity
import ai.aurora.device.config.AuroraEnvironment
import ai.aurora.device.wake.WakeRuntimeStatusStore
import ai.aurora.device.wake.WakeSetupActivity

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val aurora = application as AuroraApplication
        val presence = aurora.presenceSnapshot()
        val wake = WakeRuntimeStatusStore(this).snapshot()
        val layout =
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(48, 48, 48, 48)
                layoutParams =
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
            }
        layout.addView(
            TextView(this).apply {
                gravity = Gravity.CENTER
                textSize = 20f
                text =
                    buildString {
                        appendLine("Aurora")
                        appendLine(aurora.environmentConfig.environment.name)
                        appendLine("Presence: ${presence.visibility.name}")
                        append("Wake: ${wake.state}")
                    }
            },
        )
        layout.addView(
            Button(this).apply {
                text = "Configurar voz e wake word"
                setOnClickListener {
                    startActivity(Intent(this@MainActivity, WakeSetupActivity::class.java))
                }
            },
        )
        if (
            aurora.environmentConfig.environment == AuroraEnvironment.LOCAL &&
            aurora.environmentConfig.allowCleartextTraffic
        ) {
            layout.addView(
                Button(this).apply {
                    text = "Carregar bootstrap local temporário"
                    setOnClickListener {
                        startActivity(
                            Intent(this@MainActivity, GatewayBootstrapSetupActivity::class.java),
                        )
                    }
                },
            )
        }
        setContentView(layout)
    }
}
