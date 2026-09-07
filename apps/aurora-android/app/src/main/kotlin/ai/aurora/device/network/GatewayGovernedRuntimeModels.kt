package ai.aurora.device.network

import ai.aurora.device.capability.NativeCapabilityBinding

private val SHA256_HEX = Regex("^[a-f0-9]{64}$")
private const val MAX_W07_AUTHORIZATION_AGE_MS = 30_000L

data class GatewayProjectionProvenance(
    val sourceRef: String,
    val contentSha256: String,
) {
    init {
        require(sourceRef.isNotBlank() && sourceRef.length <= 512)
        require(SHA256_HEX.matches(contentSha256))
    }
}

data class GatewayVoiceCapabilityEntry(
    val capabilityId: String,
    val tenantId: String?,
    val supportedTargetKinds: Set<String>,
    val currentAvailability: String,
    val riskClass: String,
    val observedAtMs: Long,
    val expiresAtMs: Long,
) {
    init {
        require(capabilityId.isNotBlank() && capabilityId.length <= 256)
        require(tenantId == null || tenantId.isNotBlank())
        require(supportedTargetKinds.isNotEmpty())
        require(observedAtMs >= 0 && expiresAtMs > observedAtMs)
    }
}

data class GatewayVoiceCommandBinding(
    val commandId: String,
    val phrases: Set<String>,
    val capabilityId: String,
) {
    init {
        require(commandId.isNotBlank() && commandId.length <= 256)
        require(phrases.isNotEmpty() && phrases.all { it.isNotBlank() && it.length <= 256 })
        require(capabilityId.isNotBlank() && capabilityId.length <= 256)
    }
}

data class GatewayGovernedVoiceProjection(
    val activeTenantId: String,
    val registryKind: String,
    val registryVersion: String,
    val registryObservedAtMs: Long,
    val registryExpiresAtMs: Long,
    val registryProvenance: GatewayProjectionProvenance,
    val entries: List<GatewayVoiceCapabilityEntry>,
    val vocabularyVersion: String,
    val vocabularyObservedAtMs: Long,
    val vocabularyExpiresAtMs: Long,
    val vocabularyProvenance: GatewayProjectionProvenance,
    val bindings: List<GatewayVoiceCommandBinding>,
    val nativeBindings: List<NativeCapabilityBinding>,
    val authorizesExecution: Boolean = false,
    val provesExecutionSuccess: Boolean = false,
    val retryAuthorized: Boolean = false,
) {
    init {
        require(activeTenantId.isNotBlank() && activeTenantId.length <= 256)
        require(registryKind == "AURORA_CANONICAL_CAPABILITY_REGISTRY")
        require(registryVersion.isNotBlank())
        require(registryObservedAtMs >= 0 && registryExpiresAtMs > registryObservedAtMs)
        require(vocabularyVersion.isNotBlank())
        require(vocabularyObservedAtMs >= 0 && vocabularyExpiresAtMs > vocabularyObservedAtMs)
        require(entries.map { it.capabilityId }.toSet().size == entries.size)
        require(bindings.map { it.commandId }.toSet().size == bindings.size)
        require(nativeBindings.map { it.capabilityId }.toSet().size == nativeBindings.size)
        require(!authorizesExecution)
        require(!provesExecutionSuccess)
        require(!retryAuthorized)
    }
}

data class GatewayW07DeviceExecutionAuthorizationView(
    val executionId: String,
    val tenantId: String,
    val deviceId: String,
    val capabilityId: String,
    val actionId: String,
    val arguments: Map<String, String>,
    val authorizedAtMs: Long,
    val expiresAtMs: Long,
    val authorizesExecution: Boolean,
    val cancelled: Boolean,
    val targetKind: String,
    val authoritySource: String,
) {
    init {
        require(executionId.isNotBlank())
        require(tenantId.isNotBlank())
        require(deviceId.isNotBlank())
        require(capabilityId.isNotBlank())
        require(actionId.isNotBlank())
        require(arguments.size <= 16)
        require(arguments.entries.all { (key, value) -> key.length in 1..128 && value.length <= 256 })
        require(authorizedAtMs >= 0)
        require(expiresAtMs > authorizedAtMs)
        require(expiresAtMs - authorizedAtMs <= MAX_W07_AUTHORIZATION_AGE_MS)
        require(authorizesExecution)
        require(!cancelled)
        require(targetKind == "DEVICE")
        require(authoritySource == "W07_CURRENT_EXECUTION_AUTHORITY")
    }
}

data class GatewayCommandEnvelopeView(
    val deliveryReference: String,
    val commandId: String,
    val executionId: String,
    val correlationId: String,
    val tenantId: String,
    val deviceSessionId: String,
    val deviceId: String,
    val executionTargetKind: String,
    val executionTargetBindingReference: String,
    val deadlineMs: Long,
    val deliveryAttempt: Int,
    val replay: Boolean,
    val executionAuthorization: GatewayW07DeviceExecutionAuthorizationView,
    val authorizesExecution: Boolean = false,
    val provesExecutionSuccess: Boolean = false,
) {
    init {
        require(deliveryReference.isNotBlank())
        require(commandId.isNotBlank())
        require(executionId.isNotBlank())
        require(correlationId.isNotBlank())
        require(tenantId.isNotBlank())
        require(deviceSessionId.isNotBlank())
        require(deviceId.isNotBlank())
        require(executionTargetKind == "DEVICE")
        require(executionTargetBindingReference == deviceId)
        require(deadlineMs > 0)
        require(deliveryAttempt > 0)
        require(executionAuthorization.executionId == executionId)
        require(executionAuthorization.tenantId == tenantId)
        require(executionAuthorization.deviceId == deviceId)
        require(executionAuthorization.expiresAtMs <= deadlineMs)
        require(!authorizesExecution)
        require(!provesExecutionSuccess)
    }
}
