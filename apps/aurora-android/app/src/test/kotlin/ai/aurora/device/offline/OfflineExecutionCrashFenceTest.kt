package ai.aurora.device.offline

import ai.aurora.device.executor.CurrentW07DeviceAuthorization
import ai.aurora.device.executor.DeviceActionCommand
import ai.aurora.device.executor.DeviceExecutionDecision
import ai.aurora.device.executor.DeviceExecutionRequest
import ai.aurora.device.executor.W07AuthorizedDeviceExecutionView
import ai.aurora.device.session.W14DeviceRefView
import ai.aurora.device.session.W14DeviceSessionTrustState
import ai.aurora.device.session.W14DeviceSessionTrustView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OfflineExecutionCrashFenceTest {
    @Test
    fun processDeathAfterDispatchBoundaryCannotBlindlyReplayOnRestart() {
        val store = MemoryStore()
        var dispatchCalls = 0
        val dependencies = Dependencies()
        val crashing =
            coordinator(
                store = store,
                dependencies = dependencies,
                dispatcher =
                    DeviceExecutionDispatcher {
                        dispatchCalls += 1
                        assertEquals(
                            OfflineQueueState.RECONCILIATION_REQUIRED,
                            store.records.single().state,
                        )
                        throw IllegalStateException("simulated process death after dispatch boundary")
                    },
            )

        crashing.enqueue(candidate())
        var crashed = false
        try {
            crashing.drain()
        } catch (_: IllegalStateException) {
            crashed = true
        }

        assertTrue(crashed)
        assertEquals(1, dispatchCalls)
        assertEquals(OfflineQueueState.RECONCILIATION_REQUIRED, store.records.single().state)

        val restarted =
            coordinator(
                store = store,
                dependencies = dependencies,
                dispatcher =
                    DeviceExecutionDispatcher {
                        dispatchCalls += 1
                        error("restarted coordinator must not replay quarantined work")
                    },
            )
        val result = restarted.drain().single()

        assertEquals(OfflineDrainDisposition.ALREADY_TERMINAL, result.disposition)
        assertEquals(1, dispatchCalls)
        assertEquals(OfflineQueueState.RECONCILIATION_REQUIRED, store.records.single().state)
    }

    private fun coordinator(
        store: OfflineExecutionQueueStore,
        dependencies: Dependencies,
        dispatcher: DeviceExecutionDispatcher,
    ) =
        OfflineExecutionQueueCoordinator(
            store = store,
            w03Idempotency = CurrentW03IdempotencyProjection { tenantId, key ->
                dependencies.w03.takeIf { it.tenantId == tenantId && it.key == key }
            },
            w07Authorization = CurrentW07DeviceAuthorization { executionId ->
                dependencies.authorization.takeIf { it.executionId == executionId }
            },
            currentSession = CurrentReconnectDeviceSession { tenantId, deviceId ->
                dependencies.session.takeIf {
                    it.tenantId == tenantId && it.deviceRef.deviceId == deviceId
                }
            },
            dispatcher = dispatcher,
            nowMs = { 1_000L },
        )

    private fun candidate() =
        OfflineEnqueueRequest(
            idempotencyKey = "idem-crash-fence",
            operationName = "device.execute",
            canonicalPayloadHash = "hash-crash-fence",
            execution =
                DeviceExecutionRequest(
                    executionId = "exec-crash-fence",
                    tenantId = "tenant-1",
                    deviceId = "device-1",
                    deviceSessionId = "session-1",
                    capabilityId = "camera.capture",
                    action = DeviceActionCommand("camera.capture"),
                    deadlineAtMs = 2_000,
                ),
            safety = OfflineDeferralSafety.SAFE_TO_DEFER,
        )

    private class Dependencies {
        val w03 =
            W03IdempotencyProjection(
                tenantId = "tenant-1",
                key = "idem-crash-fence",
                operationName = "device.execute",
                canonicalPayloadHash = "hash-crash-fence",
                state = W03IdempotencyState.ACCEPTED,
            )
        val authorization =
            W07AuthorizedDeviceExecutionView(
                executionId = "exec-crash-fence",
                tenantId = "tenant-1",
                deviceId = "device-1",
                capabilityId = "camera.capture",
                authorizedAtMs = 900,
                expiresAtMs = 2_000,
                authorizesExecution = true,
            )
        val session =
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
    }

    private class MemoryStore : OfflineExecutionQueueStore {
        var records: List<OfflineDeferredExecution> = emptyList()

        override fun loadAll(): List<OfflineDeferredExecution> = records

        override fun saveAll(records: List<OfflineDeferredExecution>) {
            this.records = records.toList()
        }
    }
}
