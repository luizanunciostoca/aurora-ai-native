package ai.aurora.device

import android.app.Application
import ai.aurora.device.bootstrap.GatewayBootstrapClient
import ai.aurora.device.bootstrap.GatewayBootstrapClientError
import ai.aurora.device.bootstrap.GatewayBootstrapClientResult
import ai.aurora.device.bootstrap.GatewayBootstrapGrant
import ai.aurora.device.bootstrap.ProcessLocalGatewayBootstrapRuntime
import ai.aurora.device.config.AuroraEnvironment
import ai.aurora.device.config.RuntimeEnvironmentConfig
import ai.aurora.device.executor.AndroidDeviceActionPorts
import ai.aurora.device.executor.DeviceActionPort
import ai.aurora.device.executor.W15JDeviceCommandConsumptionResult
import ai.aurora.device.executor.W15JGatewayDeviceCommandConsumer
import ai.aurora.device.capability.PhysicalAcceptanceNativeRuntimeProbe
import ai.aurora.device.lifecycle.AndroidPresenceCheckpointStore
import ai.aurora.device.lifecycle.AndroidPresenceCoordinator
import ai.aurora.device.lifecycle.PresenceEngine
import ai.aurora.device.lifecycle.PresenceSnapshot
import ai.aurora.device.network.GatewayDevicePlaneClient
import ai.aurora.device.network.GatewayDevicePlaneConnectRequest
import ai.aurora.device.network.GatewayDevicePlaneReconnectRequest
import ai.aurora.device.network.GatewayDevicePlaneResult
import ai.aurora.device.offline.GatewayOfflineExecutionRuntime
import ai.aurora.device.offline.GatewayOfflinePrepareResult
import ai.aurora.device.offline.OfflineEnqueueDecision
import ai.aurora.device.security.AndroidKeystoreSigningKeyStore
import ai.aurora.device.session.AndroidDeviceSessionMetadataStore
import ai.aurora.device.session.SecureDeviceSessionClient
import ai.aurora.device.session.SessionLifecycleHooks
import ai.aurora.device.voice.GatewayBootstrapGrantSource
import ai.aurora.device.voice.GatewayVoiceRuntimeComposition
import ai.aurora.device.voice.GatewayVoiceRuntimeCompositionError
import ai.aurora.device.voice.GatewayVoiceRuntimeCompositionResult
import ai.aurora.device.voice.GatewayVoiceRuntimeConnectFailure
import ai.aurora.device.voice.GatewayVoiceRuntimeConnectResult
import ai.aurora.device.voice.GatewayVoiceRuntimeConnectStage
import ai.aurora.device.voice.GatewayVoiceRuntimeConnector
import ai.aurora.device.voice.GatewayVoiceRuntimeReconnector
import ai.aurora.device.voice.GovernedW07VoiceAuthorityIngress
import ai.aurora.device.voice.GovernedVoiceProjectionBundle
import ai.aurora.device.voice.InstalledGatewayVoiceProjection
import ai.aurora.device.voice.OneShotGatewayCredentialProvider
import ai.aurora.device.voice.WakeVoiceRuntimeRegistry
import ai.aurora.device.voice.installableGatewayVoiceProjection
import ai.aurora.device.voice.localGatewayBindingFrom
import ai.aurora.device.voice.refreshedNativeVoiceProjection

class AuroraApplication : Application() {
    lateinit var environmentConfig: RuntimeEnvironmentConfig
        private set

    private lateinit var presenceEngine: PresenceEngine
    private lateinit var presenceCoordinator: AndroidPresenceCoordinator
    private lateinit var deviceSessionMetadataStore: AndroidDeviceSessionMetadataStore
    private lateinit var secureDeviceSessionClient: SecureDeviceSessionClient
    private var localGatewayBootstrapRuntime: ProcessLocalGatewayBootstrapRuntime? = null
    private var localGatewayVoiceRuntimeComposition: GatewayVoiceRuntimeComposition? = null
    private var activeGatewayDevicePlaneClient: GatewayDevicePlaneClient? = null
    @Volatile
    private var activeGatewayVoiceProjection: InstalledGatewayVoiceProjection? = null
    private var activeGatewayCommandConsumer: W15JGatewayDeviceCommandConsumer? = null
    private var activeGatewayOfflineRuntime: GatewayOfflineExecutionRuntime? = null

