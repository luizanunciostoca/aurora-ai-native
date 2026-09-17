package ai.aurora.device.wake

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraAssistantRoleSnapshotTest {
    @Test
    fun roleAvailableRequiresRoleHeldForWakeEvenIfVoiceServiceStillLooksActive() {
        val snapshot = AuroraAssistantRoleSnapshot(
            roleAvailable = true,
            roleHeld = false,
            activeVoiceInteractionService = true,
        )
        assertTrue(snapshot.selected)
        assertFalse(snapshot.wakeEligible)
    }

    @Test
    fun heldAssistantRoleIsWakeEligible() {
        val snapshot = AuroraAssistantRoleSnapshot(
            roleAvailable = true,
            roleHeld = true,
            activeVoiceInteractionService = false,
        )
        assertTrue(snapshot.wakeEligible)
    }
