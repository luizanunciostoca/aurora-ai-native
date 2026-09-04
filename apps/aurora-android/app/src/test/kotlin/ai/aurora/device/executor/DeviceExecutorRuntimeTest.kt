package ai.aurora.device.executor

import ai.aurora.device.capability.NativeCapabilityAvailability
import ai.aurora.device.capability.NativeCapabilityObservation
import ai.aurora.device.permission.RuntimePermissionObservation
import ai.aurora.device.permission.RuntimePermissionRequirement
import ai.aurora.device.permission.RuntimePermissionState
import ai.aurora.device.session.W14DeviceRefView
import ai.aurora.device.session.W14DeviceSessionTrustState
import ai.aurora.device.session.W14DeviceSessionTrustView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceExecutorRuntimeTest {
    @Test
    fun verifiedActionRunsOnlyAfterAllCurrentOwningPreconditionsPass() {
        val fixture = Fixture()
        fixture.actionResult = DeviceActionResult.VerifiedSuccess("opened")

        val decision = fixture.runtime().execute(fixture.request()) as DeviceExecutionDecision.Completed

        assertEquals(DeviceExecutionOutcome.SUCCEEDED, decision.receipt.outcome)
        assertFalse(decision.receipt.requiresReconciliation)
        assertFalse(decision.receipt.retryEligible)
        assertEquals("opened", decision.evidence.readback)
        assertEquals(1, fixture.actionCalls)
    }

    @Test
    fun missingCurrentW07AuthorizationFailsClosedBeforeNativeAction() {
        val fixture = Fixture()
        fixture.authorization = null

        val decision = fixture.runtime().execute(fixture.request()) as DeviceExecutionDecision.Rejected

        assertEquals(DeviceExecutionRejection.W07_AUTHORIZATION_MISSING, decision.reason)
        assertEquals(0, fixture.actionCalls)
    }

    @Test
    fun mismatchedW07TargetFailsClosed() {
        val fixture = Fixture()
        fixture.authorization = fixture.authorization!!.copy(deviceId = "other-device")

        val decision = fixture.runtime().execute(fixture.request()) as DeviceExecutionDecision.Rejected

        assertEquals(DeviceExecutionRejection.W07_TARGET_MISMATCH, decision.reason)
        assertEquals(0, fixture.actionCalls)
    }

    @Test
    fun revokedOrExpiredSessionCannotBePromotedIntoAuthority() {
        val fixture = Fixture()
        fixture.session =
            fixture.session.copy(
                state = W14DeviceSessionTrustState.REVOKED,
                executionPreconditionSatisfied = false,
            )

        val decision = fixture.runtime().execute(fixture.request()) as DeviceExecutionDecision.Rejected

        assertEquals(DeviceExecutionRejection.SESSION_TRUST_NOT_CURRENT, decision.reason)
        assertEquals(0, fixture.actionCalls)
    }

    @Test
    fun staleCapabilityFailsClosed() {
        val fixture = Fixture()
        fixture.capability = fixture.capability.copy(expiresAtMs = fixture.now)

        val decision = fixture.runtime().execute(fixture.request()) as DeviceExecutionDecision.Rejected

        assertEquals(DeviceExecutionRejection.CAPABILITY_NOT_CURRENT, decision.reason)
        assertEquals(0, fixture.actionCalls)
    }

    @Test
    fun deniedRuntimePermissionFailsClosedWithoutPromptingOrExecuting() {
        val fixture = Fixture()
        fixture.permission =
            fixture.permission.copy(
                state = RuntimePermissionState.DENIED,
            )

        val decision = fixture.runtime().execute(fixture.request()) as DeviceExecutionDecision.Rejected

        assertEquals(DeviceExecutionRejection.PERMISSION_PRECONDITION_NOT_SATISFIED, decision.reason)
        assertEquals(0, fixture.actionCalls)
    }

    @Test
    fun ambiguousNativeOutcomeBecomesExecutionUncertainAndNeverLocalRetryPermission() {
        val fixture = Fixture()
        fixture.actionResult = DeviceActionResult.Ambiguous("no reliable readback")

        val decision = fixture.runtime().execute(fixture.request()) as DeviceExecutionDecision.Completed

        assertEquals(DeviceExecutionOutcome.EXECUTION_UNCERTAIN, decision.receipt.outcome)
        assertTrue(decision.receipt.requiresReconciliation)
        assertFalse(decision.receipt.retryEligible)
        assertEquals("no reliable readback", decision.evidence.detail)
    }

    @Test
    fun actionExceptionIsUncertainBecauseSideEffectMayAlreadyHaveOccurred() {
        val fixture = Fixture()
        fixture.throwFromAction = true

        val decision = fixture.runtime().execute(fixture.request()) as DeviceExecutionDecision.Completed

        assertEquals(DeviceExecutionOutcome.EXECUTION_UNCERTAIN, decision.receipt.outcome)
        assertTrue(decision.receipt.requiresReconciliation)
        assertFalse(decision.receipt.retryEligible)
    }

    @Test
    fun killSwitchBeforeDispatchPreventsSideEffect() {
        val fixture = Fixture()
        fixture.control = DeviceExecutionControlSnapshot(killSwitchEngaged = true)

        val decision = fixture.runtime().execute(fixture.request()) as DeviceExecutionDecision.Rejected

        assertEquals(DeviceExecutionRejection.KILL_SWITCH_ENGAGED, decision.reason)
        assertEquals(0, fixture.actionCalls)
    }

    @Test
    fun cancellationRaceAfterDispatchIsExecutionUncertain() {
        val fixture = Fixture()
        fixture.controlAfterAction = DeviceExecutionControlSnapshot(cancelled = true)

        val decision = fixture.runtime().execute(fixture.request()) as DeviceExecutionDecision.Completed

        assertEquals(DeviceExecutionOutcome.EXECUTION_UNCERTAIN, decision.receipt.outcome)
        assertTrue(decision.receipt.requiresReconciliation)
        assertFalse(decision.receipt.retryEligible)
        assertEquals(1, fixture.actionCalls)
    }

    @Test
    fun expiredDeadlineRejectsBeforeAnyAuthorityOrNativeWork() {
        val fixture = Fixture()

        val decision =
            fixture.runtime().execute(fixture.request().copy(deadlineAtMs = fixture.now))
                as DeviceExecutionDecision.Rejected

        assertEquals(DeviceExecutionRejection.DEADLINE_EXPIRED, decision.reason)
        assertEquals(0, fixture.actionCalls)
    }

    private class Fixture {
        var now = 1_000L
        private val permissionRequirement = RuntimePermissionRequirement("android.permission.CAMERA")
        var authorization: W07AuthorizedDeviceExecutionView? =
            W07AuthorizedDeviceExecutionView(
                executionId = "exec-1",
                tenantId = "tenant-1",
                deviceId = "device-1",
                capabilityId = "camera.capture",
                authorizedAtMs = 900,
                expiresAtMs = 2_000,
                authorizesExecution = true,
            )
        var session =
            W14DeviceSessionTrustView(
                deviceSessionId = "session-1",
                connectionId = "connection-1",
                tenantId = "tenant-1",
                deviceRef =
                    W14DeviceRefView(
                        kind = "AURORA_DEVICE",
                        deviceId = "device-1",
                        tenantId = "tenant-1",
                        registrationVersion = 1,
                    ),
                state = W14DeviceSessionTrustState.ACTIVE,
                lastEvaluatedAtMs = 950,
                gatewayAuthExpiresAtMs = 2_000,
                executionPreconditionSatisfied = true,
            )
        var capability =
            NativeCapabilityObservation(
                capabilityId = "camera.capture",
                availability = NativeCapabilityAvailability.AVAILABLE,
                observedAtMs = 950,
                expiresAtMs = 2_000,
            )
        var permission =
            RuntimePermissionObservation(
                requirement = permissionRequirement,
                state = RuntimePermissionState.GRANTED,
                observedAtMs = 950,
                expiresAtMs = 2_000,
                shouldShowRationale = false,
            )
        var control = DeviceExecutionControlSnapshot()
        var controlAfterAction: DeviceExecutionControlSnapshot? = null
        var actionResult: DeviceActionResult = DeviceActionResult.VerifiedSuccess()
        var throwFromAction = false
        var actionCalls = 0
        private var controlReads = 0

        fun request(): DeviceExecutionRequest =
            DeviceExecutionRequest(
                executionId = "exec-1",
                tenantId = "tenant-1",
                deviceId = "device-1",
                deviceSessionId = "session-1",
                capabilityId = "camera.capture",
                permissionRequirements = listOf(permissionRequirement),
                action = DeviceActionCommand("camera.capture"),
                deadlineAtMs = 1_500,
            )

        fun runtime(): DeviceExecutorRuntime =
            DeviceExecutorRuntime(
                w07Authorization = CurrentW07DeviceAuthorization { authorization },
                sessionTrust = CurrentDeviceSessionTrust { session },
                capabilityObservation = CurrentNativeCapabilityObservation { capability },
                permissionObservation = CurrentRuntimePermissionObservation { permission },
                appIntegration = CurrentAppIntegrationDescriptor { null },
                control =
                    DeviceExecutionControl {
                        controlReads += 1
                        if (controlReads > 1) controlAfterAction ?: control else control
                    },
                actionPort =
                    DeviceActionPort { _, _ ->
                        actionCalls += 1
                        if (throwFromAction) throw IllegalStateException("transport result unknown")
                        actionResult
                    },
                nowMs = { now },
            )
    }
}
