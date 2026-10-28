package ai.aurora.device.executor

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GovernedTaskPlanTest {
    @Test
    fun planAndStepsNeverMintExecutionAuthority() {
        val plan =
            GovernedTaskPlan(
                taskId = "task-1",
                steps =
                    listOf(
                        GovernedTaskStep(
                            stepId = "step-1",
                            capabilityId = "audio.volume.set",
                            action = DeviceActionCommand(W15J_AUDIO_VOLUME_STEP_UP_ACTION),
                        ),
                    ),
            )

        assertFalse(plan.authorizesExecution)
        assertFalse(plan.provesExecutionSuccess)
        assertFalse(plan.retryAuthorized)
    }

    @Test
    fun progressionStopsOnFailureRejectionOrUncertainExecution() {
        assertTrue(GovernedTaskProgressionPolicy.mayAdvance(GovernedTaskStepOutcome.VERIFIED_SUCCEEDED))
        assertFalse(GovernedTaskProgressionPolicy.mayAdvance(GovernedTaskStepOutcome.VERIFIED_FAILED))
        assertFalse(GovernedTaskProgressionPolicy.mayAdvance(GovernedTaskStepOutcome.REJECTED_BEFORE_EFFECT))
        assertFalse(GovernedTaskProgressionPolicy.mayAdvance(GovernedTaskStepOutcome.EXECUTION_UNCERTAIN))
        GovernedTaskStepOutcome.entries.forEach {
            assertFalse(GovernedTaskProgressionPolicy.retryAuthorized(it))
        }
    }
}