    override fun onCreate() {
        super.onCreate()
        environmentConfig =
            RuntimeEnvironmentConfig.fromBuildValues(
                environment = BuildConfig.AURORA_ENVIRONMENT,
                gatewayOrigin = BuildConfig.AURORA_GATEWAY_ORIGIN,
                allowCleartextTraffic = BuildConfig.AURORA_ALLOW_CLEARTEXT,
            )

        deviceSessionMetadataStore = AndroidDeviceSessionMetadataStore(this)
        secureDeviceSessionClient =
            SecureDeviceSessionClient(
                metadataStore = deviceSessionMetadataStore,
                keyStore = AndroidKeystoreSigningKeyStore(),
            )

        if (
            environmentConfig.environment == AuroraEnvironment.LOCAL &&
            environmentConfig.allowCleartextTraffic
        ) {
            // Port 8081 is a pre-session LOCAL/ADB-reverse bootstrap exchange only. Voice and
            // device-plane traffic continue on the authenticated W14 session channel (8080).
            val bootstrapRuntime =
                ProcessLocalGatewayBootstrapRuntime(GatewayBootstrapClient.physicalAdbReverse())
            localGatewayBootstrapRuntime = bootstrapRuntime
            localGatewayVoiceRuntimeComposition =
                GatewayVoiceRuntimeComposition(
                    grantSource =
                        GatewayBootstrapGrantSource { expectedDeviceId, expectedDeviceSessionId ->
                            when (
                                val exchange =
                                    bootstrapRuntime.exchangeAndHold(
                                        expectedDeviceId,
                                        expectedDeviceSessionId,
                                    )
                            ) {
                                is GatewayBootstrapClientResult.Success -> {
                                    val grant = bootstrapRuntime.consumeGrant()
                                    if (grant == null) {
                                        GatewayBootstrapClientResult.Rejected(
                                            GatewayBootstrapClientError.PROTOCOL_MALFORMED,
                                        )
                                    } else {
                                        GatewayBootstrapClientResult.Success(grant)
                                    }
                                }
                                is GatewayBootstrapClientResult.Rejected -> exchange
                            }
                        },
                    bindingProvider = {
                        localGatewayBindingFrom(deviceSessionMetadataStore.load())
                    },
                    connector =
                        GatewayVoiceRuntimeConnector { grant, expectedRegistrationVersion ->
                            connectLocalGatewayVoiceIngress(grant, expectedRegistrationVersion)
                        },
                    reconnector =
                        GatewayVoiceRuntimeReconnector { grant, expectedRegistrationVersion ->
                            reconnectLocalGatewayVoiceIngress(grant, expectedRegistrationVersion)
                        },
                    clearRuntime = ::clearLocalGatewayVoiceRuntime,
                )
        }

        presenceEngine =
            PresenceEngine(
                store = AndroidPresenceCheckpointStore(this),
                sessionHooks = SessionLifecycleHooks { _ ->
                    // W15-B owns secure registration/session state; W14 remains canonical authority owner.
                },
            )
        presenceCoordinator = AndroidPresenceCoordinator(this, presenceEngine)
        presenceCoordinator.start()
    }

    fun presenceSnapshot(): PresenceSnapshot = presenceEngine.snapshot

    fun deviceSessionClient(): SecureDeviceSessionClient = secureDeviceSessionClient

    internal fun localGatewayBootstrapRuntime(): ProcessLocalGatewayBootstrapRuntime =
        requireNotNull(localGatewayBootstrapRuntime) {
            "LOCAL gateway bootstrap runtime is unavailable in this environment"
        }

