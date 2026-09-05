package ai.aurora.ui

import ai.aurora.device.capability.NativeCapabilityAvailability
import ai.aurora.device.capability.NativeCapabilityObservation

/** Aggregated W15-C observation summary for UI display; never a capability registry or authority. */
data class NativeCapabilityUiSummary(
    val total: Int,
    val available: Int,
    val preconditionRequired: Int,
    val stale: Int,
    val unsupported: Int,
    val unknown: Int,
    val authorizesExecution: Boolean = false,
) {
    init {
        require(total >= 0)
        require(available >= 0)
        require(preconditionRequired >= 0)
        require(stale >= 0)
        require(unsupported >= 0)
        require(unknown >= 0)
        require(available + preconditionRequired + stale + unsupported + unknown == total)
        require(!authorizesExecution) { "native capability UI summary cannot authorize execution" }
    }
}

object NativeCapabilityDiagnostics {
    fun summarize(observations: Collection<NativeCapabilityObservation>): NativeCapabilityUiSummary {
        var available = 0
        var precondition = 0
        var stale = 0
        var unsupported = 0
        var unknown = 0
        observations.forEach { observation ->
            when (observation.availability) {
                NativeCapabilityAvailability.AVAILABLE -> available += 1
                NativeCapabilityAvailability.PRECONDITION_REQUIRED -> precondition += 1
                NativeCapabilityAvailability.STALE_RUNTIME_STATE -> stale += 1
                NativeCapabilityAvailability.UNSUPPORTED_API,
                NativeCapabilityAvailability.UNSUPPORTED_FEATURE,
                -> unsupported += 1
                NativeCapabilityAvailability.UNKNOWN_CAPABILITY -> unknown += 1
            }
        }
        return NativeCapabilityUiSummary(
            total = observations.size,
            available = available,
            preconditionRequired = precondition,
            stale = stale,
            unsupported = unsupported,
            unknown = unknown,
        )
    }
}
