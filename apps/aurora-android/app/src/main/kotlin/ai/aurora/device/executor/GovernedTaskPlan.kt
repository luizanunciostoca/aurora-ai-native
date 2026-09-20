package ai.aurora.device.executor

/**
 * Non-executable task composition model for A8.
 *
 * A plan is orchestration data only. Each step must obtain its own current W07 authorization and go
 * through the normal W14/W15-F path. This type cannot batch, mint, cache or widen execution authority.
 */
data class GovernedTaskStep(
    val stepId: String,
    val capabilityId: String,
    val action: DeviceActionCommand,
    val appId: String? = null,
) {
    init {
        require(stepId.isNotBlank())
        require(capabilityId.isNotBlank())
        require(appId == null || appId.isNotBlank())
    }
}

data class GovernedTaskPlan(
    val taskId: String,
    val steps: List<GovernedTaskStep>,
    val authorizesExecution: Boolean = false,
    val provesExecutionSuccess: Boolean = false,
    val retryAuthorized: Boolean = false,
) {
    init {
        require(taskId.isNotBlank())
        require(steps.isNotEmpty())
        require(steps.map { it.stepId }.distinct().size == steps.size)
        require(!authorizesExecution)
        require(!provesExecutionSuccess)
        require(!retryAuthorized)
    }
}

enum class GovernedTaskStepOutcome {
    VERIFIED_SUCCEEDED,
    VERIFIED_FAILED,
    EXECUTION_UNCERTAIN,
    REJECTED_BEFORE_EFFECT,
}

object GovernedTaskProgressionPolicy {
    /** Only a separately verified completed step permits advancing to the next step. */
    fun mayAdvance(outcome: GovernedTaskStepOutcome): Boolean =
        outcome == GovernedTaskStepOutcome.VERIFIED_SUCCEEDED

    /** No outcome in the Android task plan can authorize a blind retry. */
    fun retryAuthorized(outcome: GovernedTaskStepOutcome): Boolean = false
}