    internal fun composeLocalVoiceIngressFromPendingBootstrap(): GatewayVoiceRuntimeCompositionResult =
        localGatewayVoiceRuntimeComposition?.compose()
            ?: GatewayVoiceRuntimeCompositionResult.Rejected(
                GatewayVoiceRuntimeCompositionError.LOCAL_RUNTIME_UNAVAILABLE,
            )

    internal fun reconnectLocalVoiceIngressFromPendingBootstrap(): GatewayVoiceRuntimeCompositionResult =
        localGatewayVoiceRuntimeComposition?.reconnect()
            ?: GatewayVoiceRuntimeCompositionResult.Rejected(
                GatewayVoiceRuntimeCompositionError.LOCAL_RUNTIME_UNAVAILABLE,
            )

    /** Read-only native re-probe for the exact process-local authenticated projection. */
    internal fun currentVoiceProjectionWithFreshNativeState(): GovernedVoiceProjectionBundle? {
        val active = activeGatewayVoiceProjection ?: return null
        val current = WakeVoiceRuntimeRegistry.projectionStore.current() ?: return null
        if (
            current.activeTenantId != active.bundle.activeTenantId ||
            current.registry != active.bundle.registry ||
            current.vocabulary != active.bundle.vocabulary
        ) {
            return null
        }
        // Probe failure is not missing W14 catalog authority. Treat every native capability as
        // unavailable for this utterance; W15-F will recheck its own preconditions before effect.
        val observations =
            runCatching { active.capabilityBridge.discoverAll() }.getOrElse { emptyList() }
        // A different bootstrap generation may have replaced the projection while probing.
        if (activeGatewayVoiceProjection !== active) return null
        return refreshedNativeVoiceProjection(current, active.bundle, observations)
    }

    internal fun consumeLocalGovernedDeviceCommand(
        commandId: String,
    ): W15JDeviceCommandConsumptionResult =
        activeGatewayCommandConsumer?.consume(commandId)
            ?: W15JDeviceCommandConsumptionResult.NoEffect(
                reason = "governed device command consumer is not composed",
            )

