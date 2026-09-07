package ai.aurora.device.wake

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService

class AuroraVoiceInteractionSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession =
        AuroraVoiceInteractionSession(this)
}

/** System-approved assistant handoff only; this session never owns business authority. */
private class AuroraVoiceInteractionSession(context: Context) : VoiceInteractionSession(context) {
    override fun onPrepareShow(args: Bundle?, showFlags: Int) {
        // This implementation uses a dedicated assistant Activity for the visible interaction.
        // Disable the otherwise-empty session window before show, as required by the platform API.
        setUiEnabled(false)
        super.onPrepareShow(args, showFlags)
    }

    override fun onShow(args: Bundle?, showFlags: Int) {
        super.onShow(args, showFlags)
        val wakeId = AuroraVoiceInteractionService.wakeId(args)
        val intent =
            Intent(context, WakeVoiceActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP,
                )
                if (wakeId != null) {
                    putExtra(WakeVoiceActivity.EXTRA_WAKE_ID, wakeId)
                    putExtra(
                        WakeVoiceActivity.EXTRA_WAKE_CONFIDENCE,
                        AuroraVoiceInteractionService.wakeConfidence(args),
                    )
                } else {
                    // A system gesture/power-button invocation has no Aurora-internal wake id.
                    // It is still a legitimate user-initiated assistant session and may open the
                    // same bounded STT surface without manufacturing wake evidence.
                    putExtra(WakeVoiceActivity.EXTRA_SYSTEM_ASSIST_INVOCATION, true)
                }
            }
        runCatching { startAssistantActivity(intent) }
            .onFailure { failure ->
                val status = WakeRuntimeStatusStore(context)
                status.update(
                    "WAKE_PLATFORM_BLOCKED",
                    lastError = "assistant activity handoff failed: ${failure.javaClass.simpleName}",
                )
                if (!AuroraWakeForegroundService.rearmIfConfigured(context)) {
                    status.update(
                        "WAKE_PLATFORM_BLOCKED",
                        lastError = "assistant activity handoff failed and wake re-arm was rejected",
                    )
                }
            }
    }
}
