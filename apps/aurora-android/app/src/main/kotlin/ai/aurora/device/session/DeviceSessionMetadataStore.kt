package ai.aurora.device.session

data class LocalDeviceKeyMetadata(
    val alias: String,
    val generation: Long,
    val boundRegistrationVersion: Int?,
) {
    init {
        require(alias.isNotBlank()) { "key alias must not be blank" }
        require(generation > 0) { "key generation must be positive" }
        require(boundRegistrationVersion == null || boundRegistrationVersion > 0) {
            "bound registration version must be positive"
        }
    }
}

data class LocalDeviceRegistrationMetadata(
    val deviceId: String,
    val tenantId: String,
    val registrationVersion: Int,
    val state: W14DeviceLifecycleState,
) {
    init {
        require(deviceId.isNotBlank()) { "deviceId must not be blank" }
        require(tenantId.isNotBlank()) { "tenantId must not be blank" }
        require(registrationVersion > 0) { "registrationVersion must be positive" }
    }
}

data class LocalDeviceSessionMetadata(
    val deviceSessionId: String,
    val connectionId: String,
    val gatewayAuthExpiresAtMs: Long,
    val lastEvaluatedAtMs: Long,
) {
    init {
        require(deviceSessionId.isNotBlank()) { "deviceSessionId must not be blank" }
        require(connectionId.isNotBlank()) { "connectionId must not be blank" }
        require(gatewayAuthExpiresAtMs > 0) { "gatewayAuthExpiresAtMs must be positive" }
        require(lastEvaluatedAtMs >= 0) { "lastEvaluatedAtMs must be non-negative" }
    }
}

data class LocalDeviceSessionState(
    val key: LocalDeviceKeyMetadata? = null,
    val registration: LocalDeviceRegistrationMetadata? = null,
    val session: LocalDeviceSessionMetadata? = null,
) {
    init {
        require(session == null || registration != null) { "session metadata requires registration metadata" }
        require(session == null || key != null) { "session metadata requires key metadata" }
    }
}

interface DeviceSessionMetadataStore {
    fun load(): LocalDeviceSessionState

    fun save(state: LocalDeviceSessionState)

    fun clear()
}
