package ai.aurora.device.offline

import android.content.Context
import android.content.pm.PackageManager
import ai.aurora.device.app.AppIntegrationResolution
import ai.aurora.device.app.AppIntegrationResolver
import ai.aurora.device.capability.NativeCapabilityBridge
import ai.aurora.device.capability.NativeCapabilityResolution
import ai.aurora.device.executor.CurrentAppIntegrationDescriptor
import ai.aurora.device.executor.CurrentDeviceSessionTrust
import ai.aurora.device.executor.CurrentNativeCapabilityObservation
import ai.aurora.device.executor.CurrentRuntimePermissionObservation
import ai.aurora.device.executor.CurrentW07DeviceAuthorization
import ai.aurora.device.executor.DeviceActionCommand
import ai.aurora.device.executor.DeviceActionPort
import ai.aurora.device.executor.DeviceExecutionControl
import ai.aurora.device.executor.DeviceExecutionControlSnapshot
import ai.aurora.device.executor.DeviceExecutionDecision
import ai.aurora.device.executor.DeviceExecutionRequest
import ai.aurora.device.executor.DeviceExecutorRuntime
import ai.aurora.device.executor.W07AuthorizedDeviceExecutionView
import ai.aurora.device.executor.W15J_AUDIO_VOLUME_STEP_UP_ACTION
import ai.aurora.device.network.GatewayCommandDeliveryView
import ai.aurora.device.network.GatewayDevicePlaneResult
import ai.aurora.device.network.GatewayDevicePlaneSnapshot
import ai.aurora.device.network.GatewayOfflineCurrentView
import ai.aurora.device.network.GatewayOfflineW03State
import ai.aurora.device.network.GatewayW07DeviceExecutionAuthorizationView
import ai.aurora.device.permission.RuntimePermissionObservation
import ai.aurora.device.permission.RuntimePermissionRequirement
import ai.aurora.device.permission.RuntimePermissionState
import ai.aurora.device.session.W14DeviceSessionTrustView

private const val OFFLINE_IDEMPOTENCY_PREFIX = "w14f:"
private const val PERMISSION_SNAPSHOT_AGE_MS = 30_000L
private const val SAFE_OFFLINE_CAPABILITY = "audio.volume.set"

internal interface GatewayOfflineDevicePlanePort {
    fun currentSnapshot(): GatewayDevicePlaneResult<GatewayDevicePlaneSnapshot>
    fun claimCommand(commandId: String): GatewayDevicePlaneResult<GatewayCommandDeliveryView>
    fun acknowledgeCommand(commandId: String, deliveryReference: String, ackReference: String): GatewayDevicePlaneResult<GatewayCommandDeliveryView>
    fun fetchOfflineCurrent(idempotencyKey: String): GatewayDevicePlaneResult<GatewayOfflineCurrentView>
}

