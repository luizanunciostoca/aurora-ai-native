package ai.aurora.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Test

class DeviceKeyUiStateTest {
    @Test
    fun `ready local key never authorizes execution or remote trust`() {
        val state = DeviceKeyUiState(
            status = DeviceKeyUiStatus.READY,
            algorithm = "EC",
            fingerprintSha256 = "sha256:test",
            detail = "ready",
        )

        assertEquals(DeviceKeyUiStatus.READY, state.status)
        assertFalse(state.authorizesExecution)
        assertFalse(state.establishesRemoteTrust)
    }
}
