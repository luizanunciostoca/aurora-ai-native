package ai.aurora.device.executor

/**
 * Exact allowlisted action registry for W15-F native realization.
 *
 * This component is deliberately authority-blind: it never chooses whether an action may execute.
 * [DeviceExecutorRuntime] must already have re-read current W07 authority, W14 session trust,
 * capability availability and permission preconditions before this port is invoked.
 */
data class DeviceActionBinding(
    val actionId: String,
    val capabilityId: String,
    val port: DeviceActionPort,
) {
    init {
        require(actionId.isNotBlank()) { "actionId must not be blank" }
        require(capabilityId.isNotBlank()) { "capabilityId must not be blank" }
    }
}

class CompositeDeviceActionPort(
    bindings: Collection<DeviceActionBinding>,
) : DeviceActionPort {
    private val bindingsByActionId: Map<String, DeviceActionBinding>

    init {
        require(bindings.isNotEmpty()) { "at least one native action binding is required" }
        val duplicates =
            bindings
                .groupingBy { it.actionId }
                .eachCount()
                .filterValues { it > 1 }
                .keys
        require(duplicates.isEmpty()) {
            "duplicate native action bindings: ${duplicates.sorted().joinToString()}"
        }
        bindingsByActionId = bindings.associateBy { it.actionId }
    }

    override fun execute(
        command: DeviceActionCommand,
        context: DeviceActionContext,
    ): DeviceActionResult {
        val binding =
            bindingsByActionId[command.actionId]
                ?: return DeviceActionResult.VerifiedFailure("native action is not registered")
        if (context.capabilityId != binding.capabilityId) {
            return DeviceActionResult.VerifiedFailure("capability/action binding mismatch")
        }
        return binding.port.execute(command, context)
    }

    fun registeredActionIds(): Set<String> = bindingsByActionId.keys
}
