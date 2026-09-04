package ai.aurora.device

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val aurora = application as AuroraApplication
        val presence = aurora.presenceSnapshot()
        setContentView(
            TextView(this).apply {
                gravity = Gravity.CENTER
                textSize = 20f
                text =
                    buildString {
                        appendLine("Aurora")
                        appendLine(aurora.environmentConfig.environment.name)
                        append("Presence: ${presence.visibility.name}")
                    }
            },
        )
    }
}
