package ai.aurora.device.ui

internal data class AuroraActionSetKey(
    val step: AuroraOnboardingStep,
    val primaryLabel: String,
    val assistantSelected: Boolean,
    val microphoneGranted: Boolean,
    val privacyEnabled: Boolean,
    val developerModeEnabled: Boolean,
    val showLocalRuntime: Boolean,
    val showDeveloperToggle: Boolean,
)

internal object AuroraActionRefreshPolicy {
    fun shouldRebuild(
        previous: AuroraActionSetKey?,
        current: AuroraActionSetKey,
    ): Boolean = previous != current
}
