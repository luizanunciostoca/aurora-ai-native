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

data class NativeCapabilityCommand(
    val requestId: String,
    val capabilityId: String,
    val arguments: Map<String, String> = emptyMap(),
) {
    init {
        require(requestId.isNotBlank()) { "requestId must not be blank" }
        require(capabilityId.isNotBlank()) { "capabilityId must not be blank" }
    }
}

/**
 * Port implemented by the W07/W15-F execution boundary.
 *
 * W15-C consumes this decision; it never derives action authority from capability availability,
 * Android permissions, device presence, or session possession.
 */
fun interface ExecutionTargetAuthorizationPort {
    fun validate(command: NativeCapabilityCommand): ExecutionTargetAuthorizationDecision
}

enum class ExecutionTargetAuthorizationDecision {
    AUTHORIZED_DEVICE_TARGET,
    NOT_AUTHORIZED,
    WRONG_TARGET,
    STALE_TARGET,
    AMBIGUOUS_TARGET,
}

fun interface NativeCapabilityHandler {
    fun dispatch(command: NativeCapabilityCommand): NativeHandlerResult
}

sealed interface NativeHandlerResult {
    data class Success(val output: Map<String, String> = emptyMap()) : NativeHandlerResult

    data class Failure(
        val code: String,
        val retryable: Boolean = false,
    ) : NativeHandlerResult {
        init {
            require(code.isNotBlank()) { "handler failure code must not be blank" }
        }
    }
}

enum class NativeDispatchRejection {
    UNKNOWN_CAPABILITY,
    UNSUPPORTED_API,
    UNSUPPORTED_FEATURE,
    PRECONDITION_REQUIRED,
    STALE_RUNTIME_STATE,
    TARGET_NOT_AUTHORIZED,
    TARGET_WRONG_KIND,
    TARGET_STALE,
    TARGET_AMBIGUOUS,
    HANDLER_REJECTED,
}

sealed interface NativeDispatchResult {
    data class Dispatched(
        val requestId: String,
        val capabilityId: String,
        val output: Map<String, String>,
    ) : NativeDispatchResult

    data class Rejected(
        val requestId: String,
        val capabilityId: String,
        val reason: NativeDispatchRejection,
        val handlerCode: String? = null,
        val handlerRetryable: Boolean = false,
    ) : NativeDispatchResult
}
