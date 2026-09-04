package ai.aurora.device.offline

import ai.aurora.device.executor.CurrentW07DeviceAuthorization
import ai.aurora.device.executor.DeviceActionCommand
import ai.aurora.device.executor.DeviceExecutionDecision
import ai.aurora.device.executor.DeviceExecutionEvidence
import ai.aurora.device.executor.DeviceExecutionOutcome
import ai.aurora.device.executor.DeviceExecutionReceipt
import ai.aurora.device.executor.DeviceExecutionRequest
import ai.aurora.device.executor.W07AuthorizedDeviceExecutionView
import ai.aurora.device.session.W14DeviceRefView
import ai.aurora.device.session.W14DeviceSessionTrustState
import ai.aurora.device.session.W14DeviceSessionTrustView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OfflineExecutionQueueTest {
    @Test
    fun safeAcceptedCommandIsQueuedWithoutPersistingAuthority() {
        val fixture = Fixture()

        val decision = fixture.coordinator().enqueue(fixture.candidate()) as OfflineEnqueueDecision.Queued

        assertFalse(decision.record.persistsExecutableAuthority)
        assertEquals(OfflineQueueState.DEFERRED, decision.record.state)
        assertEquals(1, fixture.store.records.size)
        assertEquals(0, fixture.dispatchCalls)
    }

    @Test
    fun duplicateIdempotencyIdentitySurvivesCoordinatorRestartWithoutSecondRecord() {
        val fixture = Fixture()
        fixture.coordinator().enqueue(fixture.candidate())

        val decision = fixture.coordinator().enqueue(fixture.candidate())

        assertTrue(decision is OfflineEnqueueDecision.Duplicate)
        assertEquals(1, fixture.store.records.size)
        assertEquals(0, fixture.dispatchCalls)
    }

    @Test
    fun localPayloadConflictFailsClosedEvenWithSameIdempotencyKey() {
        val fixture = Fixture()
        fixture.coordinator().enqueue(fixture.candidate())
        fixture.w03 = fixture.w03.copy(canonicalPayloadHash = "hash-2")

        val decision =
            fixture.coordinator().enqueue(
                fixture.candidate().copy(canonicalPayloadHash = "hash-2"),
            ) as OfflineEnqueueDecision.Rejected

        assertEquals(OfflineEnqueueRejection.LOCAL_IDEMPOTENCY_CONFLICT, decision.reason)
        assertEquals(1, fixture.store.records.size)
    }

    @Test
    fun w03InflightIsNeverConvertedIntoOfflineReplayPermission() {
        val fixture = Fixture()
        fixture.w03 = fixture.w03.copy(state = W03IdempotencyState.INFLIGHT)

        val decision = fixture.coordinator().enqueue(fixture.candidate()) as OfflineEnqueueDecision.Rejected

        assertEquals(OfflineEnqueueRejection.W03_INFLIGHT_REQUIRES_RECONCILIATION, decision.reason)
        assertEquals(0, fixture.store.records.size)
        assertEquals(0, fixture.dispatchCalls)
    }

    @Test
    fun prolongedOfflineUntilDeadlineExpiryNeverDispatches() {
        val fixture = Fixture()
        fixture.coordinator().enqueue(fixture.candidate())
        fixture.now = 2_000

        val result = fixture.coordinator().drain().single()

        assertEquals(OfflineDrainDisposition.EXPIRED, result.disposition)
        assertEquals(OfflineQueueState.EXPIRED, fixture.store.records.single().state)
        assertEquals(0, fixture.dispatchCalls)
    }

    @Test
    fun revokedSessionAtReconnectNeverDispatches() {
        val fixture = Fixture()
        fixture.coordinator().enqueue(fixture.candidate())
        fixture.session =
            fixture.session.copy(
                state = W14DeviceSessionTrustState.REVOKED,
                executionPreconditionSatisfied = false,
            )

        val result = fixture.coordinator().drain().single()

        assertEquals(OfflineDrainDisposition.STALE_SESSION, result.disposition)
        assertEquals(OfflineQueueState.STALE_SESSION, fixture.store.records.single().state)
        assertEquals(0, fixture.dispatchCalls)
    }

    @Test
    fun reconnectMayRebindOnlyToCurrentW14SessionForSameCanonicalDevice() {
        val fixture = Fixture()
        fixture.coordinator().enqueue(fixture.candidate())
        fixture.session =
            fixture.session.copy(
                deviceSessionId = "session-2",
                connectionId = "connection-2",
                lastEvaluatedAtMs = 990,
            )

        val result = fixture.coordinator().drain().single()

        assertEquals(OfflineDrainDisposition.DISPATCHED_TERMINAL, result.disposition)
        assertEquals("session-2", fixture.lastDispatchedRequest!!.deviceSessionId)
        assertEquals("device-1", fixture.lastDispatchedRequest!!.deviceId)
        assertEquals("tenant-1", fixture.lastDispatchedRequest!!.tenantId)
        assertEquals(1, fixture.dispatchCalls)
    }

    @Test
    fun wrongDeviceReconnectSessionFailsClosed() {
        val fixture = Fixture()
        fixture.coordinator().enqueue(fixture.candidate())
        fixture.session =
            fixture.session.copy(
                deviceRef =
                    W14DeviceRefView(
                        kind = "AURORA_DEVICE",
                        deviceId = "other-device",
                        tenantId = "tenant-1",
                        registrationVersion = 1,
                    ),
            )

        val result = fixture.coordinator().drain().single()

        assertEquals(OfflineDrainDisposition.STALE_SESSION, result.disposition)
        assertEquals(0, fixture.dispatchCalls)
    }

    @Test
    fun revokedOrExpiredW07AuthorityNeverDispatches() {
        val fixture = Fixture()
        fixture.coordinator().enqueue(fixture.candidate())
        fixture.authorization = fixture.authorization.copy(cancelled = true)

        val result = fixture.coordinator().drain().single()

        assertEquals(OfflineDrainDisposition.STALE_AUTHORITY, result.disposition)
        assertEquals(OfflineQueueState.STALE_AUTHORITY, fixture.store.records.single().state)
        assertEquals(0, fixture.dispatchCalls)
    }

    @Test
    fun executionUncertainIsQuarantinedAndNeverBlindlyReplayed() {
        val fixture = Fixture()
        fixture.dispatchOutcome = DeviceExecutionOutcome.EXECUTION_UNCERTAIN
        fixture.coordinator().enqueue(fixture.candidate())

        val first = fixture.coordinator().drain().single()
        val second = fixture.coordinator().drain().single()

        assertEquals(OfflineDrainDisposition.RECONCILIATION_REQUIRED, first.disposition)
        assertEquals(OfflineDrainDisposition.ALREADY_TERMINAL, second.disposition)
        assertEquals(OfflineQueueState.RECONCILIATION_REQUIRED, fixture.store.records.single().state)
        assertEquals(1, fixture.dispatchCalls)
    }

    @Test
    fun lateVerifiedReceiptRetiresDeferredRecordWithoutDispatch() {
        val fixture = Fixture()
        val coordinator = fixture.coordinator()
        coordinator.enqueue(fixture.candidate())

        assertTrue(coordinator.observeReceipt(fixture.receipt(DeviceExecutionOutcome.SUCCEEDED)))
        val drain = coordinator.drain().single()

        assertEquals(OfflineQueueState.TERMINAL_OBSERVED, fixture.store.records.single().state)
        assertEquals(OfflineDrainDisposition.ALREADY_TERMINAL, drain.disposition)
        assertEquals(0, fixture.dispatchCalls)
    }

    @Test
    fun w03CompletionBeforeReconnectDeduplicatesWithoutNativeDispatch() {
        val fixture = Fixture()
        val coordinator = fixture.coordinator()
        coordinator.enqueue(fixture.candidate())
        fixture.w03 = fixture.w03.copy(state = W03IdempotencyState.COMPLETED)

        val result = coordinator.drain().single()

        assertEquals(OfflineDrainDisposition.W03_TERMINAL, result.disposition)
        assertEquals(OfflineQueueState.TERMINAL_OBSERVED, fixture.store.records.single().state)
        assertEquals(0, fixture.dispatchCalls)
    }

    @Test
    fun unresolvedUncertainRecordIsNeverEvictedToMakeCapacity() {
        val fixture = Fixture(maxRecords = 1)
        fixture.dispatchOutcome = DeviceExecutionOutcome.EXECUTION_UNCERTAIN
        fixture.coordinator().enqueue(fixture.candidate())
        fixture.coordinator().drain()

        fixture.w03 =
            fixture.w03.copy(
                key = "idem-2",
                canonicalPayloadHash = "hash-2",
                state = W03IdempotencyState.ACCEPTED,
            )
        val second =
            fixture.coordinator().enqueue(
                fixture.candidate("exec-2", "idem-2", "hash-2"),
            ) as OfflineEnqueueDecision.Rejected

        assertEquals(OfflineEnqueueRejection.CAPACITY_EXCEEDED, second.reason)
        assertEquals(OfflineQueueState.RECONCILIATION_REQUIRED, fixture.store.records.single().state)
    }

    @Test
    fun successfulDrainProducesTerminalProjectionButNeverLocalRetryEligibility() {
        val fixture = Fixture()
        fixture.coordinator().enqueue(fixture.candidate())

        val result = fixture.coordinator().drain().single()

        assertEquals(OfflineDrainDisposition.DISPATCHED_TERMINAL, result.disposition)
        assertEquals(OfflineQueueState.TERMINAL_OBSERVED, fixture.store.records.single().state)
        assertEquals(1, fixture.dispatchCalls)
        assertFalse(fixture.lastReceipt!!.retryEligible)
    }

    private class Fixture(private val maxRecords: Int = 128) {
        var now = 1_000L
        val store = MemoryStore()
        var w03 =
            W03IdempotencyProjection(
                tenantId = "tenant-1",
                key = "idem-1",
                operationName = "device.execute",
                canonicalPayloadHash = "hash-1",
                state = W03IdempotencyState.ACCEPTED,
            )
        var authorization =
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
        var dispatchOutcome = DeviceExecutionOutcome.SUCCEEDED
        var dispatchCalls = 0
        var lastReceipt: DeviceExecutionReceipt? = null
        var lastDispatchedRequest: DeviceExecutionRequest? = null

        fun coordinator(): OfflineExecutionQueueCoordinator =
            OfflineExecutionQueueCoordinator(
                store = store,
                w03Idempotency = CurrentW03IdempotencyProjection { tenantId, key ->
                    w03.takeIf { it.tenantId == tenantId && it.key == key }
                },
                w07Authorization = CurrentW07DeviceAuthorization { executionId ->
                    authorization.takeIf { it.executionId == executionId }
                },
                currentSession = CurrentReconnectDeviceSession { tenantId, deviceId ->
                    session.takeIf {
                        it.tenantId == tenantId && it.deviceRef.deviceId == deviceId
                    }
                },
                dispatcher =
                    DeviceExecutionDispatcher { request ->
                        dispatchCalls += 1
                        lastDispatchedRequest = request
                        completed(request, dispatchOutcome).also { lastReceipt = it.receipt }
                    },
                nowMs = { now },
                maxRecords = maxRecords,
            )

        fun candidate(
            executionId: String = "exec-1",
            idempotencyKey: String = "idem-1",
            payloadHash: String = "hash-1",
        ): OfflineEnqueueRequest =
            OfflineEnqueueRequest(
                idempotencyKey = idempotencyKey,
                operationName = "device.execute",
                canonicalPayloadHash = payloadHash,
                execution =
                    DeviceExecutionRequest(
                        executionId = executionId,
                        tenantId = "tenant-1",
                        deviceId = "device-1",
                        deviceSessionId = "session-1",
                        capabilityId = "camera.capture",
                        action = DeviceActionCommand("camera.capture"),
                        deadlineAtMs = 1_500,
                    ),
                safety = OfflineDeferralSafety.SAFE_TO_DEFER,
            )

        fun receipt(outcome: DeviceExecutionOutcome): DeviceExecutionReceipt =
            DeviceExecutionReceipt(
                executionId = "exec-1",
                outcome = outcome,
                completedAtMs = now,
                requiresReconciliation = outcome == DeviceExecutionOutcome.EXECUTION_UNCERTAIN,
                retryEligible = false,
            )

        private fun completed(
            request: DeviceExecutionRequest,
            outcome: DeviceExecutionOutcome,
        ): DeviceExecutionDecision.Completed {
            val receipt =
                DeviceExecutionReceipt(
                    executionId = request.executionId,
                    outcome = outcome,
                    completedAtMs = now,
                    requiresReconciliation = outcome == DeviceExecutionOutcome.EXECUTION_UNCERTAIN,
                    retryEligible = false,
                )
            return DeviceExecutionDecision.Completed(
                receipt = receipt,
                evidence =
                    DeviceExecutionEvidence(
                        executionId = request.executionId,
                        capabilityId = request.capabilityId,
                        deviceSessionId = request.deviceSessionId,
                        outcome = outcome,
                    ),
            )
        }
    }

    private class MemoryStore : OfflineExecutionQueueStore {
        var records: List<OfflineDeferredExecution> = emptyList()

        override fun loadAll(): List<OfflineDeferredExecution> = records

        override fun saveAll(records: List<OfflineDeferredExecution>) {
            this.records = records.toList()
        }
    }
}