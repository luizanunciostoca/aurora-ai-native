package ai.aurora.device.wake

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WakeStateMachineTest {
    @Test
    fun `confirmed wake remains non-authoritative evidence only`() {
        val machine = WakeStateMachine()
        machine.arm()

        val result =
            machine.evaluate(
                WakeObservation(
                    observedAtMs = 1_000,
                    confidence = 0.95,
                    featureFingerprint = "abc",
                ),
            )

        assertTrue(result is WakeEvaluation.Confirmed)
        val candidate = (result as WakeEvaluation.Confirmed).candidate
        assertFalse(candidate.authorizesExecution)
        assertFalse(candidate.provesExecutionSuccess)
        assertFalse(candidate.retryAuthorized)
        assertEquals(WakeState.HOTWORD_CONFIRMED, machine.state)
    }

    @Test
    fun `privacy and permission fail closed before acoustic confidence can matter`() {
        val privacyMachine = WakeStateMachine()
        privacyMachine.arm()
        val privacy =
            privacyMachine.evaluate(
                WakeObservation(
                    observedAtMs = 1_000,
                    confidence = 0.99,
                    featureFingerprint = "privacy",
                    privacyBlocked = true,
                ),
            )
        assertEquals(RejectionReason.PRIVACY_BLOCKED, (privacy as WakeEvaluation.Rejected).reason)
        assertEquals(WakeState.PRIVACY_BLOCKED, privacyMachine.state)

        val permissionMachine = WakeStateMachine()
        permissionMachine.arm()
        val permission =
            permissionMachine.evaluate(
                WakeObservation(
                    observedAtMs = 1_000,
                    confidence = 0.99,
                    featureFingerprint = "permission",
                    microphonePermissionGranted = false,
                ),
            )
        assertEquals(RejectionReason.PERMISSION_BLOCKED, (permission as WakeEvaluation.Rejected).reason)
        assertEquals(WakeState.PERMISSION_REQUIRED, permissionMachine.state)
    }

    @Test
    fun `aurora playback suppresses self wake`() {
        val machine = WakeStateMachine()
        machine.arm()
        val result =
            machine.evaluate(
                WakeObservation(
                    observedAtMs = 1_000,
                    confidence = 0.99,
                    featureFingerprint = "self",
                    ttsActive = true,
                    playbackCorrelation = 0.99,
                ),
            )
        assertEquals(RejectionReason.SELF_PLAYBACK, (result as WakeEvaluation.Rejected).reason)
        assertEquals(WakeState.HOTWORD_LISTENING, machine.state)
    }

    @Test
    fun `repeated candidate is bounded by debounce cooldown and duplicate windows`() {
        val machine =
            WakeStateMachine(
                WakeConfig(
                    debounceMs = 200,
                    cooldownMs = 500,
                    duplicateWindowMs = 1_000,
                ),
            )
        machine.arm()
        assertTrue(
            machine.evaluate(
                WakeObservation(1_000, 0.95, "same"),
            ) is WakeEvaluation.Confirmed,
        )
        machine.transition(WakeState.COOLDOWN)
        machine.rearm()

        val debounced = machine.evaluate(WakeObservation(1_100, 0.95, "different"))
        assertEquals(RejectionReason.DEBOUNCED, (debounced as WakeEvaluation.Rejected).reason)
        val cooldown = machine.evaluate(WakeObservation(1_300, 0.95, "different"))
        assertEquals(RejectionReason.COOLDOWN, (cooldown as WakeEvaluation.Rejected).reason)
        val duplicate = machine.evaluate(WakeObservation(1_700, 0.95, "same"))
        assertEquals(RejectionReason.DUPLICATE, (duplicate as WakeEvaluation.Rejected).reason)
    }
}