    /**
     * The bootstrap exchange has already verified the one-use reference. Every subsequent
     * failure is returned as an allowlisted stage, never as a bearer, device ID or retry grant.
     * An expired persisted W14 session is diagnostic context, not permission to bypass W14.
     */
    private fun connectLocalGatewayVoiceIngress(
        grant: GatewayBootstrapGrant,
        expectedRegistrationVersion: Int?,
    ): GatewayVoiceRuntimeConnectResult {
        val persistedSessionExpired = runCatching {
            deviceSessionMetadataStore.load().session?.let {
                System.currentTimeMillis() >= it.gatewayAuthExpiresAtMs
            } ?: false
        }.getOrDefault(false)
        fun rejected(
            stage: GatewayVoiceRuntimeConnectStage,
            result: GatewayDevicePlaneResult<*>? = null,
        ): GatewayVoiceRuntimeConnectResult.Rejected {
            val network = result as? GatewayDevicePlaneResult.Rejected
            return GatewayVoiceRuntimeConnectResult.Rejected(
                GatewayVoiceRuntimeConnectFailure(
                    stage = stage,
                    networkError = network?.error,
                    upstreamCode = network?.upstreamCode?.takeIf { it.matches(Regex("[A-Z][A-Z0-9_]{0,63}")) },
                    persistedSessionExpired = persistedSessionExpired,
                ),
            )
        }

        val client = runCatching {
            GatewayDevicePlaneClient.forPhysicalAdbReverse(
                config = environmentConfig,
                sessionClient = secureDeviceSessionClient,
                port = 8080,
            )
        }.getOrNull() ?: return rejected(GatewayVoiceRuntimeConnectStage.DEVICE_PLANE_CLIENT)
        val credentialProvider = OneShotGatewayCredentialProvider(grant.credential)
        val request =
            GatewayDevicePlaneConnectRequest(
                gatewaySessionId = grant.gatewaySessionId,
                tenantId = grant.tenantId,
                actorKind = grant.actor.kind,
                actorIdentityId = grant.actor.identityId,
                correlationId = grant.correlationId,
                deviceId = grant.deviceId,
                deviceSessionId = grant.deviceSessionId,
                credentialProvider = credentialProvider,
                expectedRegistrationVersion = expectedRegistrationVersion,
            )

        val result = try {
            client.connect(request)
        } catch (_: Exception) {
            null
        } finally {
            // Do not retain or replay the one-shot credential after any outcome.
            credentialProvider.clear()
        }
        if (result !is GatewayDevicePlaneResult.Success) {
            runCatching { client.close() }
            return rejected(GatewayVoiceRuntimeConnectStage.DEVICE_PLANE_OPEN, result)
        }

        val projectionResult = runCatching { client.fetchVoiceProjection() }.getOrNull()
        if (projectionResult !is GatewayDevicePlaneResult.Success) {
            runCatching { client.close() }
            return rejected(GatewayVoiceRuntimeConnectStage.VOICE_PROJECTION_FETCH, projectionResult)
        }
        val installedProjection = runCatching {
            installableGatewayVoiceProjection(
                context = this,
                projection = projectionResult.value,
                expectedTenantId = grant.tenantId,
                runtimeProbe =
                    if (BuildConfig.AURORA_PHYSICAL_ACCEPTANCE_CONTROLS) PhysicalAcceptanceNativeRuntimeProbe(this)
                    else null,
            )
        }.getOrNull()
        if (installedProjection == null) {
            runCatching { client.close() }
            return rejected(GatewayVoiceRuntimeConnectStage.VOICE_PROJECTION_INSTALL)
        }

        val actionPort = AndroidDeviceActionPorts.create(this)
        val consumer = runCatching {
            W15JGatewayDeviceCommandConsumer.forAndroid(
                client = client,
                capabilityBridge = installedProjection.capabilityBridge,
                permissionContext = this,
                actionPort = actionPort,
                appIntegrationResolver = installedProjection.appIntegrationResolver,
            )
        }.getOrNull()
        if (consumer == null) {
            runCatching { client.close() }
            return rejected(GatewayVoiceRuntimeConnectStage.DEVICE_COMMAND_CONSUMER)
        }
        val offlineRuntime = composeOfflineRuntime(client, installedProjection, actionPort)
        if (offlineRuntime == null) {
            runCatching { client.close() }
            return rejected(GatewayVoiceRuntimeConnectStage.OFFLINE_RUNTIME)
        }

        WakeVoiceRuntimeRegistry.projectionStore.replace(installedProjection.bundle)
        activeGatewayDevicePlaneClient = client
        activeGatewayVoiceProjection = installedProjection
        activeGatewayCommandConsumer = consumer
        activeGatewayOfflineRuntime = offlineRuntime
        WakeVoiceRuntimeRegistry.installAuthorityIngress(GovernedW07VoiceAuthorityIngress(client))
        return GatewayVoiceRuntimeConnectResult.Connected
    }

