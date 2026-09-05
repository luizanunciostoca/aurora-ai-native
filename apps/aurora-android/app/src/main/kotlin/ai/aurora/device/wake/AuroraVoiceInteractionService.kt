package ai.aurora.device.wake

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession
import java.lang.ref.WeakReference

/** System assistant lifecycle surface. Local wake detection remains in the explicit microphone FGS. */
class AuroraVoiceInteractionService : VoiceInteractionService() {
    override fun onReady() {
        super.onReady()
        active = WeakReference(this)
        setDisabledShowContext(
            VoiceInteractionSession.SHOW_WITH_ASSIST or VoiceInteractionSession.SHOW_WITH_SCREENSHOT,
        )
        restoreConfiguredWake()
    }

    override fun onShutdown() {
        if (active?.get() === this) active = null
        super.onShutdown()
    }

    override fun onDestroy() {
        if (active?.get() === this) active = null
        super.onDestroy()
    }

    private fun restoreConfiguredWake() {
        val preferences = WakeRuntimePreferences(this)
        val status = WakeRuntimeStatusStore(this)
        if (!preferences.wakeEnabled()) return
        if (preferences.privacyModeEnabled()) return status.update("WAKE_PRIVACY_BLOCKED")
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            return status.update("WAKE_PERMISSION_BLOCKED")
        }
        if (!AuroraWakeModelStore(this).hasValidModel()) return status.update("USER_SETUP_REQUIRED")

        if (!AuroraWakeForegroundService.rearmIfConfigured(this)) {
            status.update(
                "WAKE_PLATFORM_BLOCKED",
                lastError = "assistant lifecycle wake re-arm was rejected by the platform",
            )
        }
    }

    companion object {
        private const val EXTRA_WAKE_ID = "ai.aurora.extra.WAKE_ID"
        private const val EXTRA_WAKE_CONFIDENCE = "ai.aurora.extra.WAKE_CONFIDENCE"
        private const val HANDOFF_RECOVERY_MS = 1_800L

        @Volatile
        private var active: WeakReference<AuroraVoiceInteractionService>? = null

        fun requestWakeSession(candidate: WakeCandidate): Boolean {
            val service = active?.get() ?: return false
            val args =
                Bundle().apply {
                    putString(EXTRA_WAKE_ID, candidate.candidateId)
                    putDouble(EXTRA_WAKE_CONFIDENCE, candidate.confidence)
                }
            Handler(Looper.getMainLooper()).post {
                runCatching { service.showSession(args, 0) }
                    .onFailure { failure ->
                        val status = WakeRuntimeStatusStore(service)
                        status.update(
                            "WAKE_PLATFORM_BLOCKED",
                            lastError =
                                "assistant wake-session handoff failed: ${failure.javaClass.simpleName}",
                        )
                        Handler(Looper.getMainLooper()).postDelayed(
                            {
                                if (!AuroraWakeForegroundService.rearmIfConfigured(service)) {
                                    status.update(
                                        "WAKE_PLATFORM_BLOCKED",
                                        lastError =
                                            "assistant wake-session handoff failed and re-arm was rejected",
                                    )
                                }
                            },
                            HANDOFF_RECOVERY_MS,
                        )
                    }
            }
            return true
        }

        internal fun wakeId(args: Bundle?): String? = args?.getString(EXTRA_WAKE_ID)
        internal fun wakeConfidence(args: Bundle?): Double =
            args?.getDouble(EXTRA_WAKE_CONFIDENCE, 0.0) ?: 0.0
    }
}
