package ai.aurora.device.ui

import android.content.Context

/** Local UI preference only. Enabling diagnostics never changes authority or execution behavior. */
class AuroraDeveloperModePreferences(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun enabled(): Boolean = preferences.getBoolean(KEY_ENABLED, false)

    fun setEnabled(enabled: Boolean) {
        preferences.edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "aurora_developer_mode"
        const val KEY_ENABLED = "enabled"
    }
}
