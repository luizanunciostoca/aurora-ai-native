package ai.aurora.device.offline

import ai.aurora.device.executor.CurrentW07DeviceAuthorization
import ai.aurora.device.executor.DeviceExecutionDecision
import ai.aurora.device.executor.DeviceExecutionOutcome
import ai.aurora.device.executor.DeviceExecutionRequest
import ai.aurora.device.executor.DeviceExecutionRejection
import ai.aurora.device.executor.DeviceExecutionReceipt
import ai.aurora.device.session.W14DeviceSessionTrustState
import ai.aurora.device.session.W14DeviceSessionTrustView

private const val MAX_OFFLINE_REFERENCE_BYTES = 512
private const val MAX_OFFLINE_PERMISSION_REQUIREMENTS = 16
private const val MAX_OFFLINE_RECORD_BYTES = 8 * 1024
private const val OFFLINE_RECORD_FIXED_OVERHEAD_BYTES = 256

/** Android consumer view of the accepted W03 idempotency status vocabulary. */
enum class W03IdempotencyState {
    ACCEPTED,
    REJECTED,
    INFLIGHT,
    COMPLETED,
}

/** Current W03 idempotency projection. W15-H never creates or advances this canonical state. */
data class W03IdempotencyProjection(
    val tenantId: String,
    val key: String,
    val operationName: String,
    val canonicalPayloadHash: String,
    val state: W03IdempotencyState,
) {
    init {
        require(tenantId.isNotBlank()) { "tenantId must not be blank" }
        require(key.isNotBlank()) { "idempotency key must not be blank" }
        require(operationName.isNotBlank()) { "operationName must not be blank" }
        require(canonicalPayloadHash.isNotBlank()) { "canonicalPayloadHash must not be blank" }
    }
}

fun interface CurrentW03IdempotencyProjection {
    fun current(tenantId: String, key: String): W03IdempotencyProjection?
}

/** W14-owned lookup of the currently trusted reconnect session for one canonical device. */
fun interface CurrentReconnectDeviceSession {
    fun current(tenantId: String, deviceId: String): W14DeviceSessionTrustView?
}

enum class OfflineDeferralSafety {
    SAFE_TO_DEFER,
    RECONCILIATION_ONLY,
    NOT_DEFERRABLE,
}

enum class OfflineQueueState {
    DEFERRED,
    RECONCILIATION_REQUIRED,
    TERMINAL_OBSERVED,
    EXPIRED,
    STALE_AUTHORITY,
    STALE_SESSION,
}

data class OfflineDeferredExecution(
    val idempotencyKey: String,
    val operationName: String,
    val canonicalPayloadHash: String,
    val request: DeviceExecutionRequest,
    val enqueuedAtMs: Long,
    val state: OfflineQueueState = OfflineQueueState.DEFERRED,
) {
    init {
        require(idempotencyKey.isNotBlank()) { "idempotencyKey must not be blank" }
        require(operationName.isNotBlank()) { "operationName must not be blank" }
        require(canonicalPayloadHash.isNotBlank()) { "canonicalPayloadHash must not be blank" }
        require(enqueuedAtMs >= 0) { "enqueuedAtMs must be non-negative" }
        require(request.action.arguments.isEmpty()) {
            "offline queue must not persist arbitrary action arguments"
        }
        require(persistedRecordWithinBounds(idempotencyKey, operationName, canonicalPayloadHash, request)) {
            "offline queue record exceeds persistence bounds"
        }
    }

    /** Intentionally contains no PolicyToken/OwnerDecision/W07 authorization snapshot. */
    val persistsExecutableAuthority: Boolean
        get() = false
}

interface OfflineExecutionQueueStore {
    fun loadAll(): List<OfflineDeferredExecution>

    fun saveAll(records: List<OfflineDeferredExecution>)
}

fun interface DeviceExecutionDispatcher {
    fun execute(request: DeviceExecutionRequest): DeviceExecutionDecision
}

data class OfflineEnqueueRequest(
    val idempotencyKey: String,
    val operationName: String,
    val canonicalPayloadHash: String,
    val execution: DeviceExecutionRequest,
    val safety: OfflineDeferralSafety,
)

