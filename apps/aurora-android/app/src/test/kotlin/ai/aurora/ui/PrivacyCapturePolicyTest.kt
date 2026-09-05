package ai.aurora.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PrivacyCapturePolicyTest {
    @Test
    fun privacyModeOffKeepsScreenCaptureAvailable() {
        assertFalse(PrivacyCapturePolicy.shouldBlockScreenCapture(false))
    }

    @Test
    fun privacyModeOnRequiresSecureScreenCapturePolicy() {
        assertTrue(PrivacyCapturePolicy.shouldBlockScreenCapture(true))
    }
}
