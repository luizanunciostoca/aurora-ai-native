package ai.aurora.device.executor

import ai.aurora.device.capability.NativeCapabilityAvailability
import ai.aurora.device.capability.NativeCapabilityBinding
import ai.aurora.device.capability.NativeCapabilityObservation
import ai.aurora.device.capability.NativeCapabilityResolution
import ai.aurora.device.network.DeviceReceiptReportedState
import ai.aurora.device.network.GatewayCommandDeliveryView
import ai.aurora.device.network.GatewayCommandEnvelopeView
import ai.aurora.device.network.GatewayDevicePlaneResult
import ai.aurora.device.network.GatewayDevicePlaneSnapshot
import ai.aurora.device.network.GatewayReceiptEvidence
import ai.aurora.device.network.GatewayReceiptIngressView
import ai.aurora.device.network.GatewaySessionNetworkView
import ai.aurora.device.network.GatewayW07DeviceExecutionAuthorizationView
import ai.aurora.device.permission.RuntimePermissionObservation
import ai.aurora.device.permission.RuntimePermissionRequirement
import ai.aurora.device.permission.RuntimePermissionState
import ai.aurora.device.session.W14DeviceLifecycleState
import ai.aurora.device.session.W14DeviceRefView
import ai.aurora.device.session.W14DeviceRegistrationView
import ai.aurora.device.session.W14DeviceSessionTrustState
import ai.aurora.device.session.W14DeviceSessionTrustView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class W15JDp5HardeningTest {
    @Test
    fun `background restricted permission blocks before native side effect`() {
        val gateway = FakeGateway(snapshot("conn-1", 1))
        var observedRequirement: RuntimePermissionRequirement? = null
        val action = RecordingActionPort()
        val consumer =
            consumer(
                gateway = gateway,
                action = action,
                requiredPermissions = setOf(PERMISSION),
                permissionObservation = { requirement ->
                    observedRequirement = requirement
                    permission(requirement, RuntimePermissionState.BACKGROUND_RESTRICTED)
                },
            )

        val result = consumer.consume(COMMAND_ID) as W15JDeviceCommandConsumptionResult.NoEffect

        assertEquals(0, action.calls)
        assertTrue(observedRequirement?.requiresBackgroundAccess == true)
        assertFalse(result.retryAuthorized)
        assertEquals(DeviceReceiptReportedState.FAILED, gateway.receipts.single().reportedState)
    }

    @Test
    fun `late receipt remains bound to delivery connection after reconnect`() {
        val gateway = FakeGateway(snapshot("conn-1", 1))
        val action =
            RecordingActionPort {
                gateway.snapshot = snapshot("conn-2", 2)
            }
        val consumer = consumer(gateway = gateway, action = action)

        val result = consumer.consume(COMMAND_ID) as W15JDeviceCommandConsumptionResult.Executed

        assertEquals(DeviceExecutionOutcome.SUCCEEDED, result.outcome)
        assertEquals(1, action.calls)
        val receipt = gateway.receipts.single()
        assertEquals("conn-1", receipt.reportedConnectionId)
        assertEquals(1, receipt.reportedGatewayGeneration)
        assertFalse(result.retryAuthorized)
    }

    @Test
    fun `kill switch race after dispatch is uncertain and never authorizes retry`() {
        val gateway = FakeGateway(snapshot("conn-1", 1))
        val action = RecordingActionPort()
        var controlReads = 0
        val consumer =
            consumer(
                gateway = gateway,
                action = action,
                control =
                    DeviceExecutionControl {
                        controlReads += 1
                        DeviceExecutionControlSnapshot(killSwitchEngaged = controlReads > 1)
                    },
            )

        val result = consumer.consume(COMMAND_ID) as W15JDeviceCommandConsumptionResult.Executed

        assertEquals(1, action.calls)
        assertEquals(DeviceExecutionOutcome.EXECUTION_UNCERTAIN, result.outcome)
        assertTrue(result.requiresReconciliation)
        assertFalse(result.retryAuthorized)
        assertEquals(DeviceReceiptReportedState.UNCERTAIN, gateway.receipts.single().reportedState)
    }

    private fun consumer(
        gateway: FakeGateway,
        action: RecordingActionPort,
        requiredPermissions: Set<String> = emptySet(),
        permissionObservation: (RuntimePermissionRequirement) -> RuntimePermissionObservation = {
            permission(it, RuntimePermissionState.GRANTED)
        },
        control: DeviceExecutionControl = DeviceExecutionControl { DeviceExecutionControlSnapshot() },
    ): W15JGatewayDeviceCommandConsumer =
        W15JGatewayDeviceCommandConsumer(
            gateway = gateway,
            capabilityResolution =
                CurrentNativeCapabilityResolution {
                    NativeCapabilityResolution.Ready(
                        binding =
                            NativeCapabilityBinding(
                                capabilityId = CAPABILITY_ID,
                                requiredPermissions = requiredPermissions,
                            ),
                        observation = capabilityObservation(),
                    )
                },
            capabilityObservation = CurrentNativeCapabilityObservation { capabilityObservation() },
            permissionObservation = CurrentRuntimePermissionObservation(permissionObservation),
            actionPort = action,
            idFactory = CanonicalLocalEvidenceIdFactory(nowMs = { NOW }),
            control = control,
            nowMs = { NOW },
        )

    private class FakeGateway(
        var snapshot: GatewayDevicePlaneSnapshot,
    ) : W15JGatewayDeviceCommandPort {
        val receipts = mutableListOf<GatewayReceiptEvidence>()

        override fun currentSnapshot(): GatewayDevicePlaneResult<GatewayDevicePlaneSnapshot> =
            GatewayDevicePlaneResult.Success(snapshot)

        override fun claimCommand(commandId: String): GatewayDevicePlaneResult<GatewayCommandDeliveryView> =
            GatewayDevicePlaneResult.Success(delivery())

        override fun acknowledgeCommand(
            commandId: String,
            deliveryReference: String,
            ackReference: String,
        ): GatewayDevicePlaneResult<GatewayCommandDeliveryView> =
            GatewayDevicePlaneResult.Success(
                GatewayCommandDeliveryView(
                    disposition = "ACKNOWLEDGED",
                    deliveryReference = DELIVERY_REFERENCE,
                    commandId = COMMAND_ID,
                    executionId = EXECUTION_ID,
                    state = "ACKNOWLEDGED",
                    envelopePresent = false,
                    deadlineMs = null,
                ),
            )

        override fun submitReceipt(
            evidence: GatewayReceiptEvidence,
        ): GatewayDevicePlaneResult<GatewayReceiptIngressView> {
            receipts += evidence
            return GatewayDevicePlaneResult.Success(
                GatewayReceiptIngressView(
                    classification = "CURRENT_OR_PRIOR_SESSION",
                    requiresW07Reconciliation = false,
                ),
            )
        }
    }

    private class RecordingActionPort(
        private val afterExecute: (() -> Unit)? = null,
    ) : DeviceActionPort {
        var calls = 0

        override fun execute(
            command: DeviceActionCommand,
            context: DeviceActionContext,
        ): DeviceActionResult {
            calls += 1
            afterExecute?.invoke()
            return DeviceActionResult.VerifiedSuccess("verified")
        }
    }

    companion object {
        private const val NOW = 1_000L
        private const val TENANT_ID = "ten_01J00000000000000000000000"
        private const val DEVICE_ID = "dvc_01J00000000000000000000000"
        private const val DEVICE_SESSION_ID = "dvs_01J00000000000000000000000"
        private const val EXECUTION_ID = "exe_01J00000000000000000000000"
        private const val COMMAND_ID = "cmd_01J00000000000000000000000"
        private const val CORRELATION_ID = "cor_01J00000000000000000000000"
        private const val CAPABILITY_ID = "camera.capture"
        private const val PERMISSION = "android.permission.CAMERA"
        private const val DELIVERY_REFERENCE = "delivery:w15j:hardening:1"

        private fun capabilityObservation() =
            NativeCapabilityObservation(
                capabilityId = CAPABILITY_ID,
                availability = NativeCapabilityAvailability.AVAILABLE,
                observedAtMs = 950,
                expiresAtMs = 2_000,
            )

        private fun permission(
            requirement: RuntimePermissionRequirement,
            state: RuntimePermissionState,
        ) =
            RuntimePermissionObservation(
                requirement = requirement,
                state = state,
                observedAtMs = 950,
                expiresAtMs = 2_000,
                shouldShowRationale = false,
            )

        private fun authorization() =
            GatewayW07DeviceExecutionAuthorizationView(
                executionId = EXECUTION_ID,
                tenantId = TENANT_ID,
                deviceId = DEVICE_ID,
                capabilityId = CAPABILITY_ID,
                actionId = "camera.capture",
                arguments = emptyMap(),
                authorizedAtMs = 900,
                expiresAtMs = 1_100,
                authorizesExecution = true,
                cancelled = false,
                targetKind = "DEVICE",
                authoritySource = "W07_CURRENT_EXECUTION_AUTHORITY",
            )

        private fun delivery(): GatewayCommandDeliveryView {
            val envelope =
                GatewayCommandEnvelopeView(
                    deliveryReference = DELIVERY_REFERENCE,
                    commandId = COMMAND_ID,
                    executionId = EXECUTION_ID,
                    correlationId = CORRELATION_ID,
                    tenantId = TENANT_ID,
                    deviceSessionId = DEVICE_SESSION_ID,
                    deviceId = DEVICE_ID,
                    executionTargetKind = "DEVICE",
                    executionTargetBindingReference = DEVICE_ID,
                    deadlineMs = 1_200,
                    deliveryAttempt = 1,
                    replay = false,
                    executionAuthorization = authorization(),
                )
            return GatewayCommandDeliveryView(
                disposition = "DELIVER",
                deliveryReference = DELIVERY_REFERENCE,
                commandId = COMMAND_ID,
                executionId = EXECUTION_ID,
                state = "DELIVERED",
                envelopePresent = true,
                deadlineMs = envelope.deadlineMs,
                envelope = envelope,
            )
        }

        private fun snapshot(
            connectionId: String,
            generation: Int,
        ): GatewayDevicePlaneSnapshot {
            val ref =
                W14DeviceRefView(
                    kind = "AURORA_DEVICE",
                    deviceId = DEVICE_ID,
                    tenantId = TENANT_ID,
                    registrationVersion = 2,
                )
            return GatewayDevicePlaneSnapshot(
                gateway =
                    GatewaySessionNetworkView(
                        protocolVersion = "1.0",
                        sessionId = "gws_01J00000000000000000000000",
                        connectionId = connectionId,
                        generation = generation,
                        tenantId = TENANT_ID,
                        actorKind = "USER",
                        actorIdentityId = "idn_01J00000000000000000000000",
                        correlationId = CORRELATION_ID,
                        authExpiresAtMs = 5_000,
                    ),
                registration = W14DeviceRegistrationView(ref, W14DeviceLifecycleState.ACTIVE),
                deviceSession =
                    W14DeviceSessionTrustView(
                        deviceSessionId = DEVICE_SESSION_ID,
                        connectionId = connectionId,
                        tenantId = TENANT_ID,
                        deviceRef = ref,
                        state = W14DeviceSessionTrustState.ACTIVE,
                        lastEvaluatedAtMs = 900,
                        gatewayAuthExpiresAtMs = 5_000,
                        executionPreconditionSatisfied = true,
                    ),
            )
        }
    }
}
