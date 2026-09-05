package ai.aurora.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceKeyUiStateTest {
    @Test
    fun `ready hardware backed local key never authorizes execution or remote trust`() {
        val state = DeviceKeyUiState(
            status = DeviceKeyUiStatus.READY,
            algorithm = "EC",
            fingerprintSha256 = "sha256:test",
            securityLevel = "STRONGBOX",
            secureHardwareBacked = true,
            detail = "ready",
        )

        assertEquals(DeviceKeyUiStatus.READY, state.status)
        assertTrue(state.secureHardwareBacked == true)
        assertFalse(state.authorizesExecution)
        assertFalse(state.establishesRemoteTrust)
    }
}
