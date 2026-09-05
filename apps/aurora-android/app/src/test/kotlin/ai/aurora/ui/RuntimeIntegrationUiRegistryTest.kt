package ai.aurora.ui

import ai.aurora.ui.model.RuntimeIntegrationUiRegistry
import ai.aurora.ui.model.RuntimeIntegrationUiState
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class RuntimeIntegrationUiRegistryTest {
    @After
    fun cleanup() {
        RuntimeIntegrationUiRegistry.clear()
    }

    @Test
    fun missingProviderReturnsFailClosedDefault() {
        RuntimeIntegrationUiRegistry.clear()

        val snapshot = RuntimeIntegrationUiRegistry.snapshot()

        assertEquals("FAIL_CLOSED", snapshot.governedVoiceStatus)
        assertEquals("NOT_COMPOSED", snapshot.w07VoiceIngressStatus)
        assertEquals(0, snapshot.offlineQueueTotal)
        assertFalse(snapshot.authorizesExecution)
    }

    @Test
    fun providerExceptionReturnsFailClosedDefault() {
        RuntimeIntegrationUiRegistry.install { error("read model unavailable") }

        val snapshot = RuntimeIntegrationUiRegistry.snapshot()

        assertEquals("FAIL_CLOSED", snapshot.governedVoiceStatus)
        assertFalse(snapshot.authorizesExecution)
    }

    @Test
    fun installedReadOnlySnapshotIsExposedWithoutAuthority() {
        RuntimeIntegrationUiRegistry.install {
            RuntimeIntegrationUiState(
                governedVoiceStatus = "READY",
                w04RegistryVersion = "w04.v1",
                w15gVocabularyVersion = "w15g.v1",
                currentDeviceCapabilities = 2,
                deterministicVoiceCommands = 3,
                w07VoiceIngressStatus = "NOT_COMPOSED_FAIL_CLOSED",
                offlineQueueStatus = "READ_ONLY",
                offlineQueueTotal = 4,
                offlineQueueDeferred = 2,
                offlineQueueReconciliationRequired = 1,
            )
        }

        val snapshot = RuntimeIntegrationUiRegistry.snapshot()

        assertEquals("READY", snapshot.governedVoiceStatus)
        assertEquals(2, snapshot.currentDeviceCapabilities)
        assertEquals(4, snapshot.offlineQueueTotal)
        assertFalse(snapshot.authorizesExecution)
    }
}
