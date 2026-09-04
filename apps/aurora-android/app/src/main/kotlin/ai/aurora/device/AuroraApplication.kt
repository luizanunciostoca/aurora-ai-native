package ai.aurora.device

import android.app.Application
import ai.aurora.device.config.RuntimeEnvironmentConfig
import ai.aurora.device.lifecycle.AndroidPresenceCheckpointStore
import ai.aurora.device.lifecycle.AndroidPresenceCoordinator
import ai.aurora.device.lifecycle.PresenceEngine
import ai.aurora.device.lifecycle.PresenceSnapshot
import ai.aurora.device.session.SessionLifecycleHooks

class AuroraApplication : Application() {
    lateinit var environmentConfig: RuntimeEnvironmentConfig
        private set

    private lateinit var presenceEngine: PresenceEngine
    private lateinit var presenceCoordinator: AndroidPresenceCoordinator

    override fun onCreate() {
        super.onCreate()
        environmentConfig =
            RuntimeEnvironmentConfig.fromBuildValues(
                environment = BuildConfig.AURORA_ENVIRONMENT,
                gatewayOrigin = BuildConfig.AURORA_GATEWAY_ORIGIN,
                allowCleartextTraffic = BuildConfig.AURORA_ALLOW_CLEARTEXT,
            )

        presenceEngine =
            PresenceEngine(
                store = AndroidPresenceCheckpointStore(this),
                sessionHooks = SessionLifecycleHooks { _ ->
                    // W15-A publishes lifecycle observations only. W15-B owns the secure session client.
                },
            )
        presenceCoordinator = AndroidPresenceCoordinator(this, presenceEngine)
        presenceCoordinator.start()
    }

    fun presenceSnapshot(): PresenceSnapshot = presenceEngine.snapshot
}
