package ai.aurora.device

import android.app.Application
import ai.aurora.device.bootstrap.GatewayBootstrapClient
import ai.aurora.device.bootstrap.ProcessLocalGatewayBootstrapRuntime
import ai.aurora.device.config.AuroraEnvironment
import ai.aurora.device.config.RuntimeEnvironmentConfig
import ai.aurora.device.lifecycle.AndroidPresenceCheckpointStore
import ai.aurora.device.lifecycle.AndroidPresenceCoordinator
import ai.aurora.device.lifecycle.PresenceEngine
import ai.aurora.device.lifecycle.PresenceSnapshot
import ai.aurora.device.security.AndroidKeystoreSigningKeyStore
import ai.aurora.device.session.AndroidDeviceSessionMetadataStore
import ai.aurora.device.session.SecureDeviceSessionClient
import ai.aurora.device.session.SessionLifecycleHooks

class AuroraApplication : Application() {
    lateinit var environmentConfig: RuntimeEnvironmentConfig
        private set

    private lateinit var presenceEngine: PresenceEngine
    private lateinit var presenceCoordinator: AndroidPresenceCoordinator
    private lateinit var secureDeviceSessionClient: SecureDeviceSessionClient
    private var localGatewayBootstrapRuntime: ProcessLocalGatewayBootstrapRuntime? = null

    override fun onCreate() {
        super.onCreate()
        environmentConfig =
            RuntimeEnvironmentConfig.fromBuildValues(
                environment = BuildConfig.AURORA_ENVIRONMENT,
                gatewayOrigin = BuildConfig.AURORA_GATEWAY_ORIGIN,
                allowCleartextTraffic = BuildConfig.AURORA_ALLOW_CLEARTEXT,
            )

        secureDeviceSessionClient =
            SecureDeviceSessionClient(
                metadataStore = AndroidDeviceSessionMetadataStore(this),
                keyStore = AndroidKeystoreSigningKeyStore(),
            )

        if (
            environmentConfig.environment == AuroraEnvironment.LOCAL &&
            environmentConfig.allowCleartextTraffic
        ) {
            // Port 8081 is a pre-session LOCAL/ADB-reverse bootstrap exchange only. Voice and
            // device-plane traffic continue on the authenticated W14 session channel (8080).
            localGatewayBootstrapRuntime =
                ProcessLocalGatewayBootstrapRuntime(GatewayBootstrapClient.physicalAdbReverse())
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
}
