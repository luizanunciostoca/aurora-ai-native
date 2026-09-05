package ai.aurora.device.wake

import android.content.Context
import java.util.concurrent.atomic.AtomicBoolean

data class WakeRuntimeSnapshot(
    val state: String,
    val engine: String,
    val modelVersion: String,
    val confirmedWakes: Long,
    val rejectedOrIgnoredCandidates: Long,
    val lastError: String?,
    val updatedAtMs: Long,
)

class WakeRuntimeStatusStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun update(
        state: String,
        engine: String = preferences.getString(KEY_ENGINE, "local-audiorecord-template-v1") ?: "local-audiorecord-template-v1",
        modelVersion: String = preferences.getString(KEY_MODEL_VERSION, "none") ?: "none",
        lastError: String? = null,
    ) {
        preferences.edit()
            .putString(KEY_STATE, state)
            .putString(KEY_ENGINE, engine)
            .putString(KEY_MODEL_VERSION, modelVersion)
            .putString(KEY_LAST_ERROR, lastError)
            .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            .apply()
    }

    fun incrementConfirmed() {
        preferences.edit().putLong(KEY_CONFIRMED, preferences.getLong(KEY_CONFIRMED, 0L) + 1L).apply()
    }

    fun incrementRejectedOrIgnored() {
        preferences.edit().putLong(KEY_REJECTED, preferences.getLong(KEY_REJECTED, 0L) + 1L).apply()
    }

    fun snapshot(): WakeRuntimeSnapshot = WakeRuntimeSnapshot(
        state = preferences.getString(KEY_STATE, "DISABLED") ?: "DISABLED",
        engine = preferences.getString(KEY_ENGINE, "local-audiorecord-template-v1") ?: "local-audiorecord-template-v1",
        modelVersion = preferences.getString(KEY_MODEL_VERSION, "none") ?: "none",
        confirmedWakes = preferences.getLong(KEY_CONFIRMED, 0L),
        rejectedOrIgnoredCandidates = preferences.getLong(KEY_REJECTED, 0L),
        lastError = preferences.getString(KEY_LAST_ERROR, null),
        updatedAtMs = preferences.getLong(KEY_UPDATED_AT, 0L),
    )

    companion object {
        private const val PREFERENCES = "aurora.wake.runtime.v1"
        private const val KEY_STATE = "state"
        private const val KEY_ENGINE = "engine"
        private const val KEY_MODEL_VERSION = "model_version"
        private const val KEY_CONFIRMED = "confirmed"
        private const val KEY_REJECTED = "rejected"
        private const val KEY_LAST_ERROR = "last_error"
        private const val KEY_UPDATED_AT = "updated_at_ms"
    }
}

/** Shared only inside the app process. It is an acoustic gating hint, never authority. */
object AuroraAudioActivityState {
    val ttsActive = AtomicBoolean(false)
}
