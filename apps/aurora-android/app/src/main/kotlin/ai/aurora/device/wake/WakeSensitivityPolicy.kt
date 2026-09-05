package ai.aurora.device.wake

/** User-facing sensitivity maps only to local acoustic confirmation threshold. */
object WakeSensitivityPolicy {
    const val DEFAULT_SENSITIVITY: Float = 0.50f

    fun confidenceThreshold(sensitivity: Float): Double {
        require(sensitivity in 0.0f..1.0f) { "wake sensitivity must be within 0..1" }
        // 0.0 = conservative (0.92), 0.5 = canonical default (0.82), 1.0 = permissive (0.72).
        return 0.92 - (0.20 * sensitivity.toDouble())
    }
}
