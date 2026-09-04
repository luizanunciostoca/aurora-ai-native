package ai.aurora.device.permission

import ai.aurora.device.lifecycle.AppVisibility

data class RuntimePermissionRequirement(
    val permission: String,
    val requiresBackgroundAccess: Boolean = false,
) {
    init {
        require(permission.isNotBlank()) { "permission must not be blank" }
    }
}

data class RuntimePermissionSnapshot(
    val observedAtMs: Long,
    val granted: Boolean,
    val shouldShowRationale: Boolean,
    val backgroundRestricted: Boolean,
)

fun interface RuntimePermissionProbe {
    fun snapshot(requirement: RuntimePermissionRequirement): RuntimePermissionSnapshot
}

data class PermissionHistory(
    val everRequested: Boolean = false,
    val everGranted: Boolean = false,
)

interface PermissionHistoryStore {
    fun load(permission: String): PermissionHistory

    fun save(permission: String, history: PermissionHistory)
}

fun interface PermissionPromptLauncher {
    fun launch(permission: String)
}

enum class RuntimePermissionState {
    GRANTED,
    NOT_REQUESTED,
    DENIED,
    PERMANENTLY_DENIED,
    REVOKED,
    BACKGROUND_RESTRICTED,
    STALE_RUNTIME_STATE,
}

data class RuntimePermissionObservation(
    val requirement: RuntimePermissionRequirement,
    val state: RuntimePermissionState,
    val observedAtMs: Long,
    val expiresAtMs: Long,
    val shouldShowRationale: Boolean,
) {
    val preconditionSatisfied: Boolean
        get() = state == RuntimePermissionState.GRANTED
}

data class PermissionPromptContext(
    val appVisibility: AppVisibility,
    val userInitiated: Boolean,
)

enum class PermissionPromptDecision {
    PROMPT_LAUNCHED,
    ALREADY_GRANTED,
    ALREADY_IN_FLIGHT,
    BLOCKED_NON_INTERACTIVE_CONTEXT,
    SETTINGS_REQUIRED,
    BACKGROUND_RESTRICTION_REQUIRES_SETTINGS,
    STALE_RUNTIME_STATE,
    PROMPT_LAUNCH_FAILED,
}

data class PermissionPromptResult(
    val decision: PermissionPromptDecision,
    val observation: RuntimePermissionObservation,
)

/**
 * W15-E is an Android-local precondition/UX broker only.
 *
 * Runtime permission state is never a PolicyToken, OwnerDecision, approval, W07 execution authority,
 * retry permission, Receipt, or Evidence. Callers must still pass every Aurora authority and target
 * gate owned by W02/W07 before W15-F performs any native side effect.
 */
class PermissionConsentBroker(
    private val probe: RuntimePermissionProbe,
    private val historyStore: PermissionHistoryStore,
    private val promptLauncher: PermissionPromptLauncher,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
    private val maxSnapshotAgeMs: Long = DEFAULT_MAX_SNAPSHOT_AGE_MS,
) {
    private val promptsInFlight = mutableSetOf<String>()

    init {
        require(maxSnapshotAgeMs > 0) { "maxSnapshotAgeMs must be positive" }
    }

    @Synchronized
    fun observe(requirement: RuntimePermissionRequirement): RuntimePermissionObservation {
        val snapshot = probe.snapshot(requirement)
        val currentMs = nowMs()
        val expiresAtMs = saturatingAdd(snapshot.observedAtMs, maxSnapshotAgeMs)
        if (
            snapshot.observedAtMs < 0 ||
            currentMs < 0 ||
            snapshot.observedAtMs > currentMs ||
            currentMs >= expiresAtMs
        ) {
            return RuntimePermissionObservation(
                requirement = requirement,
                state = RuntimePermissionState.STALE_RUNTIME_STATE,
                observedAtMs = snapshot.observedAtMs,
                expiresAtMs = expiresAtMs,
                shouldShowRationale = snapshot.shouldShowRationale,
            )
        }

        val history = historyStore.load(requirement.permission)
        val state =
            when {
                snapshot.granted && requirement.requiresBackgroundAccess && snapshot.backgroundRestricted ->
                    RuntimePermissionState.BACKGROUND_RESTRICTED
                snapshot.granted -> RuntimePermissionState.GRANTED
                history.everGranted -> RuntimePermissionState.REVOKED
                history.everRequested && !snapshot.shouldShowRationale ->
                    RuntimePermissionState.PERMANENTLY_DENIED
                history.everRequested -> RuntimePermissionState.DENIED
                else -> RuntimePermissionState.NOT_REQUESTED
            }

        if (snapshot.granted && !history.everGranted) {
            historyStore.save(requirement.permission, history.copy(everGranted = true))
        }

        return RuntimePermissionObservation(
            requirement = requirement,
            state = state,
            observedAtMs = snapshot.observedAtMs,
            expiresAtMs = expiresAtMs,
            shouldShowRationale = snapshot.shouldShowRationale,
        )
    }

    @Synchronized
    fun request(
        requirement: RuntimePermissionRequirement,
        context: PermissionPromptContext,
    ): PermissionPromptResult {
        val observation = observe(requirement)
        val permission = requirement.permission

        val terminalDecision =
            when (observation.state) {
                RuntimePermissionState.GRANTED -> PermissionPromptDecision.ALREADY_GRANTED
                RuntimePermissionState.PERMANENTLY_DENIED,
                RuntimePermissionState.REVOKED,
                -> PermissionPromptDecision.SETTINGS_REQUIRED
                RuntimePermissionState.BACKGROUND_RESTRICTED ->
                    PermissionPromptDecision.BACKGROUND_RESTRICTION_REQUIRES_SETTINGS
                RuntimePermissionState.STALE_RUNTIME_STATE -> PermissionPromptDecision.STALE_RUNTIME_STATE
                RuntimePermissionState.NOT_REQUESTED,
                RuntimePermissionState.DENIED,
                -> null
            }
        if (terminalDecision != null) {
            return PermissionPromptResult(terminalDecision, observation)
        }

        if (context.appVisibility != AppVisibility.FOREGROUND || !context.userInitiated) {
            return PermissionPromptResult(
                PermissionPromptDecision.BLOCKED_NON_INTERACTIVE_CONTEXT,
                observation,
            )
        }
        if (!promptsInFlight.add(permission)) {
            return PermissionPromptResult(PermissionPromptDecision.ALREADY_IN_FLIGHT, observation)
        }

        val previousHistory = historyStore.load(permission)
        historyStore.save(permission, previousHistory.copy(everRequested = true))
        return try {
            promptLauncher.launch(permission)
            PermissionPromptResult(PermissionPromptDecision.PROMPT_LAUNCHED, observation)
        } catch (_: RuntimeException) {
            historyStore.save(permission, previousHistory)
            promptsInFlight.remove(permission)
            PermissionPromptResult(PermissionPromptDecision.PROMPT_LAUNCH_FAILED, observation)
        }
    }

    @Synchronized
    fun onPromptResult(requirement: RuntimePermissionRequirement): RuntimePermissionObservation {
        promptsInFlight.remove(requirement.permission)
        return observe(requirement)
    }

    private fun saturatingAdd(left: Long, right: Long): Long =
        if (left > Long.MAX_VALUE - right) Long.MAX_VALUE else left + right

    companion object {
        const val DEFAULT_MAX_SNAPSHOT_AGE_MS: Long = 30_000
    }
}
