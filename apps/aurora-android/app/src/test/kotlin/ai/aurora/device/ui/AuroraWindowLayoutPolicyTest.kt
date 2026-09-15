package ai.aurora.device.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraWindowLayoutPolicyTest {
    @Test
    fun tabletUsesComfortablePaddingConstrainedContentAndInlineStatus() {
        val layout =
            AuroraWindowLayoutPolicy.resolve(
                widthDp = 1_200,
                heightDp = 800,
                fontScale = 1f,
                maxContentWidthDp = 760,
            )

        assertEquals(24, layout.horizontalPaddingDp)
        assertEquals(20, layout.verticalPaddingDp)
        assertTrue(layout.constrainContentWidth)
        assertFalse(layout.stackStatusItems)
    }

    @Test
    fun splitScreenPreservesMoreHorizontalRoomAndStacksStatus() {
        val layout =
            AuroraWindowLayoutPolicy.resolve(
                widthDp = 420,
                heightDp = 800,
                fontScale = 1f,
                maxContentWidthDp = 760,
            )

        assertEquals(16, layout.horizontalPaddingDp)
        assertFalse(layout.constrainContentWidth)
        assertTrue(layout.stackStatusItems)
    }

    @Test
    fun veryNarrowWindowUsesMinimumSafePadding() {
        val layout =
            AuroraWindowLayoutPolicy.resolve(
                widthDp = 320,
                heightDp = 700,
                fontScale = 1f,
                maxContentWidthDp = 720,
            )

        assertEquals(12, layout.horizontalPaddingDp)
        assertFalse(layout.constrainContentWidth)
        assertTrue(layout.stackStatusItems)
    }

    @Test
    fun largeTextReducesDecorativePaddingWithoutReducingTextScale() {
        val layout =
            AuroraWindowLayoutPolicy.resolve(
                widthDp = 800,
                heightDp = 1_200,
                fontScale = 2f,
                maxContentWidthDp = 760,
            )

        assertEquals(16, layout.horizontalPaddingDp)
        assertEquals(12, layout.verticalPaddingDp)
        assertTrue(layout.constrainContentWidth)
        assertTrue(layout.stackStatusItems)
    }

    @Test
    fun accessibilityTextScaleStacksStatusBeforeLargeTextThreshold() {
        val layout =
            AuroraWindowLayoutPolicy.resolve(
                widthDp = 900,
                heightDp = 1_200,
                fontScale = 1.3f,
                maxContentWidthDp = 760,
            )

        assertEquals(24, layout.horizontalPaddingDp)
        assertEquals(20, layout.verticalPaddingDp)
        assertTrue(layout.constrainContentWidth)
        assertTrue(layout.stackStatusItems)
    }

    @Test
    fun shortLandscapeWindowReducesVerticalPadding() {
        val layout =
            AuroraWindowLayoutPolicy.resolve(
                widthDp = 1_000,
                heightDp = 520,
                fontScale = 1f,
                maxContentWidthDp = 760,
            )

        assertEquals(24, layout.horizontalPaddingDp)
        assertEquals(12, layout.verticalPaddingDp)
        assertTrue(layout.constrainContentWidth)
        assertFalse(layout.stackStatusItems)
    }
}
