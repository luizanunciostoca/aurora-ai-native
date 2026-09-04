package ai.aurora.device.capability

/**
 * Registry-driven Android native capability discovery bridge.
 *
 * This W15-C surface is intentionally non-executable. It projects externally supplied W04
 * capability bindings onto current Android API/feature/permission preconditions and freshness.
 * W15-F owns native execution and must pass through W07 authority/target semantics before any side
 * effect. W15-E owns permission/consent prompting and richer denial/background-restriction state.
 */
class NativeCapabilityBridge(
    bindings: Collection<NativeCapabilityBinding>,
    private val runtimeProbe: NativeRuntimeProbe,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    private val bindingsById: Map<String, NativeCapabilityBinding>

    init {
        val duplicates =
            bindings
                .groupingBy { it.capabilityId }
                .eachCount()
                .filterValues { it > 1 }
                .keys
        require(duplicates.isEmpty()) {
            "duplicate native capability bindings: ${duplicates.sorted().joinToString()}"
        }
        bindingsById = bindings.associateBy { it.capabilityId }
    }

    fun discover(capabilityId: String): NativeCapabilityObservation {
        val currentMs = nowMs()
        val binding = bindingsById[capabilityId]
            ?: return NativeCapabilityObservation(
                capabilityId = capabilityId,
                availability = NativeCapabilityAvailability.UNKNOWN_CAPABILITY,
                observedAtMs = currentMs,
                expiresAtMs = currentMs,
            )

        return observe(binding, runtimeProbe.snapshot(binding), currentMs)
    }

    fun discoverAll(): List<NativeCapabilityObservation> =
        bindingsById.keys.sorted().map(::discover)

    /**
     * Returns a fresh non-executable binding projection for W15-F consumption.
     *
     * Ready means only that the current local Android requirements are satisfied at this instant.
     * It does not authorize an action and does not replace W07 target/current-authority validation.
     */
    fun resolve(capabilityId: String): NativeCapabilityResolution {
        val currentMs = nowMs()
        val binding = bindingsById[capabilityId]
            ?: return NativeCapabilityResolution.Rejected(
                NativeCapabilityObservation(
                    capabilityId = capabilityId,
                    availability = NativeCapabilityAvailability.UNKNOWN_CAPABILITY,
                    observedAtMs = currentMs,
                    expiresAtMs = currentMs,
                ),
            )
        val observation = observe(binding, runtimeProbe.snapshot(binding), currentMs)
        return if (observation.isAvailable) {
            NativeCapabilityResolution.Ready(binding = binding, observation = observation)
        } else {
            NativeCapabilityResolution.Rejected(observation)
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

    private fun saturatingAdd(left: Long, right: Long): Long =
        if (left > Long.MAX_VALUE - right) Long.MAX_VALUE else left + right
}
