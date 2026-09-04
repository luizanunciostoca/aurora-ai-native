package ai.aurora.device.capability

data class NativeCapabilityRegistration(
    val binding: NativeCapabilityBinding,
    val handler: NativeCapabilityHandler,
)

/**
 * Registry-driven Android native bridge.
 *
 * Discovery is deliberately separate from execution authority. Dispatch performs a fresh local
 * runtime observation and then requires an explicit W07/W15-F target authorization decision before
 * invoking a handler. Android runtime permission presence is only a precondition here; W15-E owns
 * user prompting/consent brokering.
 */
class NativeCapabilityBridge(
    registrations: Collection<NativeCapabilityRegistration>,
    private val runtimeProbe: NativeRuntimeProbe,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    private val registrationsById: Map<String, NativeCapabilityRegistration>

    init {
        val duplicates =
            registrations
                .groupingBy { it.binding.capabilityId }
                .eachCount()
                .filterValues { it > 1 }
                .keys
        require(duplicates.isEmpty()) {
            "duplicate native capability bindings: ${duplicates.sorted().joinToString()}"
        }
        registrationsById = registrations.associateBy { it.binding.capabilityId }
    }

    fun discover(capabilityId: String): NativeCapabilityObservation {
        val currentMs = nowMs()
        val registration = registrationsById[capabilityId]
            ?: return NativeCapabilityObservation(
                capabilityId = capabilityId,
                availability = NativeCapabilityAvailability.UNKNOWN_CAPABILITY,
                observedAtMs = currentMs,
                expiresAtMs = currentMs,
            )

        return observe(registration.binding, runtimeProbe.snapshot(registration.binding), currentMs)
    }

    fun discoverAll(): List<NativeCapabilityObservation> =
        registrationsById.keys.sorted().map(::discover)

    fun dispatch(
        command: NativeCapabilityCommand,
        targetAuthorization: ExecutionTargetAuthorizationPort,
    ): NativeDispatchResult {
        val registration = registrationsById[command.capabilityId]
            ?: return command.rejected(NativeDispatchRejection.UNKNOWN_CAPABILITY)

        val observation =
            observe(
                registration.binding,
                runtimeProbe.snapshot(registration.binding),
                nowMs(),
            )
        if (!observation.isAvailable) {
            return command.rejected(observation.availability.toDispatchRejection())
        }

        when (targetAuthorization.validate(command)) {
            ExecutionTargetAuthorizationDecision.AUTHORIZED_DEVICE_TARGET -> Unit
            ExecutionTargetAuthorizationDecision.NOT_AUTHORIZED ->
                return command.rejected(NativeDispatchRejection.TARGET_NOT_AUTHORIZED)
            ExecutionTargetAuthorizationDecision.WRONG_TARGET ->
                return command.rejected(NativeDispatchRejection.TARGET_WRONG_KIND)
            ExecutionTargetAuthorizationDecision.STALE_TARGET ->
                return command.rejected(NativeDispatchRejection.TARGET_STALE)
            ExecutionTargetAuthorizationDecision.AMBIGUOUS_TARGET ->
                return command.rejected(NativeDispatchRejection.TARGET_AMBIGUOUS)
        }

        return when (val result = registration.handler.dispatch(command)) {
            is NativeHandlerResult.Success ->
                NativeDispatchResult.Dispatched(
                    requestId = command.requestId,
                    capabilityId = command.capabilityId,
                    output = result.output,
                )
            is NativeHandlerResult.Failure ->
                command.rejected(
                    reason = NativeDispatchRejection.HANDLER_REJECTED,
                    handlerCode = result.code,
                )
        }
    }

    private fun observe(
        binding: NativeCapabilityBinding,
        snapshot: NativeRuntimeSnapshot,
        currentMs: Long,
    ): NativeCapabilityObservation {
        val expiresAtMs = saturatingAdd(snapshot.observedAtMs, binding.maxSnapshotAgeMs)
        if (
            snapshot.observedAtMs < 0 ||
            currentMs < 0 ||
            snapshot.observedAtMs > currentMs ||
            currentMs >= expiresAtMs
        ) {
            return NativeCapabilityObservation(
                capabilityId = binding.capabilityId,
                availability = NativeCapabilityAvailability.STALE_RUNTIME_STATE,
                observedAtMs = snapshot.observedAtMs,
                expiresAtMs = expiresAtMs,
            )
        }

        if (snapshot.apiLevel < binding.minApiLevel) {
            return NativeCapabilityObservation(
                capabilityId = binding.capabilityId,
                availability = NativeCapabilityAvailability.UNSUPPORTED_API,
                observedAtMs = snapshot.observedAtMs,
                expiresAtMs = expiresAtMs,
            )
        }

        val missingFeatures = binding.requiredFeatures - snapshot.availableFeatures
        if (missingFeatures.isNotEmpty()) {
            return NativeCapabilityObservation(
                capabilityId = binding.capabilityId,
                availability = NativeCapabilityAvailability.UNSUPPORTED_FEATURE,
                observedAtMs = snapshot.observedAtMs,
                expiresAtMs = expiresAtMs,
                missingFeatures = missingFeatures,
            )
        }

        val missingPermissions = binding.requiredPermissions - snapshot.grantedPermissions
        if (missingPermissions.isNotEmpty()) {
            return NativeCapabilityObservation(
                capabilityId = binding.capabilityId,
                availability = NativeCapabilityAvailability.PRECONDITION_REQUIRED,
                observedAtMs = snapshot.observedAtMs,
                expiresAtMs = expiresAtMs,
                missingPermissions = missingPermissions,
            )
        }

        return NativeCapabilityObservation(
            capabilityId = binding.capabilityId,
            availability = NativeCapabilityAvailability.AVAILABLE,
            observedAtMs = snapshot.observedAtMs,
            expiresAtMs = expiresAtMs,
        )
    }

    private fun NativeCapabilityAvailability.toDispatchRejection(): NativeDispatchRejection =
        when (this) {
            NativeCapabilityAvailability.AVAILABLE ->
                error("available capability cannot map to a dispatch rejection")
            NativeCapabilityAvailability.UNKNOWN_CAPABILITY -> NativeDispatchRejection.UNKNOWN_CAPABILITY
            NativeCapabilityAvailability.UNSUPPORTED_API -> NativeDispatchRejection.UNSUPPORTED_API
            NativeCapabilityAvailability.UNSUPPORTED_FEATURE -> NativeDispatchRejection.UNSUPPORTED_FEATURE
            NativeCapabilityAvailability.PRECONDITION_REQUIRED ->
                NativeDispatchRejection.PRECONDITION_REQUIRED
            NativeCapabilityAvailability.STALE_RUNTIME_STATE ->
                NativeDispatchRejection.STALE_RUNTIME_STATE
        }

    private fun NativeCapabilityCommand.rejected(
        reason: NativeDispatchRejection,
        handlerCode: String? = null,
    ): NativeDispatchResult.Rejected =
        NativeDispatchResult.Rejected(
            requestId = requestId,
            capabilityId = capabilityId,
            reason = reason,
            handlerCode = handlerCode,
        )

    private fun saturatingAdd(left: Long, right: Long): Long =
        if (left > Long.MAX_VALUE - right) Long.MAX_VALUE else left + right
}