enum class OfflineEnqueueRejection {
    NOT_SAFE_TO_DEFER,
    PERSISTENCE_ARGUMENTS_NOT_ALLOWED,
    PERSISTED_PAYLOAD_TOO_LARGE,
    DEADLINE_EXPIRED,
    W03_STATE_MISSING,
    W03_BINDING_CONFLICT,
    W03_REJECTED,
    W03_INFLIGHT_REQUIRES_RECONCILIATION,
    W03_ALREADY_COMPLETED,
    LOCAL_IDEMPOTENCY_CONFLICT,
    CAPACITY_EXCEEDED,
}

sealed interface OfflineEnqueueDecision {
    data class Queued(val record: OfflineDeferredExecution) : OfflineEnqueueDecision

    data class Duplicate(val record: OfflineDeferredExecution) : OfflineEnqueueDecision

    data class Rejected(val reason: OfflineEnqueueRejection) : OfflineEnqueueDecision
}

enum class OfflineDrainDisposition {
    DISPATCHED_TERMINAL,
    RECONCILIATION_REQUIRED,
    EXPIRED,
    STALE_AUTHORITY,
    STALE_SESSION,
    W03_TERMINAL,
    ALREADY_TERMINAL,
}

data class OfflineDrainResult(
    val idempotencyKey: String,
    val executionId: String,
    val disposition: OfflineDrainDisposition,
)

/**
 * W15-H offline/reconnect orchestration.
 *
 * The queue persists only a non-authoritative execution reference plus W03 idempotency identity.
 * Arbitrary action arguments are never persisted. It never persists a W07 authorization snapshot,
 * never grants retry authority, and never blindly replays EXECUTION_UNCERTAIN work. Every drain
 * re-reads W03, W07 and the W14-owned current device session before W15-F performs its own final
 * current-precondition validation.
 */
