package ai.aurora.ui

import android.content.Context
import ai.aurora.ui.model.AuroraUiState
import ai.aurora.ui.model.UiSurface
import ai.aurora.ui.model.WorkspaceViewType

data class UiNavigationCheckpoint(
    val surface: UiSurface,
    val workspaceOpen: Boolean,
    val selectedView: WorkspaceViewType,
)

object UiCheckpointPolicy {
    private val restorableSurfaces = setOf(
        UiSurface.PRESENCE,
        UiSurface.CONVERSATION,
        UiSurface.WORKSPACE,
        UiSurface.SETTINGS,
    )

    fun sanitize(
        surface: UiSurface,
        workspaceOpen: Boolean,
        selectedView: WorkspaceViewType,
    ): UiNavigationCheckpoint =
        if (surface !in restorableSurfaces) {
            UiNavigationCheckpoint(
                surface = UiSurface.PRESENCE,
                workspaceOpen = false,
                selectedView = WorkspaceViewType.EXECUTIVE_OVERVIEW,
            )
        } else if (surface == UiSurface.WORKSPACE && workspaceOpen) {
            UiNavigationCheckpoint(
                surface = UiSurface.WORKSPACE,
                workspaceOpen = true,
                selectedView = selectedView,
            )
        } else {
            UiNavigationCheckpoint(
                surface = surface,
                workspaceOpen = false,
                selectedView = selectedView,
            )
        }
}

class UiNavigationCheckpointStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    fun save(state: AuroraUiState) {
        if (!state.onboardingComplete) return
        val checkpoint = UiCheckpointPolicy.sanitize(
            surface = state.surface,
            workspaceOpen = state.workspaceOpen,
            selectedView = state.selectedView,
        )
        preferences.edit()
            .putString(KEY_SURFACE, checkpoint.surface.name)
            .putBoolean(KEY_WORKSPACE_OPEN, checkpoint.workspaceOpen)
            .putString(KEY_VIEW, checkpoint.selectedView.name)
            .apply()
    }

    fun load(): UiNavigationCheckpoint {
        val surface = preferences.getString(KEY_SURFACE, null)
            ?.let { runCatching { UiSurface.valueOf(it) }.getOrNull() }
            ?: UiSurface.PRESENCE
        val selectedView = preferences.getString(KEY_VIEW, null)
            ?.let { runCatching { WorkspaceViewType.valueOf(it) }.getOrNull() }
            ?: WorkspaceViewType.EXECUTIVE_OVERVIEW
        return UiCheckpointPolicy.sanitize(
            surface = surface,
            workspaceOpen = preferences.getBoolean(KEY_WORKSPACE_OPEN, false),
            selectedView = selectedView,
        )
    }

    companion object {
        private const val NAME = "aurora.ui.navigation.v1"
        private const val KEY_SURFACE = "surface"
        private const val KEY_WORKSPACE_OPEN = "workspace_open"
        private const val KEY_VIEW = "selected_view"
    }
}
