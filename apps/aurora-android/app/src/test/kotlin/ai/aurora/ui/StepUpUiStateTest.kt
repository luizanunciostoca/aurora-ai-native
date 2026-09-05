package ai.aurora.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StepUpUiStateTest {
    @Test
    fun `successful local step-up cannot grant business authority or execution`() {
        val state = StepUpUiState(
            status = StepUpStatus.SUCCEEDED,
            detail = "local proof",
            method = "BIOMETRIC_OR_DEVICE_CREDENTIAL",
            successSequence = 1,
        )

        assertEquals(StepUpStatus.SUCCEEDED, state.status)
        assertTrue(state.successSequence > 0)
        assertFalse(state.provesBusinessAuthority)
        assertFalse(state.authorizesExecution)
    }

    @Test
    fun `failed step-up remains non authoritative`() {
        val state = StepUpUiState(
            status = StepUpStatus.FAILED,
            detail = "not confirmed",
        )

        assertFalse(state.provesBusinessAuthority)
        assertFalse(state.authorizesExecution)
    }
}