class OfflineExecutionQueueCoordinator(
    private val store: OfflineExecutionQueueStore,
    private val w03Idempotency: CurrentW03IdempotencyProjection,
    private val w07Authorization: CurrentW07DeviceAuthorization,
    private val currentSession: CurrentReconnectDeviceSession,
    private val dispatcher: DeviceExecutionDispatcher,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
    private val maxRecords: Int = 128,
) {
    init {
        require(maxRecords > 0) { "maxRecords must be positive" }
    }

    fun enqueue(candidate: OfflineEnqueueRequest): OfflineEnqueueDecision {
        val now = nowMs()
        if (candidate.safety != OfflineDeferralSafety.SAFE_TO_DEFER) {
            return OfflineEnqueueDecision.Rejected(OfflineEnqueueRejection.NOT_SAFE_TO_DEFER)
        }
        if (candidate.execution.action.arguments.isNotEmpty()) {
            return OfflineEnqueueDecision.Rejected(
                OfflineEnqueueRejection.PERSISTENCE_ARGUMENTS_NOT_ALLOWED,
            )
        }
        if (
            !persistedRecordWithinBounds(
                candidate.idempotencyKey,
                candidate.operationName,
                candidate.canonicalPayloadHash,
                candidate.execution,
            )
        ) {
            return OfflineEnqueueDecision.Rejected(OfflineEnqueueRejection.PERSISTED_PAYLOAD_TOO_LARGE)
        }
        if (now >= candidate.execution.deadlineAtMs) {
            return OfflineEnqueueDecision.Rejected(OfflineEnqueueRejection.DEADLINE_EXPIRED)
        }

        val currentW03 =
            w03Idempotency.current(candidate.execution.tenantId, candidate.idempotencyKey)
                ?: return OfflineEnqueueDecision.Rejected(OfflineEnqueueRejection.W03_STATE_MISSING)
        if (!matchesW03(candidate, currentW03)) {
            return OfflineEnqueueDecision.Rejected(OfflineEnqueueRejection.W03_BINDING_CONFLICT)
        }
        when (currentW03.state) {
            W03IdempotencyState.REJECTED ->
                return OfflineEnqueueDecision.Rejected(OfflineEnqueueRejection.W03_REJECTED)
            W03IdempotencyState.INFLIGHT ->
                return OfflineEnqueueDecision.Rejected(
                    OfflineEnqueueRejection.W03_INFLIGHT_REQUIRES_RECONCILIATION,
                )
            W03IdempotencyState.COMPLETED ->
                return OfflineEnqueueDecision.Rejected(OfflineEnqueueRejection.W03_ALREADY_COMPLETED)
            W03IdempotencyState.ACCEPTED -> Unit
        }

        val records = store.loadAll().toMutableList()
        val existing = records.firstOrNull { it.idempotencyKey == candidate.idempotencyKey }
        if (existing != null) {
            return if (sameIdentity(existing, candidate)) {
                OfflineEnqueueDecision.Duplicate(existing)
            } else {
                OfflineEnqueueDecision.Rejected(OfflineEnqueueRejection.LOCAL_IDEMPOTENCY_CONFLICT)
            }
        }

        makeCapacity(records)
        if (records.size >= maxRecords) {
            return OfflineEnqueueDecision.Rejected(OfflineEnqueueRejection.CAPACITY_EXCEEDED)
        }

        val record =
            OfflineDeferredExecution(
                idempotencyKey = candidate.idempotencyKey,
                operationName = candidate.operationName,
                canonicalPayloadHash = candidate.canonicalPayloadHash,
                request = candidate.execution,
                enqueuedAtMs = now,
            )
        records += record
        store.saveAll(records)
        return OfflineEnqueueDecision.Queued(record)
    }

    fun drain(): List<OfflineDrainResult> {
        val records = store.loadAll().toMutableList()
        val results = mutableListOf<OfflineDrainResult>()

        records.indices.forEach { index ->
            val record = records[index]
            if (record.state != OfflineQueueState.DEFERRED) {
                results += result(record, OfflineDrainDisposition.ALREADY_TERMINAL)
                return@forEach
            }

            val now = nowMs()
            if (now >= record.request.deadlineAtMs) {
                records[index] = record.copy(state = OfflineQueueState.EXPIRED)
                results += result(record, OfflineDrainDisposition.EXPIRED)
                return@forEach
            }

            val currentW03 = w03Idempotency.current(record.request.tenantId, record.idempotencyKey)
            if (currentW03 == null || !matchesW03(record, currentW03)) {
                records[index] = record.copy(state = OfflineQueueState.RECONCILIATION_REQUIRED)
                results += result(record, OfflineDrainDisposition.RECONCILIATION_REQUIRED)
                return@forEach
            }
            when (currentW03.state) {
                W03IdempotencyState.COMPLETED,
                W03IdempotencyState.REJECTED -> {
                    records[index] = record.copy(state = OfflineQueueState.TERMINAL_OBSERVED)
                    results += result(record, OfflineDrainDisposition.W03_TERMINAL)
                    return@forEach
                }
                W03IdempotencyState.INFLIGHT -> {
                    records[index] = record.copy(state = OfflineQueueState.RECONCILIATION_REQUIRED)
                    results += result(record, OfflineDrainDisposition.RECONCILIATION_REQUIRED)
                    return@forEach
                }
                W03IdempotencyState.ACCEPTED -> Unit
            }

            if (!currentAuthorityMatches(record, now)) {
                records[index] = record.copy(state = OfflineQueueState.STALE_AUTHORITY)
                results += result(record, OfflineDrainDisposition.STALE_AUTHORITY)
                return@forEach
            }

            val reconnectSession = currentSessionFor(record, now)
            if (reconnectSession == null) {
                records[index] = record.copy(state = OfflineQueueState.STALE_SESSION)
                results += result(record, OfflineDrainDisposition.STALE_SESSION)
                return@forEach
            }
            val reboundRequest = record.request.copy(deviceSessionId = reconnectSession.deviceSessionId)

            // Persist a fail-closed crash fence before entering the native side-effect boundary.
            // If the process dies after dispatch but before terminal readback is saved, restart sees
            // RECONCILIATION_REQUIRED and cannot blindly execute the command again.
            records[index] = record.copy(state = OfflineQueueState.RECONCILIATION_REQUIRED)
            store.saveAll(records)

            when (val decision = dispatcher.execute(reboundRequest)) {
                is DeviceExecutionDecision.Completed -> {
                    if (decision.receipt.outcome == DeviceExecutionOutcome.EXECUTION_UNCERTAIN) {
                        records[index] = record.copy(state = OfflineQueueState.RECONCILIATION_REQUIRED)
                        results += result(record, OfflineDrainDisposition.RECONCILIATION_REQUIRED)
                    } else {
                        records[index] = record.copy(state = OfflineQueueState.TERMINAL_OBSERVED)
                        results += result(record, OfflineDrainDisposition.DISPATCHED_TERMINAL)
                    }
                }
                is DeviceExecutionDecision.Rejected -> {
                    records[index] = record.copy(state = stateForRejection(decision.reason))
                    results += result(record, dispositionForRejection(decision.reason))
                }
            }
        }

        store.saveAll(records)
        return results
    }

    /** Consumes a late/local receipt only as dedupe/reconciliation evidence. It never dispatches. */
    fun observeReceipt(receipt: DeviceExecutionReceipt): Boolean {
        val records = store.loadAll().toMutableList()
        val index = records.indexOfFirst { it.request.executionId == receipt.executionId }
        if (index < 0) return false

        val record = records[index]
        records[index] =
            if (receipt.outcome == DeviceExecutionOutcome.EXECUTION_UNCERTAIN) {
                record.copy(state = OfflineQueueState.RECONCILIATION_REQUIRED)
            } else {
                record.copy(state = OfflineQueueState.TERMINAL_OBSERVED)
            }
        store.saveAll(records)
        return true
    }

    fun snapshot(): List<OfflineDeferredExecution> = store.loadAll()

    private fun currentAuthorityMatches(record: OfflineDeferredExecution, now: Long): Boolean {
        val authority = w07Authorization.current(record.request.executionId) ?: return false
        return authority.authorizesExecution &&
            !authority.cancelled &&
            authority.authorizedAtMs <= now &&
            now < authority.expiresAtMs &&
            authority.executionId == record.request.executionId &&
            authority.tenantId == record.request.tenantId &&
            authority.deviceId == record.request.deviceId &&
            authority.capabilityId == record.request.capabilityId
    }

    private fun currentSessionFor(
        record: OfflineDeferredExecution,
        now: Long,
    ): W14DeviceSessionTrustView? {
        val session = currentSession.current(record.request.tenantId, record.request.deviceId) ?: return null
        if (
            session.state != W14DeviceSessionTrustState.ACTIVE ||
            !session.executionPreconditionSatisfied ||
            session.lastEvaluatedAtMs > now ||
            now >= session.gatewayAuthExpiresAtMs ||
            session.tenantId != record.request.tenantId ||
            session.deviceRef.deviceId != record.request.deviceId
        ) {
            return null
        }
        return session
    }

    private fun stateForRejection(reason: DeviceExecutionRejection): OfflineQueueState =
        when (reason) {
            DeviceExecutionRejection.W07_AUTHORIZATION_MISSING,
            DeviceExecutionRejection.W07_AUTHORIZATION_NOT_CURRENT,
            DeviceExecutionRejection.W07_AUTHORIZATION_CANCELLED,
            DeviceExecutionRejection.W07_TARGET_MISMATCH,
            DeviceExecutionRejection.CANCELLED -> OfflineQueueState.STALE_AUTHORITY
            DeviceExecutionRejection.SESSION_TRUST_MISSING,
            DeviceExecutionRejection.SESSION_TRUST_NOT_CURRENT,
            DeviceExecutionRejection.SESSION_TARGET_MISMATCH -> OfflineQueueState.STALE_SESSION
            DeviceExecutionRejection.DEADLINE_EXPIRED -> OfflineQueueState.EXPIRED
            DeviceExecutionRejection.CAPABILITY_NOT_CURRENT,
            DeviceExecutionRejection.PERMISSION_PRECONDITION_NOT_SATISFIED,
            DeviceExecutionRejection.APP_INTEGRATION_NOT_CURRENT,
            DeviceExecutionRejection.KILL_SWITCH_ENGAGED -> OfflineQueueState.RECONCILIATION_REQUIRED
        }

    private fun dispositionForRejection(reason: DeviceExecutionRejection): OfflineDrainDisposition =
        when (stateForRejection(reason)) {
            OfflineQueueState.STALE_AUTHORITY -> OfflineDrainDisposition.STALE_AUTHORITY
            OfflineQueueState.STALE_SESSION -> OfflineDrainDisposition.STALE_SESSION
            OfflineQueueState.EXPIRED -> OfflineDrainDisposition.EXPIRED
            else -> OfflineDrainDisposition.RECONCILIATION_REQUIRED
        }

    private fun makeCapacity(records: MutableList<OfflineDeferredExecution>) {
        if (records.size < maxRecords) return
        val safelyEvictable =
            records
                .withIndex()
                .filter { (_, record) ->
                    record.state == OfflineQueueState.TERMINAL_OBSERVED ||
                        record.state == OfflineQueueState.EXPIRED ||
                        record.state == OfflineQueueState.STALE_AUTHORITY ||
                        record.state == OfflineQueueState.STALE_SESSION
                }
                .minByOrNull { (_, record) -> record.enqueuedAtMs }
                ?.index
        if (safelyEvictable != null) records.removeAt(safelyEvictable)
    }

    private fun matchesW03(
        candidate: OfflineEnqueueRequest,
        projection: W03IdempotencyProjection,
    ): Boolean =
        projection.tenantId == candidate.execution.tenantId &&
            projection.key == candidate.idempotencyKey &&
            projection.operationName == candidate.operationName &&
            projection.canonicalPayloadHash == candidate.canonicalPayloadHash

    private fun matchesW03(
        record: OfflineDeferredExecution,
        projection: W03IdempotencyProjection,
    ): Boolean =
        projection.tenantId == record.request.tenantId &&
            projection.key == record.idempotencyKey &&
            projection.operationName == record.operationName &&
            projection.canonicalPayloadHash == record.canonicalPayloadHash

    private fun sameIdentity(
        record: OfflineDeferredExecution,
        candidate: OfflineEnqueueRequest,
    ): Boolean =
        record.operationName == candidate.operationName &&
            record.canonicalPayloadHash == candidate.canonicalPayloadHash &&
            record.request.executionId == candidate.execution.executionId &&
            record.request.tenantId == candidate.execution.tenantId

    private fun result(
        record: OfflineDeferredExecution,
        disposition: OfflineDrainDisposition,
    ) =
        OfflineDrainResult(
            idempotencyKey = record.idempotencyKey,
            executionId = record.request.executionId,
            disposition = disposition,
        )
}

private fun persistedRecordWithinBounds(
    idempotencyKey: String,
    operationName: String,
    canonicalPayloadHash: String,
    request: DeviceExecutionRequest,
): Boolean {
    if (request.permissionRequirements.size > MAX_OFFLINE_PERMISSION_REQUIREMENTS) return false
    val references =
        buildList {
            add(idempotencyKey)
            add(operationName)
            add(canonicalPayloadHash)
            add(request.executionId)
            add(request.tenantId)
            add(request.deviceId)
            add(request.deviceSessionId)
            add(request.capabilityId)
            request.appId?.let(::add)
            add(request.action.actionId)
            request.permissionRequirements.forEach { add(it.permission) }
        }
    if (references.any { utf8Size(it) > MAX_OFFLINE_REFERENCE_BYTES }) return false

    val totalBytes =
        references.fold(OFFLINE_RECORD_FIXED_OVERHEAD_BYTES.toLong()) { total, value ->
            total + utf8Size(value)
        }
    return totalBytes <= MAX_OFFLINE_RECORD_BYTES
}

private fun utf8Size(value: String): Int = value.toByteArray(Charsets.UTF_8).size