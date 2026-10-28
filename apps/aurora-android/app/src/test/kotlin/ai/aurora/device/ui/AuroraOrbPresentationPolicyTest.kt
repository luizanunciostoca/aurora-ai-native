package ai.aurora.device.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraOrbPresentationPolicyTest {
    private fun animate(
        stage: AuroraAssistantStage = AuroraAssistantStage.LISTENING,
        attached: Boolean = true,
        visible: Boolean = true,
        focused: Boolean = true,
        animations: Boolean = true,
        exploration: Boolean = false,
        powerSave: Boolean = false,
    ): Boolean =
        AuroraOrbPresentationPolicy.shouldAnimate(
            stage, attached, visible, focused, animations, exploration, powerSave,
        )

    @Test
    fun restingAndTerminalStatesDoNotScheduleAnInfinitePulse() {
        listOf(
            AuroraAssistantStage.READY,
            AuroraAssistantStage.COMPLETED,
            AuroraAssistantStage.BLOCKED,
            AuroraAssistantStage.DEGRADED,
        ).forEach { assertFalse(it.name, animate(stage = it)) }
    }

    @Test
    fun activeStagesCanAnimateWhenTheWindowAndUserSettingsAllowIt() {
        listOf(
            AuroraAssistantStage.LISTENING,
            AuroraAssistantStage.UNDERSTANDING,
            AuroraAssistantStage.ACTING,
            AuroraAssistantStage.SPEAKING,
        ).forEach { assertTrue(it.name, animate(stage = it)) }
    }

    @Test
    fun accessibilityAndPowerConstraintsApplyToEveryStage() {
        AuroraAssistantStage.entries.forEach { stage ->
            assertFalse(stage.name, animate(stage = stage, animations = false))
            assertFalse(stage.name, animate(stage = stage, exploration = true))
            assertFalse(stage.name, animate(stage = stage, powerSave = true))
        }
    }

    @Test
    fun hiddenDetachedAndUnfocusedWindowsCannotAnimate() {
        AuroraAssistantStage.entries.forEach { stage ->
            assertFalse(stage.name, animate(stage = stage, attached = false))
            assertFalse(stage.name, animate(stage = stage, visible = false))
            assertFalse(stage.name, animate(stage = stage, focused = false))
        }
    }

    @Test
    fun returningToForegroundDoesNotOverrideReducedMotion() {
        assertFalse(animate(visible = false, animations = false))
        assertFalse(animate(visible = true, animations = false))
        assertTrue(animate(visible = true, animations = true))
        assertFalse(animate(stage = AuroraAssistantStage.COMPLETED))
    }

    @Test
    fun largerTextAndShortWindowsReserveMoreSpaceForThePrimaryAction() {
        val tablet = AuroraOrbPresentationPolicy.preferredSizeDp(800, 1280, 1f)
        val shortWindow = AuroraOrbPresentationPolicy.preferredSizeDp(800, 500, 1f)
        val largeText = AuroraOrbPresentationPolicy.preferredSizeDp(800, 1280, 2f)
        assertTrue(shortWindow < tablet)
        assertTrue(largeText < shortWindow)
        assertEquals(240, tablet)
    }

    @Test
    fun orbFitsNarrowSplitScreenAfterHorizontalPadding() {
        listOf(120, 200, 280, 320, 800, 1280).forEach { width ->
            listOf(400, 800, 1280).forEach { height ->
                listOf(1f, 1.3f, 2f).forEach { scale ->
                    val size = AuroraOrbPresentationPolicy.preferredSizeDp(width, height, scale)
                    assertTrue(size > 0)
                    assertTrue(size <= width - 48)
                    assertTrue(size <= 240)
                }
            }
        }
    }

    @Test
    fun unknownConfigurationDimensionsDoNotProduceNegativeLayoutSizes() {
        assertEquals(1, AuroraOrbPresentationPolicy.preferredSizeDp(0, 0, 1f))
    }
}
