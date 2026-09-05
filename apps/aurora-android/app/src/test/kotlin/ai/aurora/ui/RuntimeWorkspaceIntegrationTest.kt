package ai.aurora.ui

import ai.aurora.ui.model.AuroraPreviewCatalog
import ai.aurora.ui.model.AuroraUiComponent
import ai.aurora.ui.model.ConnectivityUiState
import ai.aurora.ui.model.DeviceUiState
import ai.aurora.ui.model.ProjectionFreshness
import ai.aurora.ui.model.ProjectionProvenance
import ai.aurora.ui.model.RuntimeIntegrationUiState
import ai.aurora.ui.model.WorkspaceViewType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RuntimeWorkspaceIntegrationTest {
    private val runtime =
        RuntimeIntegrationUiState(
            governedVoiceStatus = "READY",
            w04RegistryVersion = "w04.live",
            w15gVocabularyVersion = "w15g.live",
            currentDeviceCapabilities = 2,
            deterministicVoiceCommands = 3,
            w07VoiceIngressStatus = "NOT_COMPOSED_FAIL_CLOSED",
            offlineQueueStatus = "READ_ONLY",
            offlineQueueTotal = 5,
            offlineQueueDeferred = 2,
            offlineQueueReconciliationRequired = 1,
        )

    private val device =
        DeviceUiState(
            environment = "LOCAL",
            buildSha = "sha",
            uiProfile = "RUNTIME_UI_INTEGRATION_V1",
            visibility = "FOREGROUND",
            processGeneration = 4,
            localServicePhase = "RUNNING",
            registrationStatus = "LOCAL_ONLY",
            runtimeIntegration = runtime,
        )

    @Test
    fun systemHealthIsConnectedWhenAvailableAndKeepsFutureW17MetricsExplicit() {
        val manifest =
            AuroraPreviewCatalog.manifestFor(
                WorkspaceViewType.SYSTEM_HEALTH,
                device,
                ConnectivityUiState(true, "Online"),
            )

        assertEquals(ProjectionProvenance.CONNECTED_WHEN_AVAILABLE, manifest.provenance)
        assertEquals(ProjectionFreshness.CURRENT, manifest.freshness)
        assertTrue(manifest.components.any { it is AuroraUiComponent.Metric && it.value == "—" })
        assertTrue(manifest.components.any {
            it is AuroraUiComponent.Status &&
                it.label == "Voice routing" &&
                it.detail.contains("NOT_COMPOSED_FAIL_CLOSED")
        })
    }

    @Test
    fun devicesSurfaceShowsReadOnlyQueueAndNoExecutionAuthority() {
        val manifest =
            AuroraPreviewCatalog.manifestFor(
                WorkspaceViewType.DEVICES,
                device,
                ConnectivityUiState(true, "Online"),
            )

        assertEquals(ProjectionProvenance.CONNECTED_WHEN_AVAILABLE, manifest.provenance)
        assertFalse(device.runtimeIntegration.authorizesExecution)
        assertTrue(manifest.components.any {
            it is AuroraUiComponent.ListBlock &&
                it.title.contains("Offline queue") &&
                it.items.any { item -> item.contains("Reconciliation required 1") }
        })
    }

    @Test
    fun deviceControlKeepsW07UncomposedStateVisibleAndNonExecutable() {
        val manifest =
            AuroraPreviewCatalog.manifestFor(
                WorkspaceViewType.DEVICE_CONTROL,
                device,
                ConnectivityUiState(true, "Online"),
            )

        val ingress = manifest.components.filterIsInstance<AuroraUiComponent.Status>()
            .first { it.label == "W07 voice ingress" }
        assertEquals("NOT_COMPOSED_FAIL_CLOSED", ingress.value)
        assertFalse(device.runtimeIntegration.authorizesExecution)
    }
}
