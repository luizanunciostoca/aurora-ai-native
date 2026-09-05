package ai.aurora.device

import android.app.Application
import ai.aurora.device.bootstrap.GatewayBootstrapClient
import ai.aurora.device.bootstrap.GatewayBootstrapClientError
import ai.aurora.device.bootstrap.GatewayBootstrapClientResult
import ai.aurora.device.bootstrap.GatewayBootstrapGrant
import ai.aurora.device.bootstrap.ProcessLocalGatewayBootstrapRuntime
import ai.aurora.device.config.AuroraEnvironment
import ai.aurora.device.config.RuntimeEnvironmentConfig
import ai.aurora.device.lifecycle.AndroidPresenceCheckpointStore
import ai.aurora.device.lifecycle.AndroidPresenceCoordinator
import ai.aurora.device.lifecycle.PresenceEngine
import ai.aurora.device.lifecycle.PresenceSnapshot
import ai.aurora.device.network.GatewayDevicePlaneClient
import ai.aurora.device.network.GatewayDevicePlaneConnectRequest
import ai.aurora.device.network.GatewayDevicePlaneResult
import ai.aurora.device.security.AndroidKeystoreSigningKeyStore
import ai.aurora.device.session.AndroidDeviceSessionMetadataStore
import ai.aurora.device.session.SecureDeviceSessionClient
import ai.aurora.device.session.SessionLifecycleHooks
import ai.aurora.device.voice.GatewayBootstrapGrantSource
import ai.aurora.device.voice.GatewayVoiceRuntimeComposition
import ai.aurora.device.voice.GatewayVoiceRuntimeCompositionError
import ai.aurora.device.voice.GatewayVoiceRuntimeCompositionResult
import ai.aurora.device.voice.GatewayVoiceRuntimeConnector
import ai.aurora.device.voice.GovernedW07VoiceAuthorityIngress
import ai.aurora.device.voice.OneShotGatewayCredentialProvider
import ai.aurora.device.voice.WakeVoiceRuntimeRegistry
import ai.aurora.device.voice.localGatewayBindingFrom

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

    private fun connectLocalGatewayVoiceIngress(
        grant: GatewayBootstrapGrant,
        expectedRegistrationVersion: Int?,
    ): Boolean {
        val client =
            runCatching {
                GatewayDevicePlaneClient.forPhysicalAdbReverse(
                    config = environmentConfig,
                    sessionClient = secureDeviceSessionClient,
                    port = 8080,
                )
            }.getOrNull() ?: return false
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

        val result =
            try {
                client.connect(request)
            } catch (_: Exception) {
                null
            } finally {
                // Even a failed or uncertain connection attempt must not retain the bootstrap credential.
                credentialProvider.clear()
            }
        if (result !is GatewayDevicePlaneResult.Success) {
            runCatching { client.close() }
            return false
        }

        activeGatewayDevicePlaneClient = client
        WakeVoiceRuntimeRegistry.installAuthorityIngress(GovernedW07VoiceAuthorityIngress(client))
        return true
    }

    private fun clearLocalGatewayVoiceRuntime() {
        WakeVoiceRuntimeRegistry.clearAuthorityIngress()
        runCatching { activeGatewayDevicePlaneClient?.close() }
        activeGatewayDevicePlaneClient = null
    }
}
