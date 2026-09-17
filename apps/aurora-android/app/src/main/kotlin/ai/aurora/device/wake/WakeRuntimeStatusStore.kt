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
    val lastEvaluationId: String?,
    val lastEvaluationObservedAtMs: Long?,
    val lastEvaluationLatencyMs: Long?,
    val lastEvaluationConfidence: Double?,
    val lastEvaluationResult: String?,
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
            lastEvaluationId = preferences.getString(KEY_LAST_EVALUATION_ID, null),
            lastEvaluationObservedAtMs = preferences.longOrNull(KEY_LAST_EVALUATION_OBSERVED_AT),
            lastEvaluationLatencyMs = preferences.longOrNull(KEY_LAST_EVALUATION_LATENCY),
            lastEvaluationConfidence =
                preferences.longOrNull(KEY_LAST_EVALUATION_CONFIDENCE_BITS)?.let { bits -> Double.fromBits(bits) },
            lastEvaluationResult = preferences.getString(KEY_LAST_EVALUATION_RESULT, null),
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

    fun recordEvaluation(telemetry: WakeEvaluationTelemetry) {
        check(
            preferences
                .edit()
                .putString(KEY_LAST_EVALUATION_ID, telemetry.id)
                .putLong(KEY_LAST_EVALUATION_OBSERVED_AT, telemetry.observedAtMs)
                .putLong(KEY_LAST_EVALUATION_LATENCY, telemetry.latencyMs)
                .putLong(KEY_LAST_EVALUATION_CONFIDENCE_BITS, telemetry.confidence.toRawBits())
                .putString(KEY_LAST_EVALUATION_RESULT, telemetry.result.name)
                .commit(),
        )
    }

    fun incrementConfirmed() = increment(KEY_CONFIRMED)

    fun incrementRejectedOrIgnored() = increment(KEY_REJECTED)

    private fun android.content.SharedPreferences.longOrNull(key: String): Long? =
        if (contains(key)) getLong(key, 0L) else null

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
        private const val KEY_LAST_EVALUATION_ID = "last_evaluation_id"
        private const val KEY_LAST_EVALUATION_OBSERVED_AT = "last_evaluation_observed_at_ms"
        private const val KEY_LAST_EVALUATION_LATENCY = "last_evaluation_latency_ms"
        private const val KEY_LAST_EVALUATION_CONFIDENCE_BITS = "last_evaluation_confidence_bits"
        private const val KEY_LAST_EVALUATION_RESULT = "last_evaluation_result"
    }
}
