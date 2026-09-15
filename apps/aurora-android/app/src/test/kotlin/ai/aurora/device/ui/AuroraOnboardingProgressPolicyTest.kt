package ai.aurora.device.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraOnboardingProgressPolicyTest {
    @Test
    fun setupStepsAdvanceWithoutClaimingCurrentStepComplete() {
        val microphone = AuroraOnboardingProgressPolicy.resolve(AuroraOnboardingStep.MICROPHONE)
        val assistant = AuroraOnboardingProgressPolicy.resolve(AuroraOnboardingStep.ASSISTANT_ROLE)
        val model = AuroraOnboardingProgressPolicy.resolve(AuroraOnboardingStep.WAKE_MODEL)
        val enable = AuroraOnboardingProgressPolicy.resolve(AuroraOnboardingStep.WAKE_ENABLE)

        assertEquals(0, microphone.completedSteps)
        assertEquals(0, microphone.activeStepIndex)
        assertEquals(1, assistant.completedSteps)
        assertEquals(1, assistant.activeStepIndex)
        assertEquals(2, model.completedSteps)
        assertEquals(2, model.activeStepIndex)
        assertEquals(3, enable.completedSteps)
        assertEquals(3, enable.activeStepIndex)
        assertEquals(4, enable.totalSteps)
    }

    @Test
    fun runtimeVerificationShowsSetupCompleteButDoesNotCreateExtraStep() {
        val progress = AuroraOnboardingProgressPolicy.resolve(AuroraOnboardingStep.WAKE_RUNTIME)

        assertEquals(4, progress.completedSteps)
        assertEquals(4, progress.totalSteps)
        assertNull(progress.activeStepIndex)
        assertTrue(progress.showTrack)
    }

    @Test
    fun readyKeepsAllSetupSegmentsComplete() {
        val progress = AuroraOnboardingProgressPolicy.resolve(AuroraOnboardingStep.READY)

        assertEquals(4, progress.completedSteps)
        assertNull(progress.activeStepIndex)
        assertTrue(progress.showTrack)
    }

    @Test
    fun privacyBlockedHidesProgressToAvoidInferringSetupState() {
        val progress = AuroraOnboardingProgressPolicy.resolve(AuroraOnboardingStep.PRIVACY_BLOCKED)

        assertEquals(0, progress.completedSteps)
        assertNull(progress.activeStepIndex)
        assertFalse(progress.showTrack)
    }
}
