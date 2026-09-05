package ai.aurora.device.wake

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WakeStateMachineTest {
    private fun listeningMachine(config: WakeConfig = WakeConfig()): WakeStateMachine =
        WakeStateMachine(config).also { it.arm() }

    private fun observation(
        at: Long,
        confidence: Double = 0.95,
        fingerprint: String = "fp-a",
        ttsActive: Boolean = false,
        playbackCorrelation: Double? = null,
        permission: Boolean = true,
        privacy: Boolean = false,
    ) = WakeObservation(
        observedAtMs = at,
        confidence = confidence,
        featureFingerprint = fingerprint,
        ttsActive = ttsActive,
        playbackCorrelation = playbackCorrelation,
        microphonePermissionGranted = permission,
        privacyBlocked = privacy,
    )

    @Test
    fun `confirmed wake never mints authority outcome or retry`() {
        val machine = listeningMachine()
        val result = machine.evaluate(observation(at = 10_000))
        assertTrue(result is WakeEvaluation.Confirmed)
        val candidate = (result as WakeEvaluation.Confirmed).candidate
        assertFalse(candidate.authorizesExecution)
        assertFalse(candidate.provesExecutionSuccess)
        assertFalse(candidate.retryAuthorized)
        assertEquals(WakeState.HOTWORD_CONFIRMED, machine.state)
    }

    @Test
    fun `below threshold remains listening`() {
        val machine = listeningMachine()
        assertEquals(
            WakeEvaluation.Rejected(RejectionReason.BELOW_THRESHOLD),
            machine.evaluate(observation(at = 1_000, confidence = 0.4)),
        )
        assertEquals(WakeState.HOTWORD_LISTENING, machine.state)
    }

    @Test
    fun `privacy fails closed and stops listening`() {
        val machine = listeningMachine()
        assertEquals(
            WakeEvaluation.Rejected(RejectionReason.PRIVACY_BLOCKED),
            machine.evaluate(observation(at = 1_000, privacy = true)),
        )
        assertEquals(WakeState.PRIVACY_BLOCKED, machine.state)
    }

    @Test
    fun `permission revocation fails closed`() {
        val machine = listeningMachine()
        assertEquals(
            WakeEvaluation.Rejected(RejectionReason.PERMISSION_BLOCKED),
            machine.evaluate(observation(at = 1_000, permission = false)),
        )
        assertEquals(WakeState.PERMISSION_REQUIRED, machine.state)
    }

    @Test
    fun `aurora TTS playback cannot self trigger`() {
        val machine = listeningMachine()
        assertEquals(
            WakeEvaluation.Rejected(RejectionReason.SELF_PLAYBACK),
            machine.evaluate(
                observation(
                    at = 1_000,
                    ttsActive = true,
                    playbackCorrelation = 0.97,
                ),
            ),
        )
        assertEquals(WakeState.HOTWORD_LISTENING, machine.state)
    }

    @Test
    fun `low playback correlation may represent real user barge in`() {
        val machine = listeningMachine()
        val result = machine.evaluate(
            observation(
                at = 1_000,
                ttsActive = true,
                playbackCorrelation = 0.20,
            ),
        )
        assertTrue(result is WakeEvaluation.Confirmed)
    }

    @Test
    fun `rapid repeated wake is blocked by debounce then cooldown then duplicate`() {
        val machine = listeningMachine(
            WakeConfig(debounceMs = 500, cooldownMs = 1_500, duplicateWindowMs = 2_500),
        )
        assertTrue(machine.evaluate(observation(at = 10_000)) is WakeEvaluation.Confirmed)
        machine.transition(WakeState.COOLDOWN)
        machine.rearm()

        assertEquals(
            WakeEvaluation.Rejected(RejectionReason.DEBOUNCED),
            machine.evaluate(observation(at = 10_300)),
        )
        assertEquals(
            WakeEvaluation.Rejected(RejectionReason.COOLDOWN),
            machine.evaluate(observation(at = 10_900)),
        )
        assertEquals(
            WakeEvaluation.Rejected(RejectionReason.DUPLICATE),
            machine.evaluate(observation(at = 11_800)),
        )
        assertTrue(machine.evaluate(observation(at = 12_600)) is WakeEvaluation.Confirmed)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `invalid state transition is rejected`() {
        WakeStateMachine().transition(WakeState.RESPONDING)
    }
}
