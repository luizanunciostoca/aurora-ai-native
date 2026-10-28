package ai.aurora.device.wake

/**
 * Process-local acceptance history shared by recreated wake engines.
 *
 * This state stores only timestamp + derived feature fingerprint. It carries no transcript, PCM,
 * authority, execution result, or retry permission. Sharing it across engine instances preserves
 * debounce/cooldown/duplicate suppression after the foreground detector rearms.
 */
internal class WakeAcceptanceHistory {
    private var lastAcceptedAtMs: Long? = null
    private var lastAcceptedFingerprint: String? = null

    @Synchronized
    fun evaluateAndRecord(
        observation: WakeObservation,
        config: WakeConfig,
    ): RejectionReason? {
        val previousAt = lastAcceptedAtMs
        if (previousAt != null) {
            val elapsed = observation.observedAtMs - previousAt
            if (elapsed < 0 || elapsed < config.debounceMs) return RejectionReason.DEBOUNCED
            if (elapsed < config.cooldownMs) return RejectionReason.COOLDOWN
            if (
                elapsed < config.duplicateWindowMs &&
                observation.featureFingerprint == lastAcceptedFingerprint
            ) {
                return RejectionReason.DUPLICATE
            }
        }

        lastAcceptedAtMs = observation.observedAtMs
        lastAcceptedFingerprint = observation.featureFingerprint
        return null
    }

    @Synchronized
    fun clear() {
        lastAcceptedAtMs = null
        lastAcceptedFingerprint = null
    }
}

/** Single process-local history for the physical wake detector across service rearms. */
internal object WakeProcessAcceptanceRuntime {
    val history = WakeAcceptanceHistory()
}
