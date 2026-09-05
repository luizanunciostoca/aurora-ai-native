package ai.aurora.device.wake

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import ai.aurora.device.MainActivity

class AuroraVoiceInteractionSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession =
        AuroraVoiceInteractionSession(this)
}

/** Heavy/UI handoff lives in the session process; no business authority is created here. */
private class AuroraVoiceInteractionSession(context: Context) : VoiceInteractionSession(context) {
    override fun onShow(args: Bundle?, showFlags: Int) {
        super.onShow(args, showFlags)
        val wakeId = AuroraVoiceInteractionService.wakeId(args) ?: return
        val intent = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra(MainActivity.EXTRA_WAKE_SESSION_ID, wakeId)
            putExtra(MainActivity.EXTRA_WAKE_CONFIDENCE, AuroraVoiceInteractionService.wakeConfidence(args))
        }
        val launchFailure = runCatching { startAssistantActivity(intent) }.exceptionOrNull()
        if (launchFailure != null) {
            WakeRuntimeStatusStore(context).update(
                state = "WAKE_PLATFORM_BLOCKED",
                lastError = "Assistant activity handoff failed: ${launchFailure.javaClass.simpleName}",
            )
            runCatching { AuroraWakeForegroundService.rearm(context) }
                .onFailure { rearmFailure ->
                    WakeRuntimeStatusStore(context).update(
                        state = "WAKE_PLATFORM_BLOCKED",
                        lastError = "Assistant activity handoff and recovery failed: ${rearmFailure.javaClass.simpleName}",
                    )
                }
            setUiEnabled(false)
            return
        }
        setUiEnabled(false)
    }
}
