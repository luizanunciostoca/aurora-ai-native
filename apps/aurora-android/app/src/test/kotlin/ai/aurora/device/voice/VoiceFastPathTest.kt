package ai.aurora.device.voice

import ai.aurora.device.lifecycle.AppVisibility
import ai.aurora.device.permission.RuntimePermissionObservation
import ai.aurora.device.permission.RuntimePermissionRequirement
import ai.aurora.device.permission.RuntimePermissionState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceFastPathTest {
    @Test
    fun falseWakeNeverProducesDispatchCandidate() {
        val path = path()

        val decision =
            path.evaluate(
                VoiceUtterance(false, "open camera", 0.99),
                context(),
            )

        assertTrue(decision is VoiceFastPathDecision.IgnoredFalseWake)
    }

    @Test
    fun exactLowRiskCommandProducesNonAuthoritativeCandidateOnly() {
        val path = path()

        val decision =
            path.evaluate(
                VoiceUtterance(true, "  OPEN   CAMERA ", 0.99),
                context(),
            ) as VoiceFastPathDecision.Candidate

        assertEquals("open-camera", decision.dispatch.commandId)
        assertEquals("camera.open", decision.dispatch.capabilityId)
        assertEquals("open camera", decision.dispatch.normalizedTranscript)
        assertTrue(decision.dispatch.requiresW07Authorization)
        assertFalse(decision.dispatch.authorizesExecution)
    }

    @Test
    fun lowConfidenceTranscriptEscalatesInsteadOfGuessing() {
        val decision =
            path().evaluate(
                VoiceUtterance(true, "open camera", 0.50),
                context(),
            ) as VoiceFastPathDecision.Escalated

        assertEquals(VoiceEscalationReason.LOW_TRANSCRIPT_CONFIDENCE, decision.reason)
    }

    @Test
    fun unknownTranscriptEscalatesInsteadOfExecuting() {
        val decision =
            path().evaluate(
                VoiceUtterance(true, "send all files", 0.99),
                context(),
            ) as VoiceFastPathDecision.Escalated

        assertEquals(VoiceEscalationReason.UNKNOWN_COMMAND, decision.reason)
    }

    @Test
    fun duplicatePhraseAcrossCatalogIsTreatedAsAmbiguousAtRuntime() {
        val path =
            VoiceFastPath(
                commands =
                    listOf(
                        command("one", "same phrase", "cap.one", VoiceCommandRisk.LOW),
                        command("two", "same phrase", "cap.two", VoiceCommandRisk.LOW),
                    ),
                nowMs = { 1_000L },
            )
        val decision =
            path.evaluate(
                VoiceUtterance(true, "same phrase", 0.99),
                context(available = setOf("cap.one", "cap.two")),
            ) as VoiceFastPathDecision.Escalated

        assertEquals(VoiceEscalationReason.AMBIGUOUS_COMMAND, decision.reason)
    }

    @Test
    fun highRiskCommandAlwaysEscalatesEvenWithPerfectSpeechConfidence() {
        val decision =
            path().evaluate(
                VoiceUtterance(true, "factory reset", 1.0),
                context(available = setOf("camera.open", "device.factory_reset")),
            ) as VoiceFastPathDecision.Escalated

        assertEquals(VoiceEscalationReason.HIGH_RISK_COMMAND, decision.reason)
    }

    @Test
    fun missingCapabilityEscalatesInsteadOfCreatingExecutionPermission() {
        val decision =
            path().evaluate(
                VoiceUtterance(true, "open camera", 0.99),
                context(available = emptySet()),
            ) as VoiceFastPathDecision.Escalated

        assertEquals(VoiceEscalationReason.CAPABILITY_NOT_AVAILABLE, decision.reason)
    }

    @Test
    fun deniedMicrophonePermissionBlocksFastPath() {
        val permission =
            microphonePermission().copy(
                state = RuntimePermissionState.DENIED,
            )
        val decision =
            path().evaluate(
                VoiceUtterance(true, "open camera", 0.99),
                context(permission = permission),
            ) as VoiceFastPathDecision.Blocked

        assertEquals(VoiceBlockReason.MICROPHONE_PERMISSION_NOT_CURRENT, decision.reason)
    }

    @Test
    fun staleMicrophoneObservationBlocksFastPath() {
        val permission = microphonePermission().copy(expiresAtMs = 1_000L)
        val decision =
            path().evaluate(
                VoiceUtterance(true, "open camera", 0.99),
                context(permission = permission),
            ) as VoiceFastPathDecision.Blocked

        assertEquals(VoiceBlockReason.MICROPHONE_PERMISSION_NOT_CURRENT, decision.reason)
    }

    @Test
    fun backgroundLifecycleBlocksDeterministicFastPath() {
        val decision =
            path().evaluate(
                VoiceUtterance(true, "open camera", 0.99),
                context(visibility = AppVisibility.BACKGROUND),
            ) as VoiceFastPathDecision.Blocked

        assertEquals(VoiceBlockReason.LIFECYCLE_NOT_FOREGROUND, decision.reason)
    }

    @Test
    fun privacyModeBlocksBeforeTranscriptInterpretation() {
        val decision =
            path().evaluate(
                VoiceUtterance(true, "open camera", 0.99),
                context(privacyMode = true),
            ) as VoiceFastPathDecision.Blocked

        assertEquals(VoiceBlockReason.PRIVACY_MODE_ENABLED, decision.reason)
    }

    private fun path(): VoiceFastPath =
        VoiceFastPath(
            commands =
                listOf(
                    command("open-camera", "open camera", "camera.open", VoiceCommandRisk.LOW),
                    command(
                        "factory-reset",
                        "factory reset",
                        "device.factory_reset",
                        VoiceCommandRisk.HIGH,
                    ),
                ),
            nowMs = { 1_000L },
        )

    private fun command(
        commandId: String,
        phrase: String,
        capabilityId: String,
        risk: VoiceCommandRisk,
    ): VoiceCommandDefinition =
        VoiceCommandDefinition(
            commandId = commandId,
            phrases = setOf(phrase),
            capabilityId = capabilityId,
            risk = risk,
        )

    private fun context(
        visibility: AppVisibility = AppVisibility.FOREGROUND,
        permission: RuntimePermissionObservation = microphonePermission(),
        available: Set<String> = setOf("camera.open"),
        privacyMode: Boolean = false,
    ): VoiceFastPathContext =
        VoiceFastPathContext(
            appVisibility = visibility,
            microphonePermission = permission,
            availableCapabilityIds = available,
            privacyModeEnabled = privacyMode,
        )

    private fun microphonePermission(): RuntimePermissionObservation =
        RuntimePermissionObservation(
            requirement = RuntimePermissionRequirement("android.permission.RECORD_AUDIO"),
            state = RuntimePermissionState.GRANTED,
            observedAtMs = 950,
            expiresAtMs = 2_000,
            shouldShowRationale = false,
        )
}
