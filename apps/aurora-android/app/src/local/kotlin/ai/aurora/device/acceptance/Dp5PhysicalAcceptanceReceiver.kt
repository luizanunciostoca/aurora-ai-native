package ai.aurora.device.acceptance

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import ai.aurora.device.AuroraApplication
import ai.aurora.device.capability.LocalPhysicalAcceptanceOverrides
import java.util.UUID

class Dp5PhysicalAcceptanceReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        Thread {
            val result = runCatching { execute(context, intent) }.getOrElse { "REJECTED" }
            pending.resultCode = if (result.endsWith("PASS")) Activity.RESULT_OK else Activity.RESULT_CANCELED
            pending.resultData = result
            pending.finish()
        }.start()
    }

    private fun execute(context: Context, intent: Intent): String {
        val app = context.applicationContext as AuroraApplication
        return when (intent.getStringExtra("operation")) {
            "SESSION_REVOKE" -> if (app.dp5RevokeCurrentSession()) "SESSION_REVOKE_PASS" else "SESSION_REVOKE_REJECTED"
            "SESSION_ROTATE" -> {
                val next = "dvs-dp5-" + UUID.randomUUID().toString().replace("-", "")
                if (app.dp5RotateCurrentSession(next)) "SESSION_ROTATE_PASS" else "SESSION_ROTATE_REJECTED"
            }
            "CAPABILITY_STALE" -> {
                val capabilityId = intent.getStringExtra("capabilityId") ?: return "CAPABILITY_STALE_REJECTED"
                LocalPhysicalAcceptanceOverrides.setStaleCapability(context, capabilityId)
                "CAPABILITY_STALE_PASS"
            }
            "CAPABILITY_CURRENT" -> {
                LocalPhysicalAcceptanceOverrides.setStaleCapability(context, null)
                "CAPABILITY_CURRENT_PASS"
            }
            else -> "UNKNOWN_OPERATION_REJECTED"
        }
    }
}
