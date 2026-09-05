package ai.aurora.ui

import ai.aurora.ui.model.UiSurface
import ai.aurora.ui.model.WorkspaceViewType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UiCheckpointPolicyTest {
    @Test
    fun `human control is never restored across process restart`() {
        val checkpoint = UiCheckpointPolicy.sanitize(
            surface = UiSurface.HUMAN_CONTROL,
            workspaceOpen = true,
            selectedView = WorkspaceViewType.META_ADS,
        )

        assertEquals(UiSurface.PRESENCE, checkpoint.surface)
        assertFalse(checkpoint.workspaceOpen)
        assertEquals(WorkspaceViewType.EXECUTIVE_OVERVIEW, checkpoint.selectedView)
    }

    @Test
    fun `evidence is never restored across process restart`() {
        val checkpoint = UiCheckpointPolicy.sanitize(
            surface = UiSurface.EVIDENCE,
            workspaceOpen = false,
            selectedView = WorkspaceViewType.SYSTEM_HEALTH,
        )

        assertEquals(UiSurface.PRESENCE, checkpoint.surface)
        assertFalse(checkpoint.workspaceOpen)
    }

    @Test
    fun `workspace restores only presentation identity`() {
        val checkpoint = UiCheckpointPolicy.sanitize(
            surface = UiSurface.WORKSPACE,
            workspaceOpen = true,
            selectedView = WorkspaceViewType.DEVICES,
        )

        assertEquals(UiSurface.WORKSPACE, checkpoint.surface)
        assertTrue(checkpoint.workspaceOpen)
        assertEquals(WorkspaceViewType.DEVICES, checkpoint.selectedView)
    }

    @Test
    fun `safe support surfaces restore without opening workspace`() {
        val checkpoint = UiCheckpointPolicy.sanitize(
            surface = UiSurface.SETTINGS,
            workspaceOpen = true,
            selectedView = WorkspaceViewType.CRM_REVENUE,
        )

        assertEquals(UiSurface.SETTINGS, checkpoint.surface)
        assertFalse(checkpoint.workspaceOpen)
        assertEquals(WorkspaceViewType.CRM_REVENUE, checkpoint.selectedView)
    }
}
