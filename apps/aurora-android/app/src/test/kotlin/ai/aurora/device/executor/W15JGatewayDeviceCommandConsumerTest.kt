package ai.aurora.device.executor

import ai.aurora.device.app.AppInstallState
import ai.aurora.device.app.AppIntegrationResolver
import ai.aurora.device.app.AppRouteRuntimeObservation
import ai.aurora.device.app.InstalledAppBinding
import ai.aurora.device.app.InstalledAppRuntimeSnapshot
import ai.aurora.device.app.InstalledAppRuntimeProbe
import ai.aurora.device.app.IntentRouteBinding
import ai.aurora.device.capability.NativeCapabilityAvailability
import ai.aurora.device.capability.NativeCapabilityBinding
import ai.aurora.device.capability.NativeCapabilityObservation
import ai.aurora.device.capability.NativeCapabilityResolution
import ai.aurora.device.network.DeviceReceiptReportedState
import ai.aurora.device.network.GatewayCommandDeliveryView
import ai.aurora.device.network.GatewayCommandEnvelopeView
import ai.aurora.device.network.GatewayDevicePlaneClientError
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class W15JGatewayDeviceCommandConsumerTest {
    @Test
    fun `current W07 authorization executes exactly one native effect and reports evidence`() {
        val fixture = Fixture()

        val result = fixture.consumer().consume(COMMAND_ID) as W15JDeviceCommandConsumptionResult.Executed

        assertEquals(DeviceExecutionOutcome.SUCCEEDED, result.outcome)
        assertFalse(result.requiresReconciliation)
        assertFalse(result.retryAuthorized)
        assertEquals(1, fixture.action.calls)
        assertEquals(1, fixture.gateway.ackCalls)
        assertEquals(1, fixture.gateway.receipts.size)
        assertEquals(DeviceReceiptReportedState.COMPLETED, fixture.gateway.receipts.single().reportedState)
        assertTrue(fixture.gateway.receipts.single().receiptId.startsWith("rcp_"))
        assertTrue(fixture.gateway.receipts.single().evidenceId?.startsWith("evd_") == true)
    }

    @Test
    fun `validated app descriptor reaches executor only through authorized appId`() {
        val appAuthorization =
            authorization(
                capabilityId = APP_CAPABILITY_ID,
                actionId = W15_OPEN_VALIDATED_APP_ACTION,
                arguments = mapOf("appId" to APP_ID),
            )
        val fixture = Fixture(authorization = appAuthorization)
        fixture.action.expectedActionId = W15_OPEN_VALIDATED_APP_ACTION
        fixture.action.expectedCapabilityId = APP_CAPABILITY_ID
        val result =
            fixture.consumer(appIntegrationResolver = readyAppResolver())
                .consume(COMMAND_ID) as W15JDeviceCommandConsumptionResult.Executed

        assertEquals(DeviceExecutionOutcome.SUCCEEDED, result.outcome)
        assertEquals(1, fixture.action.calls)
        assertEquals(APP_ID, fixture.action.lastContext?.app?.appId)
        assertEquals(APP_PACKAGE, fixture.action.lastContext?.app?.packageName)
    }

    @Test
    fun `missing current app descriptor blocks before native app effect`() {
        val appAuthorization =
            authorization(
                capabilityId = APP_CAPABILITY_ID,
                actionId = W15_OPEN_VALIDATED_APP_ACTION,
                arguments = mapOf("appId" to APP_ID),
            )
        val fixture = Fixture(authorization = appAuthorization)
        fixture.action.expectedActionId = W15_OPEN_VALIDATED_APP_ACTION
        fixture.action.expectedCapabilityId = APP_CAPABILITY_ID
        val result =
            fixture.consumer(appIntegrationResolver = null)
                .consume(COMMAND_ID) as W15JDeviceCommandConsumptionResult.NoEffect

        assertEquals(0, fixture.action.calls)
        assertFalse(result.retryAuthorized)
        assertEquals(DeviceReceiptReportedState.FAILED, fixture.gateway.receipts.single().reportedState)
    }

    @Test
    fun `stale W07 authorization produces zero effect and cannot authorize retry`() {
        val fixture = Fixture(authorization = authorization(authorizedAtMs = 900, expiresAtMs = 999))

        val result = fixture.consumer().consume(COMMAND_ID) as W15JDeviceCommandConsumptionResult.NoEffect

        assertEquals(0, fixture.action.calls)
        assertFalse(result.retryAuthorized)
        assertEquals(1, fixture.gateway.receipts.size)
        assertEquals(DeviceReceiptReportedState.FAILED, fixture.gateway.receipts.single().reportedState)
    }

    @Test
    fun `ack transport uncertainty blocks before native effect and requires reconciliation`() {
        val fixture = Fixture()
        fixture.gateway.ackResult =
            GatewayDevicePlaneResult.Rejected(
                error = GatewayDevicePlaneClientError.TRANSPORT_UNCERTAIN,
                requiresReconciliation = true,
            )

        val result = fixture.consumer().consume(COMMAND_ID) as W15JDeviceCommandConsumptionResult.NoEffect

        assertEquals(0, fixture.action.calls)
        assertTrue(result.requiresReconciliation)
        assertFalse(result.retryAuthorized)
        assertTrue(fixture.gateway.receipts.isEmpty())
    }

    @Test
    fun `duplicate delivery is fenced before a second ack or native effect`() {
        val fixture = Fixture()
        val consumer = fixture.consumer()

        assertTrue(consumer.consume(COMMAND_ID) is W15JDeviceCommandConsumptionResult.Executed)
        val duplicate = consumer.consume(COMMAND_ID) as W15JDeviceCommandConsumptionResult.NoEffect

        assertEquals(2, fixture.gateway.claimCalls)
        assertEquals(1, fixture.gateway.ackCalls)
        assertEquals(1, fixture.action.calls)
        assertTrue(duplicate.reason.contains("duplicate"))
        assertFalse(duplicate.retryAuthorized)
    }

    @Test
    fun `kill switch blocks native effect even after authenticated claim and ack`() {
        val fixture = Fixture()
        val consumer =
            fixture.consumer(
                control = DeviceExecutionControl {
                    DeviceExecutionControlSnapshot(killSwitchEngaged = true)
                },
            )

        val result = consumer.consume(COMMAND_ID) as W15JDeviceCommandConsumptionResult.NoEffect

        assertEquals(0, fixture.action.calls)
        assertEquals(1, fixture.gateway.ackCalls)
        assertEquals(DeviceReceiptReportedState.FAILED, fixture.gateway.receipts.single().reportedState)
        assertFalse(result.retryAuthorized)
    }

    @Test
    fun `ambiguous native effect becomes EXECUTION_UNCERTAIN and never blind retries`() {
        val fixture = Fixture()
        fixture.action.result = DeviceActionResult.Ambiguous("readback unavailable after dispatch")

        val result = fixture.consumer().consume(COMMAND_ID) as W15JDeviceCommandConsumptionResult.Executed

        assertEquals(DeviceExecutionOutcome.EXECUTION_UNCERTAIN, result.outcome)
        assertTrue(result.requiresReconciliation)
        assertFalse(result.retryAuthorized)
        assertEquals(DeviceReceiptReportedState.UNCERTAIN, fixture.gateway.receipts.single().reportedState)
    }

    @Test
    fun `receipt transport loss after verified local effect requires reconciliation`() {
        val fixture = Fixture()
        fixture.gateway.receiptResult =
            GatewayDevicePlaneResult.Rejected(
                error = GatewayDevicePlaneClientError.TRANSPORT_UNCERTAIN,
                requiresReconciliation = true,
            )

        val result = fixture.consumer().consume(COMMAND_ID) as W15JDeviceCommandConsumptionResult.Executed

        assertEquals(DeviceExecutionOutcome.SUCCEEDED, result.outcome)
        assertEquals(1, fixture.action.calls)
        assertTrue(result.requiresReconciliation)
        assertNull(result.receiptIngress)
        assertFalse(result.retryAuthorized)
    }

    @Test
    fun `claim bound to another device is rejected before ack and effect`() {
        val otherAuthorization =
            authorization(deviceId = OTHER_DEVICE_ID)
        val fixture =
            Fixture(
                envelopeDeviceId = OTHER_DEVICE_ID,
                authorization = otherAuthorization,
            )

        val result = fixture.consumer().consume(COMMAND_ID) as W15JDeviceCommandConsumptionResult.NoEffect

        assertTrue(result.reason.contains("W14 binding"))
        assertEquals(0, fixture.gateway.ackCalls)
        assertEquals(0, fixture.action.calls)
        assertTrue(fixture.gateway.receipts.isEmpty())
    }

    private class Fixture(
        envelopeDeviceId: String = DEVICE_ID,
        authorization: GatewayW07DeviceExecutionAuthorizationView = authorization(),
    ) {
        val action = RecordingActionPort()
        val gateway =
            FakeGatewayPort(
                snapshot = snapshot(),
                claim = delivery(envelopeDeviceId, authorization),
            )

        fun consumer(
            control: DeviceExecutionControl = DeviceExecutionControl { DeviceExecutionControlSnapshot() },
            appIntegrationResolver: AppIntegrationResolver? = null,
        ): W15JGatewayDeviceCommandConsumer =
            W15JGatewayDeviceCommandConsumer(
                gateway = gateway,
                capabilityResolution =
                    CurrentNativeCapabilityResolution {
                        NativeCapabilityResolution.Ready(
                            binding = NativeCapabilityBinding(authorization.capabilityId),
                            observation = nativeObservation(authorization.capabilityId),
                        )
                    },
                capabilityObservation = CurrentNativeCapabilityObservation { capabilityId -> nativeObservation(capabilityId) },
                permissionObservation =
                    CurrentRuntimePermissionObservation { requirement -> grantedPermission(requirement) },
                actionPort = action,
                appIntegrationResolver = appIntegrationResolver,
                idFactory = CanonicalLocalEvidenceIdFactory(nowMs = { NOW }),
                control = control,
                nowMs = { NOW },
            )
    }

    private class FakeGatewayPort(
        private val snapshot: GatewayDevicePlaneSnapshot,
        private val claim: GatewayCommandDeliveryView,
    ) : W15JGatewayDeviceCommandPort {
        var claimCalls = 0
        var ackCalls = 0
        val receipts = mutableListOf<GatewayReceiptEvidence>()
        var ackResult: GatewayDevicePlaneResult<GatewayCommandDeliveryView> =
            GatewayDevicePlaneResult.Success(acknowledgedDelivery())
        var receiptResult: GatewayDevicePlaneResult<GatewayReceiptIngressView> =
            GatewayDevicePlaneResult.Success(
                GatewayReceiptIngressView(
                    classification = "CURRENT_SESSION",
                    requiresW07Reconciliation = false,
                ),
            )

        override fun currentSnapshot(): GatewayDevicePlaneResult<GatewayDevicePlaneSnapshot> =
            GatewayDevicePlaneResult.Success(snapshot)

        override fun claimCommand(commandId: String): GatewayDevicePlaneResult<GatewayCommandDeliveryView> {
            claimCalls += 1
            return GatewayDevicePlaneResult.Success(claim)
        }

        override fun acknowledgeCommand(
            commandId: String,
            deliveryReference: String,
            ackReference: String,
        ): GatewayDevicePlaneResult<GatewayCommandDeliveryView> {
            ackCalls += 1
            return ackResult
        }

        override fun submitReceipt(
            evidence: GatewayReceiptEvidence,
        ): GatewayDevicePlaneResult<GatewayReceiptIngressView> {
            receipts += evidence
            return receiptResult
        }
    }

    private class RecordingActionPort : DeviceActionPort {
        var calls = 0
        var result: DeviceActionResult = DeviceActionResult.VerifiedSuccess("verified-readback")
        var expectedActionId: String = W15J_AUDIO_VOLUME_STEP_UP_ACTION
        var expectedCapabilityId: String = CAPABILITY_ID
        var lastContext: DeviceActionContext? = null

        override fun execute(command: DeviceActionCommand, context: DeviceActionContext): DeviceActionResult {
            calls += 1
            lastContext = context
            assertEquals(expectedActionId, command.actionId)
            assertEquals(expectedCapabilityId, context.capabilityId)
            return result
        }
    }

    companion object {
        private const val NOW = 1_000L
        private const val TENANT_ID = "ten_01J00000000000000000000000"
        private const val DEVICE_ID = "dvc_01J00000000000000000000000"
        private const val OTHER_DEVICE_ID = "dvc_01J11111111111111111111111"
        private const val DEVICE_SESSION_ID = "dvs_01J00000000000000000000000"
        private const val EXECUTION_ID = "exe_01J00000000000000000000000"
        private const val COMMAND_ID = "cmd_01J00000000000000000000000"
        private const val CORRELATION_ID = "cor_01J00000000000000000000000"
        private const val CAPABILITY_ID = "audio.volume.set"
        private const val APP_CAPABILITY_ID = "app.open"
        private const val APP_ID = "aurora.local"
        private const val APP_PACKAGE = "ai.aurora.device.local"
        private const val DELIVERY_REFERENCE = "delivery:w15j:1"

        private fun authorization(
            deviceId: String = DEVICE_ID,
            authorizedAtMs: Long = 900,
            expiresAtMs: Long = 1_100,
            capabilityId: String = CAPABILITY_ID,
            actionId: String = W15J_AUDIO_VOLUME_STEP_UP_ACTION,
            arguments: Map<String, String> = emptyMap(),
        ) =
            GatewayW07DeviceExecutionAuthorizationView(
                executionId = EXECUTION_ID,
                tenantId = TENANT_ID,
                deviceId = deviceId,
                capabilityId = capabilityId,
                actionId = actionId,
                arguments = arguments,
                authorizedAtMs = authorizedAtMs,
                expiresAtMs = expiresAtMs,
                authorizesExecution = true,
                cancelled = false,
                targetKind = "DEVICE",
                authoritySource = "W07_CURRENT_EXECUTION_AUTHORITY",
            )

        private fun delivery(
            deviceId: String,
            authorization: GatewayW07DeviceExecutionAuthorizationView,
        ): GatewayCommandDeliveryView {
            val envelope =
                GatewayCommandEnvelopeView(
                    deliveryReference = DELIVERY_REFERENCE,
                    commandId = COMMAND_ID,
                    executionId = EXECUTION_ID,
                    correlationId = CORRELATION_ID,
                    tenantId = TENANT_ID,
                    deviceSessionId = DEVICE_SESSION_ID,
                    deviceId = deviceId,
                    executionTargetKind = "DEVICE",
                    executionTargetBindingReference = deviceId,
                    deadlineMs = 1_200,
                    deliveryAttempt = 1,
                    replay = false,
                    executionAuthorization = authorization,
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

        private fun acknowledgedDelivery() =
            GatewayCommandDeliveryView(
                disposition = "ACKNOWLEDGED",
                deliveryReference = DELIVERY_REFERENCE,
                commandId = COMMAND_ID,
                executionId = EXECUTION_ID,
                state = "ACKNOWLEDGED",
                envelopePresent = false,
                deadlineMs = null,
            )

        private fun snapshot(): GatewayDevicePlaneSnapshot {
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
                        connectionId = "conn-1",
                        generation = 1,
                        tenantId = TENANT_ID,
                        actorKind = "USER",
                        actorIdentityId = "idn_01J00000000000000000000000",
                        correlationId = CORRELATION_ID,
                        authExpiresAtMs = 5_000,
                    ),
                registration =
                    W14DeviceRegistrationView(
                        ref = ref,
                        state = W14DeviceLifecycleState.ACTIVE,
                    ),
                deviceSession =
                    W14DeviceSessionTrustView(
                        deviceSessionId = DEVICE_SESSION_ID,
                        connectionId = "conn-1",
                        tenantId = TENANT_ID,
                        deviceRef = ref,
                        state = W14DeviceSessionTrustState.ACTIVE,
                        lastEvaluatedAtMs = 900,
                        gatewayAuthExpiresAtMs = 5_000,
                        executionPreconditionSatisfied = true,
                    ),
            )
        }

        private fun nativeObservation(capabilityId: String = CAPABILITY_ID) =
            NativeCapabilityObservation(
                capabilityId = capabilityId,
                availability = NativeCapabilityAvailability.AVAILABLE,
                observedAtMs = 950,
                expiresAtMs = 2_000,
            )

        private fun readyAppResolver() =
            AppIntegrationResolver(
                bindings =
                    listOf(
                        InstalledAppBinding(
                            appId = APP_ID,
                            packageName = APP_PACKAGE,
                            trustedSignerSha256 = setOf("a".repeat(64)),
                            routes = listOf(IntentRouteBinding("aurora-main", "android.intent.action.MAIN", true)),
                        ),
                    ),
                runtimeProbe =
                    InstalledAppRuntimeProbe { binding ->
                        InstalledAppRuntimeSnapshot(
                            observedAtMs = 950,
                            installState = AppInstallState.INSTALLED,
                            packageName = binding.packageName,
                            currentSignerSha256 = setOf("a".repeat(64)),
                            routes = mapOf(
                                "aurora-main" to
                                    AppRouteRuntimeObservation(
                                        routeId = "aurora-main",
                                        available = true,
                                        resolvedPackageName = binding.packageName,
                                    ),
                            ),
                        )
                    },
                nowMs = { NOW },
            )

        private fun grantedPermission(
            requirement: RuntimePermissionRequirement,
        ) =
            RuntimePermissionObservation(
                requirement = requirement,
                state = RuntimePermissionState.GRANTED,
                observedAtMs = 950,
                expiresAtMs = 2_000,
                shouldShowRationale = false,
            )
    }
}
