package ai.aurora.device.executor

import ai.aurora.device.app.AppIntegrationDescriptor
import ai.aurora.device.capability.NativeCapabilityAvailability
import ai.aurora.device.capability.NativeCapabilityObservation
import ai.aurora.device.permission.RuntimePermissionObservation
import ai.aurora.device.permission.RuntimePermissionRequirement
import ai.aurora.device.session.W14DeviceSessionTrustState
import ai.aurora.device.session.W14DeviceSessionTrustView

const val W07_DEVICE_TARGET_KIND = "DEVICE"
const val W07_AUTHORITY_SOURCE = "W07_CURRENT_EXECUTION_AUTHORITY"

/**
 * Consumer view of a current W07 authorization decision.
 *
 * W15-F never mints this view. The executor obtains it from [CurrentW07DeviceAuthorization] at the
 * side-effect boundary and requires the owning W07 implementation to say that execution remains
 * authorized. Retry/reconciliation authority remains outside Android.
 */
data class W07AuthorizedDeviceExecutionView(
    val executionId: String,
    val tenantId: String,
    val deviceId: String,
    val capabilityId: String,
    val targetKind: String = W07_DEVICE_TARGET_KIND,
    val authoritySource: String = W07_AUTHORITY_SOURCE,
    val authorizedAtMs: Long,
    val expiresAtMs: Long,
    val authorizesExecution: Boolean,
    val cancelled: Boolean = false,
) {
    init {
        require(executionId.isNotBlank()) { "executionId must not be blank" }
        require(tenantId.isNotBlank()) { "tenantId must not be blank" }
        require(deviceId.isNotBlank()) { "deviceId must not be blank" }
        require(capabilityId.isNotBlank()) { "capabilityId must not be blank" }
        require(targetKind == W07_DEVICE_TARGET_KIND) { "W15-F accepts only DEVICE targets" }
        require(authoritySource == W07_AUTHORITY_SOURCE) { "authorization must come from current W07 authority" }
        require(authorizedAtMs >= 0) { "authorizedAtMs must be non-negative" }
        require(expiresAtMs > authorizedAtMs) { "W07 authorization expiry must follow authorization" }
    }
}

fun interface CurrentW07DeviceAuthorization {
    fun current(executionId: String): W07AuthorizedDeviceExecutionView?
}

fun interface CurrentDeviceSessionTrust {
    fun current(deviceSessionId: String): W14DeviceSessionTrustView?
}

fun interface CurrentNativeCapabilityObservation {
    fun current(capabilityId: String): NativeCapabilityObservation?
}

fun interface CurrentRuntimePermissionObservation {
    fun current(requirement: RuntimePermissionRequirement): RuntimePermissionObservation
}

fun interface CurrentAppIntegrationDescriptor {
    fun current(appId: String): AppIntegrationDescriptor?
}

fun interface DeviceExecutionControl {
    fun snapshot(): DeviceExecutionControlSnapshot
}

data class DeviceExecutionControlSnapshot(
    val cancelled: Boolean = false,
    val killSwitchEngaged: Boolean = false,
)

data class DeviceExecutionRequest(
    val executionId: String,
    val tenantId: String,
    val deviceId: String,
    val deviceSessionId: String,
    val capabilityId: String,
    val permissionRequirements: List<RuntimePermissionRequirement> = emptyList(),
    val appId: String? = null,
    val action: DeviceActionCommand,
    val deadlineAtMs: Long,
) {
    init {
        require(executionId.isNotBlank()) { "executionId must not be blank" }
        require(tenantId.isNotBlank()) { "tenantId must not be blank" }
        require(deviceId.isNotBlank()) { "deviceId must not be blank" }
        require(deviceSessionId.isNotBlank()) { "deviceSessionId must not be blank" }
        require(capabilityId.isNotBlank()) { "capabilityId must not be blank" }
        require(appId == null || appId.isNotBlank()) { "appId must be null or non-blank" }
        require(deadlineAtMs > 0) { "deadlineAtMs must be positive" }
    }
}

data class DeviceActionCommand(
    val actionId: String,
    val arguments: Map<String, String> = emptyMap(),
) {
    init {
        require(actionId.isNotBlank()) { "actionId must not be blank" }
    }
}

data class DeviceActionContext(
    val executionId: String,
    val tenantId: String,
    val deviceId: String,
    val capabilityId: String,
    val app: AppIntegrationDescriptor?,
    val deadlineAtMs: Long,
)

fun interface DeviceActionPort {
    fun execute(command: DeviceActionCommand, context: DeviceActionContext): DeviceActionResult
}