sealed interface GatewayOfflinePrepareResult {
    data class Prepared(val decision: OfflineEnqueueDecision) : GatewayOfflinePrepareResult
    data class Rejected(val reason: String) : GatewayOfflinePrepareResult
}
class GatewayOfflineExecutionRuntime internal constructor(
    private val gateway: GatewayOfflineDevicePlanePort,
    private val store: OfflineExecutionQueueStore,
    private val capabilityBridge: NativeCapabilityBridge,
    private val permissionContext: Context,
    private val actionPort: DeviceActionPort,
    private val appIntegrationResolver: AppIntegrationResolver? = null,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    private var lastOwnerProjection: GatewayOfflineCurrentView? = null

    private val coordinator = OfflineExecutionQueueCoordinator(
        store = store,
        w03Idempotency = CurrentW03IdempotencyProjection(::currentW03),
        w07Authorization = CurrentW07DeviceAuthorization(::currentW07),
        currentSession = CurrentReconnectDeviceSession(::currentSession),
        dispatcher = DeviceExecutionDispatcher(::dispatch),
        nowMs = nowMs,
    )

    @Synchronized
    fun prepareSafeDeferred(commandId: String): GatewayOfflinePrepareResult {
        val delivery = (gateway.claimCommand(commandId) as? GatewayDevicePlaneResult.Success)?.value
            ?: return GatewayOfflinePrepareResult.Rejected("command claim unavailable")
        val envelope = delivery.envelope ?: return GatewayOfflinePrepareResult.Rejected("command envelope unavailable")
        if (delivery.disposition !in setOf("DELIVER", "REPLAY_SAME_ENVELOPE")) {
            return GatewayOfflinePrepareResult.Rejected("command is not deferrable")
        }
        val authorization = envelope.executionAuthorization
        if (
            envelope.commandId != commandId ||
            authorization.capabilityId != SAFE_OFFLINE_CAPABILITY ||
            authorization.actionId != W15J_AUDIO_VOLUME_STEP_UP_ACTION ||
            authorization.arguments.isNotEmpty()
        ) {
            return GatewayOfflinePrepareResult.Rejected("only bounded volume-step work is safe to defer")
        }
        val idempotencyKey = OFFLINE_IDEMPOTENCY_PREFIX + commandId
        val current = refreshOwners(envelope.tenantId, idempotencyKey)
            ?: return GatewayOfflinePrepareResult.Rejected("current owner projection unavailable")
        val currentAuthorization = current.executionAuthorization
        if (
            current.commandId != commandId ||
            current.executionId != envelope.executionId ||
            current.w14.tenantId != envelope.tenantId ||
            current.w14.deviceId != envelope.deviceId ||
            current.w14.deviceSessionId != envelope.deviceSessionId ||
            currentAuthorization == null ||
            currentAuthorization != authorization ||
            current.w03.state != GatewayOfflineW03State.ACCEPTED
        ) {
            return GatewayOfflinePrepareResult.Rejected("current owners do not permit safe deferral")
        }
        val native = capabilityBridge.resolve(authorization.capabilityId)
        if (native !is NativeCapabilityResolution.Ready) {
            return GatewayOfflinePrepareResult.Rejected("native capability is not current")
        }
        val request = DeviceExecutionRequest(
            executionId = envelope.executionId,
            tenantId = envelope.tenantId,
            deviceId = envelope.deviceId,
            deviceSessionId = envelope.deviceSessionId,
            capabilityId = authorization.capabilityId,
            permissionRequirements = native.binding.requiredPermissions.sorted().map(::RuntimePermissionRequirement),
            action = DeviceActionCommand(actionId = authorization.actionId),
            deadlineAtMs = envelope.deadlineMs,
        )
        val decision = coordinator.enqueue(
            OfflineEnqueueRequest(
                idempotencyKey = idempotencyKey,
                operationName = current.w03.operationName,
                canonicalPayloadHash = current.w03.canonicalPayloadHash,
                execution = request,
                safety = OfflineDeferralSafety.SAFE_TO_DEFER,
            ),
        )
        return GatewayOfflinePrepareResult.Prepared(decision)
    }

    @Synchronized
    fun drain(): List<OfflineDrainResult> = coordinator.drain()

    @Synchronized
    fun snapshot(): List<OfflineDeferredExecution> = coordinator.snapshot()
    private fun currentW03(tenantId: String, key: String): W03IdempotencyProjection? {
        val current = refreshOwners(tenantId, key) ?: return null
        return W03IdempotencyProjection(
            tenantId = current.w03.tenantId,
            key = current.w03.key,
            operationName = current.w03.operationName,
            canonicalPayloadHash = current.w03.canonicalPayloadHash,
            state = W03IdempotencyState.valueOf(current.w03.state.name),
        )
    }

    private fun refreshOwners(tenantId: String, key: String): GatewayOfflineCurrentView? {
        val current = (gateway.fetchOfflineCurrent(key) as? GatewayDevicePlaneResult.Success)?.value
            ?: return null
        if (current.w03.tenantId != tenantId || current.w03.key != key) return null
        lastOwnerProjection = current
        return current
    }

    private fun currentW07(executionId: String): W07AuthorizedDeviceExecutionView? =
        lastOwnerProjection?.executionAuthorization
            ?.takeIf { it.executionId == executionId }
            ?.toExecutorView()

    private fun currentSession(tenantId: String, deviceId: String): W14DeviceSessionTrustView? =
        (gateway.currentSnapshot() as? GatewayDevicePlaneResult.Success)?.value?.deviceSession
            ?.takeIf { it.tenantId == tenantId && it.deviceRef.deviceId == deviceId }
    private fun dispatch(request: DeviceExecutionRequest): DeviceExecutionDecision {
        val record = store.loadAll().firstOrNull { it.request.executionId == request.executionId }
            ?: return DeviceExecutionDecision.Rejected(ai.aurora.device.executor.DeviceExecutionRejection.W07_AUTHORIZATION_MISSING)
        val commandId = record.idempotencyKey.removePrefix(OFFLINE_IDEMPOTENCY_PREFIX)
        if (commandId == record.idempotencyKey) {
            return DeviceExecutionDecision.Rejected(ai.aurora.device.executor.DeviceExecutionRejection.W07_AUTHORIZATION_MISSING)
        }
        val claimed = (gateway.claimCommand(commandId) as? GatewayDevicePlaneResult.Success)?.value
            ?: return DeviceExecutionDecision.Rejected(ai.aurora.device.executor.DeviceExecutionRejection.W07_AUTHORIZATION_MISSING)
        val envelope = claimed.envelope
            ?: return DeviceExecutionDecision.Rejected(ai.aurora.device.executor.DeviceExecutionRejection.W07_AUTHORIZATION_MISSING)
        if (
            envelope.executionId != request.executionId ||
            envelope.deviceId != request.deviceId ||
            envelope.tenantId != request.tenantId ||
            envelope.executionAuthorization.actionId != request.action.actionId ||
            envelope.executionAuthorization.arguments.isNotEmpty()
        ) {
            return DeviceExecutionDecision.Rejected(ai.aurora.device.executor.DeviceExecutionRejection.W07_TARGET_MISMATCH)
        }
        val ack = gateway.acknowledgeCommand(
            commandId = commandId,
            deliveryReference = envelope.deliveryReference,
            ackReference = "android:w15h:ack:${request.executionId}",
        )
        val acknowledged = (ack as? GatewayDevicePlaneResult.Success)?.value
            ?: return DeviceExecutionDecision.Rejected(ai.aurora.device.executor.DeviceExecutionRejection.W07_AUTHORIZATION_MISSING)
        if (acknowledged.state != "ACKNOWLEDGED" || acknowledged.executionId != request.executionId) {
            return DeviceExecutionDecision.Rejected(ai.aurora.device.executor.DeviceExecutionRejection.W07_TARGET_MISMATCH)
        }
        val executor = DeviceExecutorRuntime(
            w07Authorization = CurrentW07DeviceAuthorization(::currentW07),
            sessionTrust = CurrentDeviceSessionTrust { sessionId ->
                val snapshot = (gateway.currentSnapshot() as? GatewayDevicePlaneResult.Success)?.value
                snapshot?.deviceSession?.takeIf { it.deviceSessionId == sessionId }
            },
            capabilityObservation = CurrentNativeCapabilityObservation(capabilityBridge::discover),
            permissionObservation = CurrentRuntimePermissionObservation(::permissionObservation),
            appIntegration = CurrentAppIntegrationDescriptor { appId ->
                when (val resolution = appIntegrationResolver?.resolve(appId)) {
                    is AppIntegrationResolution.Ready -> resolution.descriptor
                    else -> null
                }
            },
            control = DeviceExecutionControl { DeviceExecutionControlSnapshot() },
            actionPort = actionPort,
            nowMs = nowMs,
        )
        return executor.execute(request)
    }
    private fun permissionObservation(requirement: RuntimePermissionRequirement): RuntimePermissionObservation {
        val observedAtMs = nowMs()
        val granted = permissionContext.checkSelfPermission(requirement.permission) == PackageManager.PERMISSION_GRANTED
        return RuntimePermissionObservation(
            requirement = requirement,
            state = if (granted) RuntimePermissionState.GRANTED else RuntimePermissionState.DENIED,
            observedAtMs = observedAtMs,
            expiresAtMs = saturatingAdd(observedAtMs, PERMISSION_SNAPSHOT_AGE_MS),
            shouldShowRationale = false,
        )
    }

    companion object {
        fun forAndroid(
            client: ai.aurora.device.network.GatewayDevicePlaneClient,
            context: Context,
            capabilityBridge: NativeCapabilityBridge,
            actionPort: DeviceActionPort,
            appIntegrationResolver: AppIntegrationResolver? = null,
            nowMs: () -> Long = { System.currentTimeMillis() },
        ): GatewayOfflineExecutionRuntime {
            val port = object : GatewayOfflineDevicePlanePort {
                override fun currentSnapshot() = client.currentSnapshot()
                override fun claimCommand(commandId: String) = client.claimCommand(commandId)
                override fun acknowledgeCommand(commandId: String, deliveryReference: String, ackReference: String) =
                    client.acknowledgeCommand(commandId, deliveryReference, ackReference)
                override fun fetchOfflineCurrent(idempotencyKey: String) = client.fetchOfflineCurrent(idempotencyKey)
            }
            return GatewayOfflineExecutionRuntime(
                gateway = port,
                store = AndroidOfflineExecutionQueueStore(context),
                capabilityBridge = capabilityBridge,
                permissionContext = context,
                actionPort = actionPort,
                appIntegrationResolver = appIntegrationResolver,
                nowMs = nowMs,
            )
        }
    }
}

private fun GatewayW07DeviceExecutionAuthorizationView.toExecutorView(): W07AuthorizedDeviceExecutionView =
    W07AuthorizedDeviceExecutionView(
        executionId = executionId,
        tenantId = tenantId,
        deviceId = deviceId,
        capabilityId = capabilityId,
        authorizedAtMs = authorizedAtMs,
        expiresAtMs = expiresAtMs,
        authorizesExecution = authorizesExecution,
        cancelled = cancelled,
    )

private fun saturatingAdd(left: Long, right: Long): Long =
    if (left > Long.MAX_VALUE - right) Long.MAX_VALUE else left + right
