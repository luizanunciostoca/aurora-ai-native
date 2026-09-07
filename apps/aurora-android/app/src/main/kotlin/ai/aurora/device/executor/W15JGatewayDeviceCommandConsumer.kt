package ai.aurora.device.executor

import android.content.Context
import android.content.pm.PackageManager
import ai.aurora.device.capability.NativeCapabilityBridge
import ai.aurora.device.capability.NativeCapabilityResolution
import ai.aurora.device.network.DeviceReceiptReportedState
import ai.aurora.device.network.GatewayCommandDeliveryView
import ai.aurora.device.network.GatewayDevicePlaneClient
import ai.aurora.device.network.GatewayDevicePlaneResult
import ai.aurora.device.network.GatewayReceiptEvidence
import ai.aurora.device.network.GatewayReceiptIngressView
import ai.aurora.device.network.GatewayW07DeviceExecutionAuthorizationView
import ai.aurora.device.permission.RuntimePermissionObservation
import ai.aurora.device.permission.RuntimePermissionRequirement
import ai.aurora.device.permission.RuntimePermissionState

private const val RECEIPT_SOURCE_REFERENCE = "android:w15j:device-executor"
private const val MAX_LOCAL_DELIVERY_FENCES = 128
private const val PERMISSION_SNAPSHOT_AGE_MS = 30_000L

sealed interface W15JDeviceCommandConsumptionResult {
    data class NoEffect(
        val reason: String,
        val requiresReconciliation: Boolean = false,
        val retryAuthorized: Boolean = false,
    ) : W15JDeviceCommandConsumptionResult {
        init {
            require(reason.isNotBlank())
            require(!retryAuthorized) { "Android command consumer cannot authorize retry" }
        }
    }

    data class Executed(
        val outcome: DeviceExecutionOutcome,
        val receiptIngress: GatewayReceiptIngressView?,
        val requiresReconciliation: Boolean,
        val retryAuthorized: Boolean = false,
    ) : W15JDeviceCommandConsumptionResult {
        init {
            require(!retryAuthorized) { "Android command consumer cannot authorize retry" }
        }
    }
}

/**
 * Final W15-J Android consumer between authenticated W14 delivery and the accepted W15-F executor.
 *
 * Claim and ACK are transport observations only. They are used fail-closed before a native effect but
 * never become W07 authority. The only execution authority consumed here is the short-lived,
 * target-bound W07 view carried in the claimed envelope. Any post-effect receipt loss or ambiguous
 * native result requires W07 reconciliation and never grants a blind retry.
 */
