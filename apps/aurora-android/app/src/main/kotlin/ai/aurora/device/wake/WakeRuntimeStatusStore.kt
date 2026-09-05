package ai.aurora.device.wake

import android.content.Context

/**
 * Stores bounded operational wake diagnostics only. No PCM, transcript, secret, authority token,
 * business outcome, or retry permission is persisted here.
 */
data class WakeRuntimeStatus(
    val state: String,
    val updatedAtMs: Long,
    val modelVersion: String?,
    val lastError: String?,
    val confirmedWakeCount: Long,
    val rejectedOrIgnoredCount: Long,
)

class WakeRuntimeStatusStore(context: Context) {
    private val preferences =
        context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun snapshot(): WakeRuntimeStatus =
        WakeRuntimeStatus(
            state = preferences.getString(KEY_STATE, "DISABLED") ?: "DISABLED",
            updatedAtMs = preferences.getLong(KEY_UPDATED_AT, 0L),
            modelVersion = preferences.getString(KEY_MODEL_VERSION, null),
            lastError = preferences.getString(KEY_LAST_ERROR, null),
            confirmedWakeCount = preferences.getLong(KEY_CONFIRMED, 0L),
            rejectedOrIgnoredCount = preferences.getLong(KEY_REJECTED, 0L),
        )

    fun update(
        state: String,
        modelVersion: String? = snapshot().modelVersion,
        lastError: String? = null,
    ) {
        require(state.isNotBlank() && state.length <= 96)
        require(modelVersion == null || modelVersion.length <= 64)
        require(lastError == null || lastError.length <= 256)
        val editor =
            preferences
                .edit()
                .putString(KEY_STATE, state)
                .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
        if (modelVersion == null) editor.remove(KEY_MODEL_VERSION) else editor.putString(KEY_MODEL_VERSION, modelVersion)
        if (lastError == null) editor.remove(KEY_LAST_ERROR) else editor.putString(KEY_LAST_ERROR, lastError)
        check(editor.commit())
    }

    fun incrementConfirmed() = increment(KEY_CONFIRMED)

    fun incrementRejectedOrIgnored() = increment(KEY_REJECTED)

    private fun increment(key: String) {
        val next = (preferences.getLong(key, 0L) + 1L).coerceAtLeast(0L)
        check(preferences.edit().putLong(key, next).commit())
    }

    companion object {
        private const val PREFERENCES = "aurora.wake.status.v1"
        private const val KEY_STATE = "state"
        private const val KEY_UPDATED_AT = "updated_at_ms"
        private const val KEY_MODEL_VERSION = "model_version"
        private const val KEY_LAST_ERROR = "last_error"
        private const val KEY_CONFIRMED = "confirmed_wake_count"
        private const val KEY_REJECTED = "rejected_or_ignored_count"
    }
}
