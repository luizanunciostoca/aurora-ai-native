package ai.aurora.device.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class AuroraSystemStatusPolicyTest {
    private fun progress(
        completed: Int = 2,
        total: Int = 4,
        show: Boolean = true,
    ) =
        AuroraOnboardingProgress(
            completedSteps = completed,
            totalSteps = total,
            activeStepIndex = if (completed < total) completed else null,
            showTrack = show,
        )

    @Test
    fun readyFactsUsePositiveTonesWithoutChangingLabels() {
        val items =
            AuroraSystemStatusPolicy.items(
                AuroraSystemStatusInput(
                    setupProgress = progress(completed = 4),
                    microphoneGranted = true,
                    assistantSelected = true,
                    wakeOperational = true,
                    privacyEnabled = false,
                ),
            )

        assertEquals("Concluída", items.first().value)
        assertEquals(AuroraSystemStatusTone.POSITIVE, items.first().tone)
        assertEquals(AuroraSystemStatusTone.POSITIVE, items[1].tone)
        assertEquals(AuroraSystemStatusTone.POSITIVE, items[2].tone)
        assertEquals(AuroraSystemStatusTone.POSITIVE, items[3].tone)
        assertEquals(AuroraSystemStatusTone.NEUTRAL, items[4].tone)
    }

    @Test
    fun pendingFactsRemainTextuallyExplicitAndUseAttentionTone() {
        val items =
            AuroraSystemStatusPolicy.items(
                AuroraSystemStatusInput(
                    setupProgress = progress(),
                    microphoneGranted = false,
                    assistantSelected = false,
                    wakeOperational = false,
                    privacyEnabled = false,
                ),
            )

        assertEquals("Pendente", items[1].value)
        assertEquals(AuroraSystemStatusTone.ATTENTION, items[1].tone)
        assertEquals("Pendente", items[2].value)
        assertEquals(AuroraSystemStatusTone.ATTENTION, items[2].tone)
        assertEquals("Inativo", items[3].value)
        assertEquals(AuroraSystemStatusTone.ATTENTION, items[3].tone)
    }

    @Test
    fun privacyUsesDedicatedToneInsteadOfTreatingUserChoiceAsFailure() {
        val items =
            AuroraSystemStatusPolicy.items(
                AuroraSystemStatusInput(
                    setupProgress = progress(show = false),
                    microphoneGranted = true,
                    assistantSelected = true,
                    wakeOperational = false,
                    privacyEnabled = true,
                ),
            )

        assertFalse(items.any { it.label == "Configuração" })
        assertEquals("Inativo", items[2].value)
        assertEquals(AuroraSystemStatusTone.PRIVACY, items[2].tone)
        assertEquals("Ativa", items[3].value)
        assertEquals(AuroraSystemStatusTone.PRIVACY, items[3].tone)
    }
}
