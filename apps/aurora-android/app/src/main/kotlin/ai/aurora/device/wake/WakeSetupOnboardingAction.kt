package ai.aurora.device.wake

/**
 * Product-only handoff from the assistant Home into the explicit wake setup surface.
 *
 * This value chooses which visible setup action the user already requested. It never grants
 * Android permission, assistant role, wake authority, business authority, execution, or retry.
 */
enum class WakeSetupOnboardingAction {
    TRAIN_WAKE,
    ENABLE_WAKE,
    REVIEW_PRIVACY,
}

object WakeSetupOnboardingActionCodec {
    const val EXTRA_ONBOARDING_ACTION = "ai.aurora.extra.WAKE_SETUP_ONBOARDING_ACTION"

    fun encode(action: WakeSetupOnboardingAction): String = action.name

    fun decode(value: String?): WakeSetupOnboardingAction? =
        value?.let { encoded -> WakeSetupOnboardingAction.entries.firstOrNull { it.name == encoded } }
}
