package ai.aurora.device.wake

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * Exported system-only-facing trampoline referenced by VoiceInteractionService metadata.
 *
 * The full WakeSetupActivity intentionally remains non-exported because it accepts internal
 * onboarding actions. This trampoline ignores all external extras and only opens the ordinary,
 * user-driven settings surface.
 */
class AuroraAssistantSettingsActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        runCatching {
            startActivity(Intent(this, WakeSetupActivity::class.java))
        }
        finish()
    }
}