sealed interface DeviceActionResult {
    data class VerifiedSuccess(
        val readback: String? = null,
    ) : DeviceActionResult

    data class VerifiedFailure(
        val reason: String,
        val readback: String? = null,
    ) : DeviceActionResult {
        init {
            require(reason.isNotBlank()) { "failure reason must not be blank" }
        }
    }

    data class Ambiguous(
        val reason: String,
    ) : DeviceActionResult {
        init {
            require(reason.isNotBlank()) { "ambiguity reason must not be blank" }
        }
    }
}

enum class DeviceExecutionRejection {
    W07_AUTHORIZATION_MISSING,
    W07_AUTHORIZATION_NOT_CURRENT,
    W07_AUTHORIZATION_CANCELLED,
    W07_TARGET_MISMATCH,
    SESSION_TRUST_MISSING,
    SESSION_TRUST_NOT_CURRENT,
    SESSION_TARGET_MISMATCH,
    CAPABILITY_NOT_CURRENT,
    PERMISSION_PRECONDITION_NOT_SATISFIED,
    APP_INTEGRATION_NOT_CURRENT,
    CANCELLED,
    KILL_SWITCH_ENGAGED,
    DEADLINE_EXPIRED,
}

enum class DeviceExecutionOutcome {
    SUCCEEDED,
    FAILED,
    EXECUTION_UNCERTAIN,
}

data class DeviceExecutionReceipt(
    val executionId: String,
    val outcome: DeviceExecutionOutcome,
    val completedAtMs: Long,
    val requiresReconciliation: Boolean,
    val retryEligible: Boolean = false,
)

data class DeviceExecutionEvidence(
    val executionId: String,
    val capabilityId: String,
    val deviceSessionId: String,
    val outcome: DeviceExecutionOutcome,
    val readback: String? = null,
    val detail: String? = null,
)

sealed interface DeviceExecutionDecision {
    data class Rejected(
        val reason: DeviceExecutionRejection,
    ) : DeviceExecutionDecision

    data class Completed(
        val receipt: DeviceExecutionReceipt,
        val evidence: DeviceExecutionEvidence,
    ) : DeviceExecutionDecision
}

/**
 * W15 concrete DEVICE executor.
 *
 * This runtime performs only the final Android/native realization after re-reading every current
 * owning precondition. It does not accept planner/model/voice commands as authority, cannot decide
 * retry eligibility, and never converts local permission/session/capability state into W07 authority.
 */
