package ai.aurora.device.permission

import ai.aurora.device.lifecycle.AppVisibility
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PermissionConsentBrokerTest {
    @Test
    fun `fresh granted permission satisfies only local precondition and records grant history`() {
        val fixture = fixture(snapshot = snapshot(granted = true))

        val observation = fixture.broker.observe(REQUIREMENT)

        assertEquals(RuntimePermissionState.GRANTED, observation.state)
        assertTrue(observation.preconditionSatisfied)
        assertEquals(PermissionHistory(everGranted = true), fixture.history.load(PERMISSION))
    }

    @Test
    fun `grant drift to revoked is detected on next observation`() {
        val fixture = fixture(snapshot = snapshot(granted = true))
        assertEquals(RuntimePermissionState.GRANTED, fixture.broker.observe(REQUIREMENT).state)

        fixture.probe.current = snapshot(granted = false, shouldShowRationale = true)

        val revoked = fixture.broker.observe(REQUIREMENT)
        assertEquals(RuntimePermissionState.REVOKED, revoked.state)
        assertFalse(revoked.preconditionSatisfied)
    }

    @Test
    fun `requested denial distinguishes rationale from permanent denial`() {
        val denied =
            fixture(
                snapshot = snapshot(shouldShowRationale = true),
                history = PermissionHistory(everRequested = true),
            )
        val permanent =
            fixture(
                snapshot = snapshot(shouldShowRationale = false),
                history = PermissionHistory(everRequested = true),
            )

        assertEquals(RuntimePermissionState.DENIED, denied.broker.observe(REQUIREMENT).state)
        assertEquals(
            RuntimePermissionState.PERMANENTLY_DENIED,
            permanent.broker.observe(REQUIREMENT).state,
        )
    }

    @Test
    fun `background restriction applies only to a background access requirement`() {
        val restrictedSnapshot = snapshot(granted = true, backgroundRestricted = true)
        val foregroundOnly = fixture(snapshot = restrictedSnapshot)
        val background = fixture(snapshot = restrictedSnapshot)

        assertEquals(RuntimePermissionState.GRANTED, foregroundOnly.broker.observe(REQUIREMENT).state)
        assertEquals(
            RuntimePermissionState.BACKGROUND_RESTRICTED,
            background.broker.observe(REQUIREMENT.copy(requiresBackgroundAccess = true)).state,
        )
    }

    @Test
    fun `stale future and exact expiry snapshots fail closed`() {
        val exactExpiry = fixture(snapshot = snapshot(observedAtMs = NOW_MS - MAX_AGE_MS))
        val future = fixture(snapshot = snapshot(observedAtMs = NOW_MS + 1))
        val justFresh = fixture(snapshot = snapshot(observedAtMs = NOW_MS - MAX_AGE_MS + 1))

        assertEquals(
            RuntimePermissionState.STALE_RUNTIME_STATE,
            exactExpiry.broker.observe(REQUIREMENT).state,
        )
        assertEquals(
            RuntimePermissionState.STALE_RUNTIME_STATE,
            future.broker.observe(REQUIREMENT).state,
        )
        assertEquals(
            RuntimePermissionState.NOT_REQUESTED,
            justFresh.broker.observe(REQUIREMENT).state,
        )
    }

    @Test
    fun `permission prompt is blocked outside explicit foreground user interaction`() {
        val background = fixture()
        val passiveForeground = fixture()

        val backgroundResult =
            background.broker.request(
                REQUIREMENT,
                PermissionPromptContext(AppVisibility.BACKGROUND, userInitiated = true),
            )
        val passiveResult =
            passiveForeground.broker.request(
                REQUIREMENT,
                PermissionPromptContext(AppVisibility.FOREGROUND, userInitiated = false),
            )

        assertEquals(
            PermissionPromptDecision.BLOCKED_NON_INTERACTIVE_CONTEXT,
            backgroundResult.decision,
        )
        assertEquals(
            PermissionPromptDecision.BLOCKED_NON_INTERACTIVE_CONTEXT,
            passiveResult.decision,
        )
        assertTrue(background.launcher.launched.isEmpty())
        assertTrue(passiveForeground.launcher.launched.isEmpty())
        assertEquals(PermissionHistory(), background.history.load(PERMISSION))
    }

    @Test
    fun `foreground user prompt is durable and remains explicitly in flight until callback`() {
        val fixture = fixture()
        val context = PermissionPromptContext(AppVisibility.FOREGROUND, userInitiated = true)

        val first = fixture.broker.request(REQUIREMENT, context)
        val inFlight = fixture.broker.observe(REQUIREMENT)
        val duplicate = fixture.broker.request(REQUIREMENT, context)

        assertEquals(PermissionPromptDecision.PROMPT_LAUNCHED, first.decision)
        assertEquals(RuntimePermissionState.PROMPT_IN_FLIGHT, inFlight.state)
        assertEquals(PermissionPromptDecision.ALREADY_IN_FLIGHT, duplicate.decision)
        assertEquals(listOf(PERMISSION), fixture.launcher.launched)
        assertEquals(PermissionHistory(everRequested = true), fixture.history.load(PERMISSION))
    }

    @Test
    fun `prompt completion reobserves grant and clears in flight state`() {
        val fixture = fixture()
        val context = PermissionPromptContext(AppVisibility.FOREGROUND, userInitiated = true)
        assertEquals(
            PermissionPromptDecision.PROMPT_LAUNCHED,
            fixture.broker.request(REQUIREMENT, context).decision,
        )

        fixture.probe.current = snapshot(granted = true)
        val completed = fixture.broker.onPromptResult(REQUIREMENT)
        val next = fixture.broker.request(REQUIREMENT, context)

        assertEquals(RuntimePermissionState.GRANTED, completed.state)
        assertEquals(PermissionPromptDecision.ALREADY_GRANTED, next.decision)
        assertEquals(1, fixture.launcher.launched.size)
    }

    @Test
    fun `permanent denial revoked grant and background restriction never auto prompt`() {
        val context = PermissionPromptContext(AppVisibility.FOREGROUND, userInitiated = true)
        val permanent =
            fixture(
                snapshot = snapshot(shouldShowRationale = false),
                history = PermissionHistory(everRequested = true),
            )
        val revoked =
            fixture(
                snapshot = snapshot(shouldShowRationale = true),
                history = PermissionHistory(everRequested = true, everGranted = true),
            )
        val background = fixture(snapshot = snapshot(granted = true, backgroundRestricted = true))

        assertEquals(
            PermissionPromptDecision.SETTINGS_REQUIRED,
            permanent.broker.request(REQUIREMENT, context).decision,
        )
        assertEquals(
            PermissionPromptDecision.SETTINGS_REQUIRED,
            revoked.broker.request(REQUIREMENT, context).decision,
        )
        assertEquals(
            PermissionPromptDecision.BACKGROUND_RESTRICTION_REQUIRES_SETTINGS,
            background.broker
                .request(REQUIREMENT.copy(requiresBackgroundAccess = true), context)
                .decision,
        )
        assertTrue(permanent.launcher.launched.isEmpty())
        assertTrue(revoked.launcher.launched.isEmpty())
        assertTrue(background.launcher.launched.isEmpty())
    }

    @Test
    fun `launcher failure rolls back request history and releases in flight lock`() {
        val fixture = fixture(launcherFails = true)
        val context = PermissionPromptContext(AppVisibility.FOREGROUND, userInitiated = true)

        val failed = fixture.broker.request(REQUIREMENT, context)

        assertEquals(PermissionPromptDecision.PROMPT_LAUNCH_FAILED, failed.decision)
        assertEquals(PermissionHistory(), fixture.history.load(PERMISSION))

        fixture.launcher.fail = false
        val retry = fixture.broker.request(REQUIREMENT, context)
        assertEquals(PermissionPromptDecision.PROMPT_LAUNCHED, retry.decision)
    }

    @Test
    fun `history read failure becomes local state unavailable instead of authority`() {
        val fixture = fixture()
        fixture.history.failLoads = true

        val observation = fixture.broker.observe(REQUIREMENT)
        val request =
            fixture.broker.request(
                REQUIREMENT,
                PermissionPromptContext(AppVisibility.FOREGROUND, userInitiated = true),
            )

        assertEquals(RuntimePermissionState.LOCAL_STATE_UNAVAILABLE, observation.state)
        assertEquals(PermissionPromptDecision.LOCAL_STATE_UNAVAILABLE, request.decision)
        assertTrue(fixture.launcher.launched.isEmpty())
    }

    @Test
    fun `history write failure blocks grant from becoming an apparently durable precondition`() {
        val fixture = fixture(snapshot = snapshot(granted = true))
        fixture.history.failSaves = true

        val observation = fixture.broker.observe(REQUIREMENT)

        assertEquals(RuntimePermissionState.LOCAL_STATE_UNAVAILABLE, observation.state)
        assertFalse(observation.preconditionSatisfied)
    }

    private fun fixture(
        snapshot: RuntimePermissionSnapshot = snapshot(),
        history: PermissionHistory = PermissionHistory(),
        launcherFails: Boolean = false,
    ): Fixture {
        val probe = MutableProbe(snapshot)
        val historyStore = MemoryHistoryStore(mutableMapOf(PERMISSION to history))
        val launcher = RecordingLauncher(launcherFails)
        val broker =
            PermissionConsentBroker(
                probe = probe,
                historyStore = historyStore,
                promptLauncher = launcher,
                nowMs = { NOW_MS },
                maxSnapshotAgeMs = MAX_AGE_MS,
            )
        return Fixture(broker, probe, historyStore, launcher)
    }

    private fun snapshot(
        observedAtMs: Long = NOW_MS - 1,
        granted: Boolean = false,
        shouldShowRationale: Boolean = false,
        backgroundRestricted: Boolean = false,
    ): RuntimePermissionSnapshot =
        RuntimePermissionSnapshot(
            observedAtMs = observedAtMs,
            granted = granted,
            shouldShowRationale = shouldShowRationale,
            backgroundRestricted = backgroundRestricted,
        )

    private data class Fixture(
        val broker: PermissionConsentBroker,
        val probe: MutableProbe,
        val history: MemoryHistoryStore,
        val launcher: RecordingLauncher,
    )

    private class MutableProbe(var current: RuntimePermissionSnapshot) : RuntimePermissionProbe {
        override fun snapshot(requirement: RuntimePermissionRequirement): RuntimePermissionSnapshot = current
    }

    private class MemoryHistoryStore(
        private val values: MutableMap<String, PermissionHistory>,
    ) : PermissionHistoryStore {
        var failLoads: Boolean = false
        var failSaves: Boolean = false

        override fun load(permission: String): PermissionHistory {
            if (failLoads) throw IllegalStateException("load failed")
            return values[permission] ?: PermissionHistory()
        }

        override fun save(permission: String, history: PermissionHistory) {
            if (failSaves) throw IllegalStateException("save failed")
            values[permission] = history
        }
    }

    private class RecordingLauncher(var fail: Boolean) : PermissionPromptLauncher {
        val launched = mutableListOf<String>()

        override fun launch(permission: String) {
            if (fail) throw IllegalStateException("launch failed")
            launched += permission
        }
    }

    companion object {
        private const val PERMISSION = "android.permission.CAMERA"
        private val REQUIREMENT = RuntimePermissionRequirement(PERMISSION)
        private const val NOW_MS = 1_000_000L
        private const val MAX_AGE_MS = 30_000L
    }
}
