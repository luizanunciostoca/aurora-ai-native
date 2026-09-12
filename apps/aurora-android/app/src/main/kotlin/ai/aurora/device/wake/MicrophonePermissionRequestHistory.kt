package ai.aurora.device.wake

import android.content.Context

/** Shared local history for Android's runtime microphone permission prompt. */
internal class MicrophonePermissionRequestHistory(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun attempted(): Boolean = preferences.getBoolean(KEY_ATTEMPTED, false)

    fun markAttempted() {
        preferences.edit().putBoolean(KEY_ATTEMPTED, true).apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "aurora_permission_history"
        const val KEY_ATTEMPTED = "microphone_permission_request_attempted"
    }
}
