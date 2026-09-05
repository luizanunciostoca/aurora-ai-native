package ai.aurora.device.wake

import android.content.Context

/**
 * Device-local wake UX preferences only. These values never represent Aurora policy or action
 * authority. Wake is disabled by default and must be enabled from a visible user interaction.
 */
class WakeRuntimePreferences(context: Context) {
    private val preferences =
        context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun wakeEnabled(): Boolean = preferences.getBoolean(KEY_WAKE_ENABLED, false)

    fun privacyModeEnabled(): Boolean = preferences.getBoolean(KEY_PRIVACY_MODE, false)

    fun sensitivity(): Float =
        preferences
            .getFloat(KEY_SENSITIVITY, WakeSensitivityPolicy.DEFAULT_SENSITIVITY)
            .coerceIn(0.0f, 1.0f)

    fun setWakeEnabled(enabled: Boolean) {
        check(preferences.edit().putBoolean(KEY_WAKE_ENABLED, enabled).commit())
    }

    fun setPrivacyModeEnabled(enabled: Boolean) {
        check(preferences.edit().putBoolean(KEY_PRIVACY_MODE, enabled).commit())
    }

    fun setSensitivity(value: Float) {
        require(value in 0.0f..1.0f)
        check(preferences.edit().putFloat(KEY_SENSITIVITY, value).commit())
    }

    companion object {
        private const val PREFERENCES = "aurora.wake.runtime.v1"
        private const val KEY_WAKE_ENABLED = "wake_enabled"
        private const val KEY_PRIVACY_MODE = "privacy_mode"
        private const val KEY_SENSITIVITY = "sensitivity"
    }
}
