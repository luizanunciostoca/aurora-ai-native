package ai.aurora.device.capability

/**
 * Android-local projection of an already-canonical W04 capability binding.
 *
 * This model does not mint capability identifiers or grant Aurora authority. The capabilityId
 * must come from the W04 registry projection supplied by the caller. Runtime permissions are
 * represented only as local preconditions; W15-E owns permission/consent prompting and policy.
 */
data class NativeCapabilityBinding(
    val capabilityId: String,
    val minApiLevel: Int = 26,
    val requiredFeatures: Set<String> = emptySet(),
    val requiredPermissions: Set<String> = emptySet(),
    val maxSnapshotAgeMs: Long = DEFAULT_MAX_SNAPSHOT_AGE_MS,
) {
    init {
        require(capabilityId.isNotBlank()) { "capabilityId must not be blank" }
        require(minApiLevel >= 26) { "minApiLevel must respect the Aurora Android minSdk" }
        require(maxSnapshotAgeMs > 0) { "maxSnapshotAgeMs must be positive" }
    }

    companion object {
        const val DEFAULT_MAX_SNAPSHOT_AGE_MS: Long = 30_000
    }
}

data class NativeRuntimeSnapshot(
    val observedAtMs: Long,
    val apiLevel: Int,
    val availableFeatures: Set<String>,
    val grantedPermissions: Set<String>,
)

fun interface NativeRuntimeProbe {
    /** Returns the current local runtime projection for the requested binding. */
    fun snapshot(binding: NativeCapabilityBinding): NativeRuntimeSnapshot
}

enum class NativeCapabilityAvailability {
    AVAILABLE,
    UNKNOWN_CAPABILITY,
    UNSUPPORTED_API,
    UNSUPPORTED_FEATURE,
    PRECONDITION_REQUIRED,
    STALE_RUNTIME_STATE,
}

data class NativeCapabilityObservation(
    val capabilityId: String,
    val availability: NativeCapabilityAvailability,
    val observedAtMs: Long,
    val expiresAtMs: Long,
    val missingFeatures: Set<String> = emptySet(),
    val missingPermissions: Set<String> = emptySet(),
) {
    val isAvailable: Boolean
        get() = availability == NativeCapabilityAvailability.AVAILABLE
}

/**
 * Non-executable resolution artifact for a native DEVICE capability.
 *
 * A Ready result is only a fresh local availability/precondition projection. It is never a W07
 * ExecutionTargetReference, PolicyToken, OwnerDecision, approval, retry permission, or proof that a
 * side effect may run. W15-F must consume W07-authorized target semantics and revalidate all current
 * execution/session/capability/permission preconditions before any native action.
 */
sealed interface NativeCapabilityResolution {
    data class Ready(
        val binding: NativeCapabilityBinding,
        val observation: NativeCapabilityObservation,
    ) : NativeCapabilityResolution

    data class Rejected(
        val observation: NativeCapabilityObservation,
    ) : NativeCapabilityResolution
}