class DeviceExecutorRuntime(
    private val w07Authorization: CurrentW07DeviceAuthorization,
    private val sessionTrust: CurrentDeviceSessionTrust,
    private val capabilityObservation: CurrentNativeCapabilityObservation,
    private val permissionObservation: CurrentRuntimePermissionObservation,
    private val appIntegration: CurrentAppIntegrationDescriptor,
    private val control: DeviceExecutionControl,
    private val actionPort: DeviceActionPort,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    fun execute(request: DeviceExecutionRequest): DeviceExecutionDecision {
        val beforeMs = nowMs()
        if (beforeMs >= request.deadlineAtMs) return rejected(DeviceExecutionRejection.DEADLINE_EXPIRED)
        val initialControl = control.snapshot()
        if (initialControl.killSwitchEngaged) return rejected(DeviceExecutionRejection.KILL_SWITCH_ENGAGED)
        if (initialControl.cancelled) return rejected(DeviceExecutionRejection.CANCELLED)

        val authorization =
            w07Authorization.current(request.executionId)
                ?: return rejected(DeviceExecutionRejection.W07_AUTHORIZATION_MISSING)
        if (
            !authorization.authorizesExecution ||
            authorization.authorizedAtMs > beforeMs ||
            beforeMs >= authorization.expiresAtMs
        ) {
            return rejected(DeviceExecutionRejection.W07_AUTHORIZATION_NOT_CURRENT)
        }
        if (authorization.cancelled) return rejected(DeviceExecutionRejection.W07_AUTHORIZATION_CANCELLED)
        if (
            authorization.executionId != request.executionId ||
            authorization.tenantId != request.tenantId ||
            authorization.deviceId != request.deviceId ||
            authorization.capabilityId != request.capabilityId
        ) {
            return rejected(DeviceExecutionRejection.W07_TARGET_MISMATCH)
        }

        val session =
            sessionTrust.current(request.deviceSessionId)
                ?: return rejected(DeviceExecutionRejection.SESSION_TRUST_MISSING)
        if (
            session.state != W14DeviceSessionTrustState.ACTIVE ||
            !session.executionPreconditionSatisfied ||
            session.lastEvaluatedAtMs > beforeMs ||
            beforeMs >= session.gatewayAuthExpiresAtMs
        ) {
            return rejected(DeviceExecutionRejection.SESSION_TRUST_NOT_CURRENT)
        }
        if (
            session.deviceSessionId != request.deviceSessionId ||
            session.tenantId != request.tenantId ||
            session.deviceRef.deviceId != request.deviceId
        ) {
            return rejected(DeviceExecutionRejection.SESSION_TARGET_MISMATCH)
        }

        val capability =
            capabilityObservation.current(request.capabilityId)
                ?: return rejected(DeviceExecutionRejection.CAPABILITY_NOT_CURRENT)
        if (
            capability.capabilityId != request.capabilityId ||
            capability.availability != NativeCapabilityAvailability.AVAILABLE ||
            capability.observedAtMs > beforeMs ||
            beforeMs >= capability.expiresAtMs
        ) {
            return rejected(DeviceExecutionRejection.CAPABILITY_NOT_CURRENT)
        }

        request.permissionRequirements.forEach { requirement ->
            val permission = permissionObservation.current(requirement)
            if (
                permission.requirement != requirement ||
                !permission.preconditionSatisfied ||
                permission.observedAtMs > beforeMs ||
                beforeMs >= permission.expiresAtMs
            ) {
                return rejected(DeviceExecutionRejection.PERMISSION_PRECONDITION_NOT_SATISFIED)
            }
        }

        val app =
            request.appId?.let { appId ->
                appIntegration.current(appId)
                    ?: return rejected(DeviceExecutionRejection.APP_INTEGRATION_NOT_CURRENT)
            }
        if (app != null && app.appId != request.appId) {
            return rejected(DeviceExecutionRejection.APP_INTEGRATION_NOT_CURRENT)
        }

        val actionResult =
            try {
                actionPort.execute(
                    request.action,
                    DeviceActionContext(
                        executionId = request.executionId,
                        tenantId = request.tenantId,
                        deviceId = request.deviceId,
                        capabilityId = request.capabilityId,
                        app = app,
                        deadlineAtMs = request.deadlineAtMs,
                    ),
                )
            } catch (failure: Exception) {
                DeviceActionResult.Ambiguous(failure.message ?: "native action raised after dispatch")
            }

        val completedAtMs = nowMs()
        val finalControl = control.snapshot()
        if (finalControl.cancelled || finalControl.killSwitchEngaged) {
            return completed(
                request = request,
                completedAtMs = completedAtMs,
                outcome = DeviceExecutionOutcome.EXECUTION_UNCERTAIN,
                detail = "control state changed during native execution",
                readback = null,
            )
        }

        return when (actionResult) {
            is DeviceActionResult.VerifiedSuccess ->
                completed(
                    request,
                    completedAtMs,
                    DeviceExecutionOutcome.SUCCEEDED,
                    null,
                    actionResult.readback,
                )
            is DeviceActionResult.VerifiedFailure ->
                completed(
                    request,
                    completedAtMs,
                    DeviceExecutionOutcome.FAILED,
                    actionResult.reason,
                    actionResult.readback,
                )
            is DeviceActionResult.Ambiguous ->
                completed(
                    request,
                    completedAtMs,
                    DeviceExecutionOutcome.EXECUTION_UNCERTAIN,
                    actionResult.reason,
                    null,
                )
        }
    }

    private fun rejected(reason: DeviceExecutionRejection): DeviceExecutionDecision =
        DeviceExecutionDecision.Rejected(reason)

    private fun completed(
        request: DeviceExecutionRequest,
        completedAtMs: Long,
        outcome: DeviceExecutionOutcome,
        detail: String?,
        readback: String?,
    ): DeviceExecutionDecision.Completed =
        DeviceExecutionDecision.Completed(
            receipt =
                DeviceExecutionReceipt(
                    executionId = request.executionId,
                    outcome = outcome,
                    completedAtMs = completedAtMs,
                    requiresReconciliation = outcome == DeviceExecutionOutcome.EXECUTION_UNCERTAIN,
                    retryEligible = false,
                ),
            evidence =
                DeviceExecutionEvidence(
                    executionId = request.executionId,
                    capabilityId = request.capabilityId,
                    deviceSessionId = request.deviceSessionId,
                    outcome = outcome,
                    readback = readback,
                    detail = detail,
                ),
        )
}
