package ai.aurora.device.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraAssistantExperienceTest {
    @Test
    fun everyStageHasUserFacingCopy() {
        AuroraAssistantStage.entries.forEach { stage ->
            val presentation = AuroraAssistantExperience.presentation(stage)
            assertTrue(presentation.eyebrow.isNotBlank())
            assertTrue(presentation.title.isNotBlank())
            assertTrue(presentation.detail.isNotBlank())
        }
    }

    @Test
    fun readyStateInvitesWakeOrTapInteraction() {
        val presentation = AuroraAssistantExperience.presentation(AuroraAssistantStage.READY)
        assertEquals("Pronta para você", presentation.title)
        assertTrue(presentation.detail.contains("Aurora"))
        assertTrue(presentation.detail.contains("Falar"))
    }
}
