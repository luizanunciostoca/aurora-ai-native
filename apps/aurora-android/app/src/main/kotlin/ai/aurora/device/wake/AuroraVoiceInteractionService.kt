package ai.aurora.device.wake

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession
import java.lang.ref.WeakReference

/** Lightweight system lifecycle surface. Detection remains in the explicitly configured local engine. */
class AuroraVoiceInteractionService : VoiceInteractionService() {
    override fun onReady() {
        super.onReady()
        active = WeakReference(this)
        // The wake handoff does not need current-app screenshots or assist structure by default.
        setDisabledShowContext(
            VoiceInteractionSession.SHOW_WITH_ASSIST or VoiceInteractionSession.SHOW_WITH_SCREENSHOT,
        )
        restoreConfiguredWakeFromAssistantLifecycle()
    }

    override fun onShutdown() {
        if (active?.get() === this) active = null
        super.onShutdown()
    }

    override fun onDestroy() {
        if (active?.get() === this) active = null
        super.onDestroy()
    }

    private fun restoreConfiguredWakeFromAssistantLifecycle() {
        val preferences = getSharedPreferences(UI_PREFERENCES, Context.MODE_PRIVATE)
        if (!preferences.getBoolean(KEY_WAKE_PREFERENCE, false)) return
        if (preferences.getBoolean(KEY_PRIVACY_MODE, false)) {
            WakeRuntimeStatusStore(this).update("WAKE_PRIVACY_BLOCKED")
            return
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            WakeRuntimeStatusStore(this).update("WAKE_PERMISSION_BLOCKED")
            return
        }
        if (!AuroraWakeModelStore(this).hasValidModel()) {
            WakeRuntimeStatusStore(this).update("USER_SETUP_REQUIRED")
            return
        }

        // Android treats the selected VoiceInteractionService as an allowed lifecycle origin for
        // microphone foreground-service startup. This is not a BOOT_COMPLETED bypass and does not
        // create Aurora business/action authority; the FGS still revalidates all local preconditions.
        runCatching { AuroraWakeForegroundService.armFromVisibleContext(this) }
            .onFailure { failure ->
                WakeRuntimeStatusStore(this).update(
                    state = "WAKE_PLATFORM_BLOCKED",
                    lastError = "Assistant lifecycle re-arm failed: ${failure.javaClass.simpleName}",
                )
            }
    }

    companion object {
        private const val EXTRA_WAKE_ID = "ai.aurora.extra.WAKE_ID"
        private const val EXTRA_WAKE_CONFIDENCE = "ai.aurora.extra.WAKE_CONFIDENCE"
        private const val EXTRA_WAKE_SOURCE = "ai.aurora.extra.WAKE_SOURCE"
        private const val UI_PREFERENCES = "aurora.ui.v1"
        private const val KEY_WAKE_PREFERENCE = "wake_preference"
        private const val KEY_PRIVACY_MODE = "privacy_mode"

        @Volatile
        private var active: WeakReference<AuroraVoiceInteractionService>? = null

        fun isConfiguredAsAssistant(context: Context): Boolean =
            isActiveService(
                context,
                ComponentName(context, AuroraVoiceInteractionService::class.java),
            )

        fun requestWakeSession(candidate: WakeCandidate): Boolean {
            val service = active?.get() ?: return false
            val args = Bundle().apply {
                putString(EXTRA_WAKE_ID, candidate.candidateId)
                putDouble(EXTRA_WAKE_CONFIDENCE, candidate.confidence)
                putString(EXTRA_WAKE_SOURCE, "local_hotword")
            }
            Handler(Looper.getMainLooper()).post {
                runCatching { service.showSession(args, 0) }
                    .onFailure { failure ->
                        WakeRuntimeStatusStore(service).update(
                            state = "WAKE_PLATFORM_BLOCKED",
                            lastError = "Assistant wake-session handoff failed: ${failure.javaClass.simpleName}",
                        )
                        runCatching { AuroraWakeForegroundService.rearm(service) }
                            .onFailure { rearmFailure ->
                                WakeRuntimeStatusStore(service).update(
                                    state = "WAKE_PLATFORM_BLOCKED",
                                    lastError = "Wake handoff and recovery failed: ${rearmFailure.javaClass.simpleName}",
                                )
                            }
                    }
            }
            return true
        }

        internal fun wakeId(args: Bundle?): String? = args?.getString(EXTRA_WAKE_ID)
        internal fun wakeConfidence(args: Bundle?): Double = args?.getDouble(EXTRA_WAKE_CONFIDENCE, 0.0) ?: 0.0
    }
}
