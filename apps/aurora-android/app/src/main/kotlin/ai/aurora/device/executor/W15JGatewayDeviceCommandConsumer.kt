package ai.aurora.device.executor

import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import ai.aurora.device.app.AppIntegrationResolution
import ai.aurora.device.app.AppIntegrationResolver
import ai.aurora.device.capability.NativeCapabilityBridge
import ai.aurora.device.capability.NativeCapabilityResolution
import ai.aurora.device.network.DeviceReceiptReportedState
import ai.aurora.device.network.GatewayCommandDeliveryView
import ai.aurora.device.network.GatewayCommandEnvelopeView
import ai.aurora.device.network.GatewayDevicePlaneClient
import ai.aurora.device.network.GatewayDevicePlaneClientError
import ai.aurora.device.network.GatewayDevicePlaneResult
import ai.aurora.device.network.GatewayDevicePlaneSnapshot
import ai.aurora.device.network.GatewayReceiptEvidence
import ai.aurora.device.network.GatewayReceiptIngressView
import ai.aurora.device.network.GatewayW07DeviceExecutionAuthorizationView
import ai.aurora.device.permission.RuntimePermissionObservation
import ai.aurora.device.permission.RuntimePermissionRequirement
import ai.aurora.device.permission.RuntimePermissionState

private const val RECEIPT_SOURCE_REFERENCE = "android:w15j:device-executor"
private const val MAX_LOCAL_DELIVERY_FENCES = 128
private const val PERMISSION_SNAPSHOT_AGE_MS = 30_000L

private data class ReceiptTransportBinding(
    val connectionId: String,
    val gatewayGeneration: Int,
) {
    init {
        require(connectionId.isNotBlank()) { "receipt connectionId must not be blank" }
        require(gatewayGeneration > 0) { "receipt gatewayGeneration must be positive" }
    }
}

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

internal interface W15JGatewayDeviceCommandPort {
    fun currentSnapshot(): GatewayDevicePlaneResult<GatewayDevicePlaneSnapshot>

    fun claimCommand(commandId: String): GatewayDevicePlaneResult<GatewayCommandDeliveryView>

    fun acknowledgeCommand(
        commandId: String,
        deliveryReference: String,
        ackReference: String,
    ): GatewayDevicePlaneResult<GatewayCommandDeliveryView>

    fun submitReceipt(evidence: GatewayReceiptEvidence): GatewayDevicePlaneResult<GatewayReceiptIngressView>
}

internal fun interface CurrentNativeCapabilityResolution {
    fun current(capabilityId: String): NativeCapabilityResolution
}

/**
 * Final W15-J Android consumer between authenticated W14 delivery and the accepted W15-F executor.
 *
 * Claim and ACK are transport observations only. They are used fail-closed before a native effect but
 * never become W07 authority. The only execution authority consumed here is the short-lived,
 * target-bound W07 view carried in the claimed envelope. Any post-effect receipt loss or ambiguous
 * native result requires W07 reconciliation and never grants a blind retry.
 */
