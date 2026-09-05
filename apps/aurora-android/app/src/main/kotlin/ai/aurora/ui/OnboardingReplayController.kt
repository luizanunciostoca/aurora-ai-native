package ai.aurora.ui

import android.app.Activity
import android.content.Context

class OnboardingReplayController(
    private val context: Context,
) {
    fun replayWithoutResettingDeviceTrust(): Boolean {
        context.applicationContext
            .getSharedPreferences(UI_PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ONBOARDING_COMPLETE, false)
            .apply()

        val activity = context as? Activity ?: return false
        activity.recreate()
        return true
    }

    companion object {
        private const val UI_PREFERENCES = "aurora.ui.v1"
        private const val KEY_ONBOARDING_COMPLETE = "onboarding_complete"
    }
}
