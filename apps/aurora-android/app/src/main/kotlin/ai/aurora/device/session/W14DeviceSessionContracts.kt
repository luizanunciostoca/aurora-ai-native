package ai.aurora.device.session

const val W14_DEVICE_KIND = "AURORA_DEVICE"
const val W14_DEVICE_AUTHORITY_SEMANTICS = "DEVICE_REGISTRATION_ONLY_NO_ACTION_AUTHORITY"
const val W14_SESSION_AUTHORITY_SEMANTICS = "DEVICE_SESSION_TRUST_IS_PRECONDITION_METADATA_ONLY"

enum class W14DeviceLifecycleState {
    REGISTERED,
    ACTIVE,
    REVOKED,
    COMPROMISED,
    RETIRED,
}

enum class W14DeviceSessionTrustState {
    ACTIVE,
    REVOKED,
}

/** Android-local consumer view of the accepted W14 DeviceRef contract. */
data class W14DeviceRefView(
    val kind: String,
    val deviceId: String,
    val tenantId: String,
    val registrationVersion: Int,
) {
    init {
        require(kind == W14_DEVICE_KIND) { "device ref kind must be AURORA_DEVICE" }
        require(deviceId.isNotBlank()) { "deviceId must not be blank" }
        require(tenantId.isNotBlank()) { "tenantId must not be blank" }
        require(registrationVersion > 0) { "registrationVersion must be positive" }
    }
}

/**
 * Android-local consumer view of W14 DeviceRegistrationRecord authority-safe fields.
 * W14 remains the canonical owner of DeviceId/DeviceRef and registration lifecycle.
 */
data class W14DeviceRegistrationView(
    val ref: W14DeviceRefView,
    val state: W14DeviceLifecycleState,
    val authoritySemantics: String = W14_DEVICE_AUTHORITY_SEMANTICS,
    val authorizesExecution: Boolean = false,
    val canGrantPermission: Boolean = false,
) {
    init {
        require(authoritySemantics == W14_DEVICE_AUTHORITY_SEMANTICS) {
            "device registration authority semantics mismatch"
        }
        require(!authorizesExecution) { "device registration cannot authorize execution" }
        require(!canGrantPermission) { "device registration cannot grant permission" }
    }
}

/** Android-local consumer view of the accepted W14 DeviceSessionTrustSnapshot contract. */
data class W14DeviceSessionTrustView(
    val deviceSessionId: String,
    val connectionId: String,
    val tenantId: String,
    val deviceRef: W14DeviceRefView,
    val state: W14DeviceSessionTrustState,
    val lastEvaluatedAtMs: Long,
    val gatewayAuthExpiresAtMs: Long,
    val executionPreconditionSatisfied: Boolean,
    val requiresCurrentAuthorityValidation: Boolean = true,
    val authoritySemantics: String = W14_SESSION_AUTHORITY_SEMANTICS,
    val authorizesExecution: Boolean = false,
    val canGrantPermission: Boolean = false,
) {
    init {
        require(deviceSessionId.isNotBlank()) { "deviceSessionId must not be blank" }
        require(connectionId.isNotBlank()) { "connectionId must not be blank" }
        require(tenantId.isNotBlank()) { "tenantId must not be blank" }
        require(deviceRef.tenantId == tenantId) { "session tenant must match device ref tenant" }
        require(lastEvaluatedAtMs >= 0) { "lastEvaluatedAtMs must be non-negative" }
        require(gatewayAuthExpiresAtMs > 0) { "gatewayAuthExpiresAtMs must be positive" }
        require(requiresCurrentAuthorityValidation) {
            "device session trust must require current authority validation"
        }
        require(authoritySemantics == W14_SESSION_AUTHORITY_SEMANTICS) {
            "device session authority semantics mismatch"
        }
        require(!authorizesExecution) { "device session trust cannot authorize execution" }
        require(!canGrantPermission) { "device session trust cannot grant permission" }
    }
}
