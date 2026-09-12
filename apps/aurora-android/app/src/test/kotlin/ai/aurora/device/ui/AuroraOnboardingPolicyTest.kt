package ai.aurora.device.ui

import org.junit.Assert.assertEquals
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
                ),
            ),
        )
    }

    @Test
    fun `microphone is first consent step`() {
        assertEquals(
            AuroraOnboardingStep.MICROPHONE,
            AuroraOnboardingPolicy.nextStep(
                AuroraOnboardingInput(false, false, false, false, false),
            ),
        )
    }

    @Test
    fun `assistant role follows microphone consent`() {
        assertEquals(
            AuroraOnboardingStep.ASSISTANT_ROLE,
            AuroraOnboardingPolicy.nextStep(
                AuroraOnboardingInput(true, false, false, false, false),
            ),
        )
    }

    @Test
    fun `wake training follows assistant selection`() {
        assertEquals(
            AuroraOnboardingStep.WAKE_MODEL,
            AuroraOnboardingPolicy.nextStep(
                AuroraOnboardingInput(true, true, false, false, false),
            ),
        )
    }

    @Test
    fun `wake enable follows local model enrollment`() {
        assertEquals(
            AuroraOnboardingStep.WAKE_ENABLE,
            AuroraOnboardingPolicy.nextStep(
                AuroraOnboardingInput(true, true, true, false, false),
            ),
        )
    }

    @Test
    fun `fully configured device is ready`() {
        val presentation =
            AuroraOnboardingPolicy.present(
                AuroraOnboardingInput(true, true, true, true, false),
            )
        assertEquals(AuroraOnboardingStep.READY, presentation.step)
        assertEquals("Falar com Aurora", presentation.primaryActionLabel)
    }
}
