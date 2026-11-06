package ai.aurora.device.wake

import org.junit.Assert.assertEquals
import org.junit.Test

class MicrophonePermissionFlowTest {
    @Test
    fun `granted permission requires no action`() {
        assertEquals(
            MicrophonePermissionAction.NONE,
            MicrophonePermissionFlow.nextAction(
                granted = true,
                requestAttempted = false,
                shouldShowRationale = false,
            ),
        )
    }

    @Test
    fun `fresh install requests permission even when rationale is false`() {
        assertEquals(
            MicrophonePermissionAction.REQUEST,
            MicrophonePermissionFlow.nextAction(
                granted = false,
                requestAttempted = false,
                shouldShowRationale = false,
            ),
        )
    }

    @Test
    fun `ordinary denial can request again while rationale is available`() {
        assertEquals(
            MicrophonePermissionAction.REQUEST,
            MicrophonePermissionFlow.nextAction(
                granted = false,
                requestAttempted = true,
                shouldShowRationale = true,
            ),
        )
    }

    @Test
    fun `blocked permission opens settings only after a real request attempt`() {
        assertEquals(
            MicrophonePermissionAction.OPEN_SETTINGS,
            MicrophonePermissionFlow.nextAction(
                granted = false,
                requestAttempted = true,
                shouldShowRationale = false,
            ),
        )
    }
}
