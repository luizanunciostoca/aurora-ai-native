package ai.aurora.device.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraOnboardingPolicyTest {
    @Test
    fun `privacy blocks setup and voice before any other step`() {
        assertEquals(
            AuroraOnboardingStep.PRIVACY_BLOCKED,
            AuroraOnboardingPolicy.nextStep(
                AuroraOnboardingInput(
                    microphoneGranted = false,
                    assistantSelected = false,
                    wakeModelReady = false,
                    wakeEnabled = false,
                    privacyModeEnabled = true,
                    wakeRuntimeReady = false,
                ),
            ),
        )
    }

    @Test
    fun `microphone is first consent step`() {
        assertEquals(
            AuroraOnboardingStep.MICROPHONE,
            AuroraOnboardingPolicy.nextStep(
                AuroraOnboardingInput(false, false, false, false, false, false),
            ),
        )
    }

    @Test
    fun `assistant role follows microphone consent`() {
        assertEquals(
            AuroraOnboardingStep.ASSISTANT_ROLE,
            AuroraOnboardingPolicy.nextStep(
                AuroraOnboardingInput(true, false, false, false, false, false),
            ),
        )
    }

    @Test
    fun `wake training follows assistant selection`() {
        assertEquals(
            AuroraOnboardingStep.WAKE_MODEL,
            AuroraOnboardingPolicy.nextStep(
                AuroraOnboardingInput(true, true, false, false, false, false),
            ),
        )
    }

    @Test
    fun `wake enable follows local model enrollment`() {
        assertEquals(
            AuroraOnboardingStep.WAKE_ENABLE,
            AuroraOnboardingPolicy.nextStep(
                AuroraOnboardingInput(true, true, true, false, false, false),
            ),
        )
    }

    @Test
    fun `enabled preference is not READY until wake runtime confirms listening`() {
        val presentation =
            AuroraOnboardingPolicy.present(
                AuroraOnboardingInput(true, true, true, true, false, false),
            )
        assertEquals(AuroraOnboardingStep.WAKE_RUNTIME, presentation.step)
        assertEquals("Verificar wake word", presentation.primaryActionLabel)
    }

    @Test
    fun `fully configured and armed device is ready`() {
        val presentation =
            AuroraOnboardingPolicy.present(
                AuroraOnboardingInput(true, true, true, true, false, true),
            )
        assertEquals(AuroraOnboardingStep.READY, presentation.step)
        assertEquals("Falar com Aurora", presentation.primaryActionLabel)
    }

    @Test
    fun `only armed or listening runtime states satisfy wake readiness`() {
        assertTrue(AuroraOnboardingPolicy.isWakeRuntimeReady("ARMED"))
        assertTrue(AuroraOnboardingPolicy.isWakeRuntimeReady("HOTWORD_LISTENING"))
        assertFalse(AuroraOnboardingPolicy.isWakeRuntimeReady("INITIALIZING"))
        assertFalse(AuroraOnboardingPolicy.isWakeRuntimeReady("WAKE_PLATFORM_BLOCKED"))
        assertFalse(AuroraOnboardingPolicy.isWakeRuntimeReady("DISABLED"))
    }
}