class W15JGatewayDeviceCommandConsumer internal constructor(
    private val gateway: W15JGatewayDeviceCommandPort,
    private val capabilityResolution: CurrentNativeCapabilityResolution,
    private val capabilityObservation: CurrentNativeCapabilityObservation,
    private val permissionObservation: CurrentRuntimePermissionObservation,
    private val actionPort: DeviceActionPort,
    private val appIntegrationResolver: AppIntegrationResolver? = null,
    private val idFactory: CanonicalLocalEvidenceIdFactory = CanonicalLocalEvidenceIdFactory(),
    private val control: DeviceExecutionControl = DeviceExecutionControl { DeviceExecutionControlSnapshot() },
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    private val consumedDeliveryReferences = linkedSetOf<String>()

    @Synchronized
    fun consume(commandId: String): W15JDeviceCommandConsumptionResult {
        val snapshot =
            when (val current = gateway.currentSnapshot()) {
                is GatewayDevicePlaneResult.Success -> current.value
                is GatewayDevicePlaneResult.Rejected ->
                    return noEffect(
                        reason = "device-plane session is not current",
                        requiresReconciliation = current.requiresReconciliation,
                    )
            }
        val receiptBinding =
            ReceiptTransportBinding(
                connectionId = snapshot.gateway.connectionId,
                gatewayGeneration = snapshot.gateway.generation,
            )

        val claimed =
            when (val result = runCatching { gateway.claimCommand(commandId) }.getOrNull()) {
                is GatewayDevicePlaneResult.Success -> result.value
                is GatewayDevicePlaneResult.Rejected ->
                    return noEffect(
                        reason = "command claim rejected",
                        requiresReconciliation = result.requiresReconciliation,
                    )
                null -> return noEffect("command claim failed")
            }
        val envelope = validateClaim(claimed, commandId) ?: return noEffect("claimed envelope rejected")
        if (
            envelope.tenantId != snapshot.gateway.tenantId ||
            envelope.deviceId != snapshot.registration.ref.deviceId ||
            envelope.deviceSessionId != snapshot.deviceSession.deviceSessionId
        ) {
            return noEffect("claimed envelope does not match current W14 binding")
        }

        if (envelope.deliveryReference in consumedDeliveryReferences) {
            return noEffect("duplicate delivery fenced locally")
        }

        val acknowledged =
            when (
                val result =
                    runCatching {
                        gateway.acknowledgeCommand(
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

        val native = capabilityResolution.current(envelope.executionAuthorization.capabilityId)
        if (native !is NativeCapabilityResolution.Ready) {
            return submitPreEffectFailure(
                envelope,
                receiptBinding,
                "native capability is not current",
            )
        }
        val permissionRequirements =
            native.binding.requiredPermissions.sorted().map { permission ->
                // W15-J delivery may execute while no Activity is interactive. Runtime permission
                // therefore has to remain eligible under the current OS background restriction.
                RuntimePermissionRequirement(
                    permission = permission,
                    requiresBackgroundAccess = true,
                )
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
                    val current = gateway.currentSnapshot()
                    if (current is GatewayDevicePlaneResult.Success) {
                        current.value.deviceSession.takeIf { it.deviceSessionId == deviceSessionId }
                    } else {
                        null
                    }
                },
                capabilityObservation = capabilityObservation,
                permissionObservation = permissionObservation,
                appIntegration = CurrentAppIntegrationDescriptor { appId ->
                    when (val resolution = appIntegrationResolver?.resolve(appId)) {
                        is AppIntegrationResolution.Ready -> resolution.descriptor
                        else -> null
                    }
                },
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
                appId = envelope.appIdForAction(),
                action =
                    DeviceActionCommand(
                        actionId = envelope.executionAuthorization.actionId,
                        arguments = envelope.executionAuthorization.arguments,
                    ),
                deadlineAtMs = envelope.deadlineMs,
            )

        return when (val decision = executor.execute(request)) {
            is DeviceExecutionDecision.Rejected ->
                submitPreEffectFailure(
                    envelope,
                    receiptBinding,
                    "executor rejected: ${decision.reason.name}",
                )
            is DeviceExecutionDecision.Completed -> submitCompleted(envelope, receiptBinding, decision)
        }
    }

    private fun validateClaim(
        delivery: GatewayCommandDeliveryView,
        expectedCommandId: String,
    ): GatewayCommandEnvelopeView? =
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
        envelope: GatewayCommandEnvelopeView,
        receiptBinding: ReceiptTransportBinding,
        reason: String,
    ): W15JDeviceCommandConsumptionResult {
        val submitted = submitReceipt(envelope, receiptBinding, DeviceReceiptReportedState.FAILED)
        return NoEffectResult.fromReceipt(reason, submitted)
    }

    private fun submitCompleted(
        envelope: GatewayCommandEnvelopeView,
        receiptBinding: ReceiptTransportBinding,
        decision: DeviceExecutionDecision.Completed,
    ): W15JDeviceCommandConsumptionResult {
        val reportedState =
            when (decision.receipt.outcome) {
                DeviceExecutionOutcome.SUCCEEDED -> DeviceReceiptReportedState.COMPLETED
                DeviceExecutionOutcome.FAILED -> DeviceReceiptReportedState.FAILED
                DeviceExecutionOutcome.EXECUTION_UNCERTAIN -> DeviceReceiptReportedState.UNCERTAIN
            }
        val submitted = submitReceipt(envelope, receiptBinding, reportedState)
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
        envelope: GatewayCommandEnvelopeView,
        receiptBinding: ReceiptTransportBinding,
        state: DeviceReceiptReportedState,
    ): GatewayDevicePlaneResult<GatewayReceiptIngressView> {
        val capturedAtMs = nowMs()
        return runCatching {
            gateway.submitReceipt(
                GatewayReceiptEvidence(
                    receiptId = idFactory.receiptId(),
                    evidenceId = idFactory.evidenceId(),
                    commandId = envelope.commandId,
                    executionId = envelope.executionId,
                    deliveryReference = envelope.deliveryReference,
                    reportedState = state,
                    sourceReference = RECEIPT_SOURCE_REFERENCE,
                    capturedAtMs = capturedAtMs,
                    reportedConnectionId = receiptBinding.connectionId,
                    reportedGatewayGeneration = receiptBinding.gatewayGeneration,
                ),
            )
        }.getOrElse {
            GatewayDevicePlaneResult.Rejected(
                error = GatewayDevicePlaneClientError.TRANSPORT_UNCERTAIN,
                requiresReconciliation = true,
            )
        }
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

    companion object {
        fun forAndroid(
            client: GatewayDevicePlaneClient,
            capabilityBridge: NativeCapabilityBridge,
            permissionContext: Context,
            actionPort: DeviceActionPort,
            appIntegrationResolver: AppIntegrationResolver? = null,
            idFactory: CanonicalLocalEvidenceIdFactory = CanonicalLocalEvidenceIdFactory(),
            control: DeviceExecutionControl =
                DeviceExecutionControl { DeviceExecutionControlSnapshot() },
            nowMs: () -> Long = { System.currentTimeMillis() },
        ): W15JGatewayDeviceCommandConsumer {
            val gateway =
                object : W15JGatewayDeviceCommandPort {
                    override fun currentSnapshot() = client.currentSnapshot()

                    override fun claimCommand(commandId: String) = client.claimCommand(commandId)

                    override fun acknowledgeCommand(
                        commandId: String,
                        deliveryReference: String,
                        ackReference: String,
                    ) = client.acknowledgeCommand(commandId, deliveryReference, ackReference)

                    override fun submitReceipt(evidence: GatewayReceiptEvidence) =
                        client.submitReceipt(evidence)
                }
            val permissionObservation =
                CurrentRuntimePermissionObservation { requirement ->
                    val observedAtMs = nowMs()
                    val granted =
                        permissionContext.checkSelfPermission(requirement.permission) ==
                            PackageManager.PERMISSION_GRANTED
                    val backgroundRestricted =
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                            permissionContext.getSystemService(ActivityManager::class.java)
                                ?.isBackgroundRestricted == true
                        } else {
                            false
                        }
                    RuntimePermissionObservation(
                        requirement = requirement,
                        state =
                            when {
                                !granted -> RuntimePermissionState.DENIED
                                requirement.requiresBackgroundAccess && backgroundRestricted ->
                                    RuntimePermissionState.BACKGROUND_RESTRICTED
                                else -> RuntimePermissionState.GRANTED
                            },
                        observedAtMs = observedAtMs,
                        expiresAtMs = saturatingAdd(observedAtMs, PERMISSION_SNAPSHOT_AGE_MS),
                        shouldShowRationale = false,
                    )
                }
            return W15JGatewayDeviceCommandConsumer(
                gateway = gateway,
                capabilityResolution = CurrentNativeCapabilityResolution(capabilityBridge::resolve),
                capabilityObservation = CurrentNativeCapabilityObservation(capabilityBridge::discover),
                permissionObservation = permissionObservation,
                actionPort = actionPort,
                appIntegrationResolver = appIntegrationResolver,
                idFactory = idFactory,
                control = control,
                nowMs = nowMs,
            )
        }
    }
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

private fun GatewayCommandEnvelopeView.appIdForAction(): String? =
    when (executionAuthorization.actionId) {
        W15_OPEN_VALIDATED_APP_ACTION,
        W15_OPEN_VALIDATED_APP_LINK_ACTION,
        -> executionAuthorization.arguments["appId"]
        else -> null
    }

private fun saturatingAdd(left: Long, right: Long): Long =
    if (left > Long.MAX_VALUE - right) Long.MAX_VALUE else left + right