    private fun reconnectLocalGatewayVoiceIngress(
        grant: GatewayBootstrapGrant,
        expectedRegistrationVersion: Int,
    ): GatewayVoiceRuntimeConnectResult {
        val persistedSessionExpired = runCatching {
            deviceSessionMetadataStore.load().session?.let {
                System.currentTimeMillis() >= it.gatewayAuthExpiresAtMs
            } ?: false
        }.getOrDefault(false)
        fun rejected(
            stage: GatewayVoiceRuntimeConnectStage,
            result: GatewayDevicePlaneResult<*>? = null,
        ): GatewayVoiceRuntimeConnectResult.Rejected {
            val network = result as? GatewayDevicePlaneResult.Rejected
            return GatewayVoiceRuntimeConnectResult.Rejected(
                GatewayVoiceRuntimeConnectFailure(
                    stage = stage,
                    networkError = network?.error,
                    upstreamCode = network?.upstreamCode?.takeIf { it.matches(Regex("[A-Z][A-Z0-9_]{0,63}")) },
                    persistedSessionExpired = persistedSessionExpired,
                ),
            )
        }

        val existingClient = activeGatewayDevicePlaneClient
        val client = existingClient ?: runCatching {
            GatewayDevicePlaneClient.forPhysicalAdbReverse(
                config = environmentConfig,
                sessionClient = secureDeviceSessionClient,
                port = 8080,
            )
        }.getOrNull() ?: return rejected(GatewayVoiceRuntimeConnectStage.DEVICE_PLANE_CLIENT)
        val credentialProvider = OneShotGatewayCredentialProvider(grant.credential)
        val request =
            GatewayDevicePlaneReconnectRequest(
                gatewaySessionId = grant.gatewaySessionId,
                tenantId = grant.tenantId,
                actorKind = grant.actor.kind,
                actorIdentityId = grant.actor.identityId,
                correlationId = grant.correlationId,
                deviceId = grant.deviceId,
                deviceSessionId = grant.deviceSessionId,
                credentialProvider = credentialProvider,
                expectedRegistrationVersion = expectedRegistrationVersion,
            )

        val result = try {
            if (existingClient == null) {
                client.reconnectFromPersisted(request, deviceSessionMetadataStore.load())
            } else {
                client.reconnect(request)
            }
        } catch (_: Exception) {
            null
        } finally {
            credentialProvider.clear()
        }
        if (result !is GatewayDevicePlaneResult.Success) {
            if (existingClient == null) runCatching { client.close() }
            return rejected(GatewayVoiceRuntimeConnectStage.DEVICE_PLANE_OPEN, result)
        }
        activeGatewayDevicePlaneClient = client

        val projectionResult = runCatching { client.fetchVoiceProjection() }.getOrNull()
        if (projectionResult !is GatewayDevicePlaneResult.Success) {
            return rejected(GatewayVoiceRuntimeConnectStage.VOICE_PROJECTION_FETCH, projectionResult)
        }
        val installedProjection = runCatching {
            installableGatewayVoiceProjection(
                context = this,
                projection = projectionResult.value,
                expectedTenantId = grant.tenantId,
                runtimeProbe =
                    if (BuildConfig.AURORA_PHYSICAL_ACCEPTANCE_CONTROLS) PhysicalAcceptanceNativeRuntimeProbe(this)
                    else null,
            )
        }.getOrNull() ?: return rejected(GatewayVoiceRuntimeConnectStage.VOICE_PROJECTION_INSTALL)
        val actionPort = AndroidDeviceActionPorts.create(this)
        val consumer = runCatching {
            W15JGatewayDeviceCommandConsumer.forAndroid(
                client = client,
                capabilityBridge = installedProjection.capabilityBridge,
                permissionContext = this,
                actionPort = actionPort,
                appIntegrationResolver = installedProjection.appIntegrationResolver,
            )
        }.getOrNull() ?: return rejected(GatewayVoiceRuntimeConnectStage.DEVICE_COMMAND_CONSUMER)
        val offlineRuntime = composeOfflineRuntime(client, installedProjection, actionPort)
            ?: return rejected(GatewayVoiceRuntimeConnectStage.OFFLINE_RUNTIME)

        WakeVoiceRuntimeRegistry.projectionStore.replace(installedProjection.bundle)
        activeGatewayVoiceProjection = installedProjection
        activeGatewayCommandConsumer = consumer
        activeGatewayOfflineRuntime = offlineRuntime
        WakeVoiceRuntimeRegistry.installAuthorityIngress(GovernedW07VoiceAuthorityIngress(client))
        return GatewayVoiceRuntimeConnectResult.Connected
    }

