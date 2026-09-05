package ai.aurora.device

import android.app.Application
import ai.aurora.device.config.RuntimeEnvironmentConfig
import ai.aurora.device.lifecycle.AndroidPresenceCheckpointStore
import ai.aurora.device.lifecycle.AndroidPresenceCoordinator
import ai.aurora.device.lifecycle.PresenceEngine
import ai.aurora.device.lifecycle.PresenceSnapshot
import ai.aurora.device.security.AndroidKeystoreSigningKeyStore
import ai.aurora.device.session.AndroidDeviceSessionMetadataStore
import ai.aurora.device.session.SecureDeviceSessionClient
import ai.aurora.device.session.SessionLifecycleHooks
import ai.aurora.device.voice.GovernedVoiceProjectionStore

class AuroraApplication : Application() {
    lateinit var environmentConfig: RuntimeEnvironmentConfig
        private set

    private lateinit var presenceEngine: PresenceEngine
    private lateinit var presenceCoordinator: AndroidPresenceCoordinator
    private lateinit var secureDeviceSessionClient: SecureDeviceSessionClient
    private val governedVoiceProjectionStore = GovernedVoiceProjectionStore()

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

    /**
     * Atomic read-only composition store for reconciled W04/W15-C/W15-G voice projections.
     *
     * The application never populates this store from local guesses. Until a governed upstream
     * adapter supplies a reconciled bundle, the store is empty and wake voice routing falls back to
     * Conversation. The store never contains PolicyToken/OwnerDecision/W07 execution authority.
     */
    fun voiceProjectionStore(): GovernedVoiceProjectionStore = governedVoiceProjectionStore
}
