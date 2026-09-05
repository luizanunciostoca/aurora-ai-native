package ai.aurora.ui

import ai.aurora.ui.model.AuroraPreviewCatalog
import ai.aurora.ui.model.ConnectivityUiState
import ai.aurora.ui.model.DeviceUiState
import ai.aurora.ui.model.PresentationMode
import ai.aurora.ui.model.RiskBand
import ai.aurora.ui.model.WorkspaceCompositionPolicy
import ai.aurora.ui.model.WorkspaceNavigator
import ai.aurora.ui.model.WorkspaceNeed
import ai.aurora.ui.model.WorkspaceViewType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraUiModelTest {
    @Test
    fun `high risk materializes safety presentation`() {
        val presentation = WorkspaceCompositionPolicy.choosePresentation(
            WorkspaceNeed(risk = RiskBand.HIGH, itemCount = 8),
        )
        assertEquals(PresentationMode.FOCUSED_WITH_SAFETY, presentation)
    }

    @Test
    fun `comparison grows into composite only when useful`() {
        assertEquals(
            PresentationMode.COMPOSITE,
            WorkspaceCompositionPolicy.choosePresentation(
                WorkspaceNeed(needsComparison = true, itemCount = 6),
            ),
        )
        assertEquals(
            PresentationMode.RICH_RESPONSE,
            WorkspaceCompositionPolicy.choosePresentation(
                WorkspaceNeed(needsComparison = true, itemCount = 3),
            ),
        )
    }

    @Test
    fun `conversation navigation maps common intents without authority`() {
        assertEquals(WorkspaceViewType.DEVICES, WorkspaceNavigator.classify("Abra o tablet e a sessão do device"))
        assertEquals(WorkspaceViewType.META_ADS, WorkspaceNavigator.classify("Compare Meta Ads agora"))
        assertEquals(WorkspaceViewType.CRM_REVENUE, WorkspaceNavigator.classify("Quem são os leads mais quentes?"))
        assertEquals(WorkspaceViewType.CAPABILITY_CATALOG, WorkspaceNavigator.classify("O que a Aurora consegue fazer?"))
    }

    @Test
    fun `every allowlisted view has a bounded manifest`() {
        val device = DeviceUiState(
            environment = "LOCAL",
            buildSha = "test-sha",
            uiProfile = "TABLET_UI_V1",
            visibility = "FOREGROUND",
            processGeneration = 2,
            localServicePhase = "RUNNING",
        )
        val connectivity = ConnectivityUiState(true, "Online")
        val manifests = WorkspaceViewType.entries.map { AuroraPreviewCatalog.manifestFor(it, device, connectivity) }

        assertEquals(WorkspaceViewType.entries.size, manifests.size)
        assertEquals(manifests.size, manifests.map { it.viewId }.distinct().size)
        manifests.forEach { manifest ->
            assertNotNull(manifest.viewType)
            assertTrue(manifest.schemaVersion.isNotBlank())
            assertTrue(manifest.components.isNotEmpty())
            assertTrue(manifest.title.isNotBlank())
        }
    }
}