    private fun composeOfflineRuntime(
        client: GatewayDevicePlaneClient,
        projection: InstalledGatewayVoiceProjection,
        actionPort: DeviceActionPort,
    ): GatewayOfflineExecutionRuntime? =
        runCatching {
            GatewayOfflineExecutionRuntime.forAndroid(
                client = client,
                context = this,
                capabilityBridge = projection.capabilityBridge,
                actionPort = actionPort,
                appIntegrationResolver = projection.appIntegrationResolver,
            )
        }.getOrNull()

    internal fun dp5PrepareSafeDeferred(commandId: String): String {
        if (!BuildConfig.AURORA_PHYSICAL_ACCEPTANCE_CONTROLS) return "OFFLINE_PREPARE_REJECTED"
        val runtime = activeGatewayOfflineRuntime ?: return "OFFLINE_PREPARE_REJECTED"
        return when (val result = runtime.prepareSafeDeferred(commandId)) {
            is GatewayOfflinePrepareResult.Rejected -> "OFFLINE_PREPARE_REJECTED"
            is GatewayOfflinePrepareResult.Prepared ->
                when (result.decision) {
                    is OfflineEnqueueDecision.Queued -> "OFFLINE_PREPARE_QUEUED_PASS"
                    is OfflineEnqueueDecision.Duplicate -> "OFFLINE_PREPARE_DUPLICATE_PASS"
                    is OfflineEnqueueDecision.Rejected -> "OFFLINE_PREPARE_REJECTED"
                }
        }
    }

    internal fun dp5DrainOffline(): String {
        if (!BuildConfig.AURORA_PHYSICAL_ACCEPTANCE_CONTROLS) return "OFFLINE_DRAIN_REJECTED"
        val runtime = activeGatewayOfflineRuntime ?: return "OFFLINE_DRAIN_REJECTED"
        val dispositions = runtime.drain().map { it.disposition.name }
        return "OFFLINE_DRAIN_${if (dispositions.isEmpty()) "EMPTY" else dispositions.joinToString("_")}_PASS"
    }

    internal fun dp5OfflineSnapshot(): String {
        if (!BuildConfig.AURORA_PHYSICAL_ACCEPTANCE_CONTROLS) return "OFFLINE_SNAPSHOT_REJECTED"
        val runtime = activeGatewayOfflineRuntime ?: return "OFFLINE_SNAPSHOT_REJECTED"
        val states = runtime.snapshot().map { it.state.name }
        return "OFFLINE_SNAPSHOT_${if (states.isEmpty()) "EMPTY" else states.joinToString("_")}_PASS"
    }

    internal fun dp5RevokeCurrentSession(): Boolean {
        if (!BuildConfig.AURORA_PHYSICAL_ACCEPTANCE_CONTROLS) return false
        val client = activeGatewayDevicePlaneClient ?: return false
        return client.revokeCurrentSession("dp5:physical-session-revoke") is GatewayDevicePlaneResult.Success
    }

    internal fun dp5RotateCurrentSession(newDeviceSessionId: String): Boolean {
        if (!BuildConfig.AURORA_PHYSICAL_ACCEPTANCE_CONTROLS) return false
        val client = activeGatewayDevicePlaneClient ?: return false
        return client.rotateCurrentSession(
            newDeviceSessionId = newDeviceSessionId,
            reasonReference = "dp5:physical-session-rotate",
        ) is GatewayDevicePlaneResult.Success
    }

    private fun clearLocalGatewayVoiceRuntime() {
        WakeVoiceRuntimeRegistry.clearAuthorityIngress()
        WakeVoiceRuntimeRegistry.projectionStore.clear()
        activeGatewayCommandConsumer = null
        activeGatewayOfflineRuntime = null
        activeGatewayVoiceProjection = null
        runCatching { activeGatewayDevicePlaneClient?.close() }
        activeGatewayDevicePlaneClient = null
    }
}