class W15JGatewayDeviceCommandConsumer(
    private val client: GatewayDevicePlaneClient,
    private val capabilityBridge: NativeCapabilityBridge,
    private val permissionContext: Context,
    private val actionPort: DeviceActionPort,
    private val idFactory: CanonicalLocalEvidenceIdFactory = CanonicalLocalEvidenceIdFactory(),
    private val control: DeviceExecutionControl = DeviceExecutionControl { DeviceExecutionControlSnapshot() },
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    private val consumedDeliveryReferences = linkedSetOf<String>()

    @Synchronized
    fun consume(commandId: String): W15JDeviceCommandConsumptionResult {
        val snapshot =
            when (val current = client.currentSnapshot()) {
                is GatewayDevicePlaneResult.Success -> current.value
                is GatewayDevicePlaneResult.Rejected ->
                    return noEffect(
                        reason = "device-plane session is not current",
                        requiresReconciliation = current.requiresReconciliation,
                    )
            }

        val claimed =
            when (val result = runCatching { client.claimCommand(commandId) }.getOrNull()) {
                is GatewayDevicePlaneResult.Success -> result.value
                is GatewayDevicePlaneResult.Rejected ->
                    return noEffect(
                        reason = "command claim rejected",
                        requiresReconciliation = result.requiresReconciliation,
                    )
                null -> return noEffect("command claim failed")
            }
        val envelope = validateClaim(claimed, commandId) ?: return noEffect("claimed envelope rejected")

        if (envelope.deliveryReference in consumedDeliveryReferences) {
            return noEffect("duplicate delivery fenced locally")
        }

        val acknowledged =
            when (
                val result =
                    runCatching {
                        client.acknowledgeCommand(
                            commandId = envelope.commandId,
                            deliveryReference = envelope.deliveryReference,
                            ackReference = "android:w15j:ack:${envelope.executionId}",
                        )
                    }.getOrNull()
            ) {
                is GatewayDevicePlaneResult.Success -> result.value
                is GatewayDevicePlaneResult.Rejected ->
                    return noEffect(
                        reason = "delivery acknowledgement rejected before native effect",
                        requiresReconciliation = result.requiresReconciliation,
                    )
                null -> return noEffect("delivery acknowledgement failed before native effect")
            }
        if (
            acknowledged.commandId != envelope.commandId ||
            acknowledged.executionId != envelope.executionId ||
            acknowledged.deliveryReference != envelope.deliveryReference ||
            acknowledged.state != "ACKNOWLEDGED"
        ) {
            return noEffect("delivery acknowledgement protocol mismatch")
        }

        rememberDelivery(envelope.deliveryReference)

        val native = capabilityBridge.resolve(envelope.executionAuthorization.capabilityId)
        if (native !is NativeCapabilityResolution.Ready) {
            return submitPreEffectFailure(envelope, "native capability is not current")
        }
        val binding = native.binding
        val permissionRequirements =
            binding.requiredPermissions.sorted().map { permission ->
                RuntimePermissionRequirement(permission = permission)
            }

        val executor =
            DeviceExecutorRuntime(
                w07Authorization = CurrentW07DeviceAuthorization { executionId ->
                    if (executionId == envelope.executionId) {
                        envelope.executionAuthorization.toExecutorView()
                    } else {
                        null
                    }
                },
                sessionTrust = CurrentDeviceSessionTrust { deviceSessionId ->
                    val current = client.currentSnapshot()
                    if (current is GatewayDevicePlaneResult.Success) {
                        current.value.deviceSession.takeIf { it.deviceSessionId == deviceSessionId }
                    } else {
                        null
                    }
                },
                capabilityObservation = CurrentNativeCapabilityObservation { capabilityId ->
                    capabilityBridge.discover(capabilityId)
                },
                permissionObservation = CurrentRuntimePermissionObservation(::permissionObservation),
                appIntegration = CurrentAppIntegrationDescriptor { null },
                control = control,
                actionPort = actionPort,
                nowMs = nowMs,
            )

        val request =
            DeviceExecutionRequest(
                executionId = envelope.executionId,
                tenantId = envelope.tenantId,
                deviceId = envelope.deviceId,
                deviceSessionId = envelope.deviceSessionId,
                capabilityId = envelope.executionAuthorization.capabilityId,
                permissionRequirements = permissionRequirements,
                appId = null,
                action =
                    DeviceActionCommand(
                        actionId = envelope.executionAuthorization.actionId,
                        arguments = envelope.executionAuthorization.arguments,
                    ),
                deadlineAtMs = envelope.deadlineMs,
            )

        return when (val decision = executor.execute(request)) {
            is DeviceExecutionDecision.Rejected ->
                submitPreEffectFailure(envelope, "executor rejected: ${decision.reason.name}")
            is DeviceExecutionDecision.Completed -> submitCompleted(envelope, decision)
        }
    }

    private fun validateClaim(
        delivery: GatewayCommandDeliveryView,
        expectedCommandId: String,
    ) =
        delivery.envelope?.takeIf { envelope ->
            delivery.disposition == "DELIVER" &&
                delivery.state == "DELIVERED" &&
                delivery.envelopePresent &&
                delivery.commandId == expectedCommandId &&
                envelope.commandId == expectedCommandId &&
                envelope.executionId == delivery.executionId &&
                envelope.deliveryReference == delivery.deliveryReference &&
                !envelope.replay &&
                nowMs() < envelope.deadlineMs
        }

    private fun submitPreEffectFailure(
        envelope: ai.aurora.device.network.GatewayCommandEnvelopeView,
        reason: String,
    ): W15JDeviceCommandConsumptionResult {
        val submitted = submitReceipt(envelope, DeviceReceiptReportedState.FAILED)
        return NoEffectResult.fromReceipt(reason, submitted)
    }

    private fun submitCompleted(
        envelope: ai.aurora.device.network.GatewayCommandEnvelopeView,
        decision: DeviceExecutionDecision.Completed,
    ): W15JDeviceCommandConsumptionResult {
        val reportedState =
            when (decision.receipt.outcome) {
                DeviceExecutionOutcome.SUCCEEDED -> DeviceReceiptReportedState.COMPLETED
                DeviceExecutionOutcome.FAILED -> DeviceReceiptReportedState.FAILED
                DeviceExecutionOutcome.EXECUTION_UNCERTAIN -> DeviceReceiptReportedState.UNCERTAIN
            }
        val submitted = submitReceipt(envelope, reportedState)
        val ingress = (submitted as? GatewayDevicePlaneResult.Success)?.value
        val transportRequiresReconciliation =
            (submitted as? GatewayDevicePlaneResult.Rejected)?.requiresReconciliation == true || ingress == null
        return W15JDeviceCommandConsumptionResult.Executed(
            outcome = decision.receipt.outcome,
            receiptIngress = ingress,
            requiresReconciliation =
                decision.receipt.requiresReconciliation ||
                    transportRequiresReconciliation ||
                    ingress?.requiresW07Reconciliation == true,
        )
    }

    private fun submitReceipt(
        envelope: ai.aurora.device.network.GatewayCommandEnvelopeView,
        state: DeviceReceiptReportedState,
    ): GatewayDevicePlaneResult<GatewayReceiptIngressView> {
        val capturedAtMs = nowMs()
        return runCatching {
            client.submitReceipt(
                GatewayReceiptEvidence(
                    receiptId = idFactory.receiptId(),
                    evidenceId = idFactory.evidenceId(),
                    commandId = envelope.commandId,
                    executionId = envelope.executionId,
                    deliveryReference = envelope.deliveryReference,
                    reportedState = state,
                    sourceReference = RECEIPT_SOURCE_REFERENCE,
                    capturedAtMs = capturedAtMs,
                ),
            )
        }.getOrElse {
            GatewayDevicePlaneResult.Rejected(
                error = ai.aurora.device.network.GatewayDevicePlaneClientError.TRANSPORT_UNCERTAIN,
                requiresReconciliation = true,
            )
        }
    }

    private fun permissionObservation(
        requirement: RuntimePermissionRequirement,
    ): RuntimePermissionObservation {
        val observedAtMs = nowMs()
        val granted =
            permissionContext.checkSelfPermission(requirement.permission) ==
                PackageManager.PERMISSION_GRANTED
        return RuntimePermissionObservation(
            requirement = requirement,
            state = if (granted) RuntimePermissionState.GRANTED else RuntimePermissionState.DENIED,
            observedAtMs = observedAtMs,
            expiresAtMs = saturatingAdd(observedAtMs, PERMISSION_SNAPSHOT_AGE_MS),
            shouldShowRationale = false,
        )
    }

    private fun rememberDelivery(deliveryReference: String) {
        consumedDeliveryReferences += deliveryReference
        while (consumedDeliveryReferences.size > MAX_LOCAL_DELIVERY_FENCES) {
            val oldest = consumedDeliveryReferences.firstOrNull() ?: break
            consumedDeliveryReferences.remove(oldest)
        }
    }

    private fun noEffect(
        reason: String,
        requiresReconciliation: Boolean = false,
    ): W15JDeviceCommandConsumptionResult.NoEffect =
        W15JDeviceCommandConsumptionResult.NoEffect(
            reason = reason,
            requiresReconciliation = requiresReconciliation,
        )

    private fun saturatingAdd(left: Long, right: Long): Long =
        if (left > Long.MAX_VALUE - right) Long.MAX_VALUE else left + right
}

private object NoEffectResult {
    fun fromReceipt(
        reason: String,
        result: GatewayDevicePlaneResult<GatewayReceiptIngressView>,
    ): W15JDeviceCommandConsumptionResult.NoEffect =
        when (result) {
            is GatewayDevicePlaneResult.Success ->
                W15JDeviceCommandConsumptionResult.NoEffect(
                    reason = reason,
                    requiresReconciliation = result.value.requiresW07Reconciliation,
                )
            is GatewayDevicePlaneResult.Rejected ->
                W15JDeviceCommandConsumptionResult.NoEffect(
                    reason = reason,
                    requiresReconciliation = true,
                )
        }
}

private fun GatewayW07DeviceExecutionAuthorizationView.toExecutorView(): W07AuthorizedDeviceExecutionView =
    W07AuthorizedDeviceExecutionView(
        executionId = executionId,
        tenantId = tenantId,
        deviceId = deviceId,
        capabilityId = capabilityId,
        targetKind = targetKind,
        authoritySource = authoritySource,
        authorizedAtMs = authorizedAtMs,
        expiresAtMs = expiresAtMs,
        authorizesExecution = authorizesExecution,
        cancelled = cancelled,
    )
