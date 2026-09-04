package ai.aurora.device.permission

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import ai.aurora.device.lifecycle.PresenceEngine

class AndroidRuntimePermissionProbe(
    private val activity: Activity,
    private val clockMs: () -> Long = { System.currentTimeMillis() },
) : RuntimePermissionProbe {
    override fun snapshot(requirement: RuntimePermissionRequirement): RuntimePermissionSnapshot =
        RuntimePermissionSnapshot(
            observedAtMs = clockMs(),
            granted = activity.checkSelfPermission(requirement.permission) == PackageManager.PERMISSION_GRANTED,
            shouldShowRationale = activity.shouldShowRequestPermissionRationale(requirement.permission),
            backgroundRestricted =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    activity.getSystemService(ActivityManager::class.java)?.isBackgroundRestricted == true
                } else {
                    false
                },
        )
}

class SharedPreferencesPermissionHistoryStore(context: Context) : PermissionHistoryStore {
    private val preferences =
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    override fun load(permission: String): PermissionHistory =
        PermissionHistory(
            everRequested = preferences.getBoolean("$permission.requested", false),
            everGranted = preferences.getBoolean("$permission.granted", false),
        )

    override fun save(permission: String, history: PermissionHistory) {
        check(
            preferences
                .edit()
                .putBoolean("$permission.requested", history.everRequested)
                .putBoolean("$permission.granted", history.everGranted)
                .commit(),
        ) { "permission history commit failed" }
    }

    companion object {
        private const val PREFERENCES_NAME = "aurora_permission_history_v1"
    }
}

internal class AndroidPermissionPromptLauncher(
    private val activity: Activity,
    private val requestCodeProvider: (String) -> Int,
) : PermissionPromptLauncher {
    override fun launch(permission: String) {
        activity.requestPermissions(arrayOf(permission), requestCodeProvider(permission))
    }
}

/**
 * Android integration that derives prompt visibility from the canonical W15-A PresenceEngine.
 *
 * This coordinator never treats permission state as Aurora authority. It only makes a runtime
 * permission prompt reachable from an explicit user-initiated foreground interaction.
 */
class AndroidPermissionCoordinator(
    private val presenceEngine: PresenceEngine,
    private val broker: PermissionConsentBroker,
) {
    fun observe(requirement: RuntimePermissionRequirement): RuntimePermissionObservation =
        broker.observe(requirement)

    fun requestFromUserInteraction(
        requirement: RuntimePermissionRequirement,
    ): PermissionPromptResult =
        broker.request(
            requirement = requirement,
            context =
                PermissionPromptContext(
                    appVisibility = presenceEngine.snapshot.visibility,
                    userInitiated = true,
                ),
        )

    fun onPromptResult(requirement: RuntimePermissionRequirement): RuntimePermissionObservation =
        broker.onPromptResult(requirement)

    companion object {
        fun create(
            activity: Activity,
            presenceEngine: PresenceEngine,
            requestCodeProvider: (String) -> Int,
            clockMs: () -> Long = { System.currentTimeMillis() },
        ): AndroidPermissionCoordinator =
            AndroidPermissionCoordinator(
                presenceEngine = presenceEngine,
                broker =
                    PermissionConsentBroker(
                        probe = AndroidRuntimePermissionProbe(activity, clockMs),
                        historyStore = SharedPreferencesPermissionHistoryStore(activity.applicationContext),
                        promptLauncher = AndroidPermissionPromptLauncher(activity, requestCodeProvider),
                        nowMs = clockMs,
                    ),
            )
    }
}
