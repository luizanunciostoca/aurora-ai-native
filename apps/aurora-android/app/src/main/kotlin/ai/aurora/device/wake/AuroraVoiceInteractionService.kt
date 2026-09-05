package ai.aurora.device.wake

import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession
import java.lang.ref.WeakReference

/** Lightweight system lifecycle surface. Detection remains in the explicitly armed local engine. */
class AuroraVoiceInteractionService : VoiceInteractionService() {
    override fun onReady() {
        super.onReady()
        active = WeakReference(this)
        // The wake handoff does not need current-app screenshots or assist structure by default.
        setDisabledShowContext(
            VoiceInteractionSession.SHOW_WITH_ASSIST or VoiceInteractionSession.SHOW_WITH_SCREENSHOT,
        )
    }

    override fun onShutdown() {
        if (active?.get() === this) active = null
        super.onShutdown()
    }

    override fun onDestroy() {
        if (active?.get() === this) active = null
        super.onDestroy()
    }

    companion object {
        private const val EXTRA_WAKE_ID = "ai.aurora.extra.WAKE_ID"
        private const val EXTRA_WAKE_CONFIDENCE = "ai.aurora.extra.WAKE_CONFIDENCE"
        private const val EXTRA_WAKE_SOURCE = "ai.aurora.extra.WAKE_SOURCE"

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
            }
            return true
        }

        internal fun wakeId(args: Bundle?): String? = args?.getString(EXTRA_WAKE_ID)
        internal fun wakeConfidence(args: Bundle?): Double = args?.getDouble(EXTRA_WAKE_CONFIDENCE, 0.0) ?: 0.0
    }
}
