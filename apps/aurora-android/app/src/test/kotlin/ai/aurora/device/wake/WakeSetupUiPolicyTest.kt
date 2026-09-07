package ai.aurora.device.wake

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WakeSetupUiPolicyTest {
    @Test
    fun `failed retraining preserves ready model presentation`() {
        val label =
            WakeSetupUiPolicy.runtimeLabel(
                state = "ENROLLMENT_FAILED",
                modelReady = true,
                wakeEnabled = true,
            )
        assertTrue(label.contains("modelo anterior preservado"))
        assertTrue(label.contains("Wake configurado"))
    }

    @Test
    fun `privacy mode blocks training and wake activation`() {
        val presentation =
            WakeSetupUiPolicy.present(
                WakeSetupUiInput(
                    microphoneGranted = true,
                    modelReady = true,
                    assistantRoleAvailable = true,
                    assistantSelected = false,
                    wakeEnabled = false,
                    privacyModeEnabled = true,
                    runtimeState = "WAKE_PRIVACY_BLOCKED",
                    runtimeError = null,
                    enrollmentRetryPending = false,
                    acceptedEnrollmentSamples = 0,
                ),
            )
        assertFalse(presentation.canTrain)
        assertFalse(presentation.canEnableWake)
        assertTrue(presentation.guidance.contains("privacidade"))
    }

    @Test
    fun `wake activation requires microphone model and privacy off`() {
        val ready =
            WakeSetupUiPolicy.present(
                WakeSetupUiInput(
                    microphoneGranted = true,
                    modelReady = true,
                    assistantRoleAvailable = true,
                    assistantSelected = true,
                    wakeEnabled = false,
                    privacyModeEnabled = false,
                    runtimeState = "DISABLED",
                    runtimeError = null,
                    enrollmentRetryPending = false,
                    acceptedEnrollmentSamples = 0,
                ),
            )
        assertTrue(ready.canEnableWake)

        val noModel = readyInput(modelReady = false)
        assertFalse(WakeSetupUiPolicy.present(noModel).canEnableWake)

        val noMicrophone = readyInput(microphoneGranted = false)
        assertFalse(WakeSetupUiPolicy.present(noMicrophone).canEnableWake)
    }

    @Test
    fun `unclear enrollment sample is recoverable and translated`() {
        val diagnostic = "wake enrollment sample was not clear enough"
        assertTrue(WakeSetupUiPolicy.isRecoverableEnrollmentError(diagnostic))
        val userFacing = WakeSetupUiPolicy.userFacingError(diagnostic).orEmpty()
        assertTrue(userFacing.contains("amostra não ficou clara"))
        assertTrue(userFacing.contains("30–60 cm"))
    }

    @Test
    fun `retry keeps accepted samples and requests only next sample`() {
        val presentation =
            WakeSetupUiPolicy.present(
                readyInput(
                    runtimeState = "ENROLLMENT_RETRY_REQUIRED",
                    enrollmentRetryPending = true,
                    acceptedEnrollmentSamples = 2,
                ),
            )
        assertTrue(presentation.enrollmentButtonLabel.contains("amostra 3 de 3"))
        assertTrue(presentation.guidance.contains("modelo anterior"))
    }

    private fun readyInput(
        microphoneGranted: Boolean = true,
        modelReady: Boolean = true,
        runtimeState: String = "DISABLED",
        enrollmentRetryPending: Boolean = false,
        acceptedEnrollmentSamples: Int = 0,
    ): WakeSetupUiInput =
        WakeSetupUiInput(
            microphoneGranted = microphoneGranted,
            modelReady = modelReady,
            assistantRoleAvailable = true,
            assistantSelected = true,
            wakeEnabled = false,
            privacyModeEnabled = false,
            runtimeState = runtimeState,
            runtimeError = null,
            enrollmentRetryPending = enrollmentRetryPending,
            acceptedEnrollmentSamples = acceptedEnrollmentSamples,
        )
}
