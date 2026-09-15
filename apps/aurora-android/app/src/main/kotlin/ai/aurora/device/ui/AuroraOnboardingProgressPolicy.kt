package ai.aurora.device.ui

internal data class AuroraOnboardingProgress(
    val completedSteps: Int,
    val totalSteps: Int,
    val activeStepIndex: Int?,
    val showTrack: Boolean,
    val summaryLabel: String,
    val isComplete: Boolean,
)

/**
 * Maps the already-owned onboarding step to presentation-only progress information.
 *
 * This policy never decides readiness, permissions, assistant role, wake state, authority or DP5
 * acceptance. Those decisions remain owned by AuroraOnboardingPolicy and their existing sources.
 */
internal object AuroraOnboardingProgressPolicy {
    private const val TOTAL_SETUP_STEPS = 4

    fun resolve(step: AuroraOnboardingStep): AuroraOnboardingProgress =
        when (step) {
            AuroraOnboardingStep.PRIVACY_BLOCKED ->
                AuroraOnboardingProgress(
                    completedSteps = 0,
                    totalSteps = TOTAL_SETUP_STEPS,
                    activeStepIndex = null,
                    showTrack = false,
                    summaryLabel = "Pausada",
                    isComplete = false,
                )
            AuroraOnboardingStep.MICROPHONE -> setupStep(index = 0)
            AuroraOnboardingStep.ASSISTANT_ROLE -> setupStep(index = 1)
            AuroraOnboardingStep.WAKE_MODEL -> setupStep(index = 2)
            AuroraOnboardingStep.WAKE_ENABLE -> setupStep(index = 3)
            AuroraOnboardingStep.WAKE_RUNTIME ->
                AuroraOnboardingProgress(
                    completedSteps = TOTAL_SETUP_STEPS,
                    totalSteps = TOTAL_SETUP_STEPS,
                    activeStepIndex = null,
                    showTrack = true,
                    summaryLabel = "4 de 4 · Validando",
                    isComplete = false,
                )
            AuroraOnboardingStep.READY ->
                AuroraOnboardingProgress(
                    completedSteps = TOTAL_SETUP_STEPS,
                    totalSteps = TOTAL_SETUP_STEPS,
                    activeStepIndex = null,
                    showTrack = true,
                    summaryLabel = "Concluída",
                    isComplete = true,
                )
        }

    private fun setupStep(index: Int): AuroraOnboardingProgress =
        AuroraOnboardingProgress(
            completedSteps = index,
            totalSteps = TOTAL_SETUP_STEPS,
            activeStepIndex = index,
            showTrack = true,
            summaryLabel = "Etapa ${index + 1} de $TOTAL_SETUP_STEPS",
            isComplete = false,
        )
}
