package ai.aurora.device.wake

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WakeSetupOnboardingActionTest {
    @Test
    fun `all onboarding actions round trip through explicit intent codec`() {
        WakeSetupOnboardingAction.entries.forEach { action ->
            assertEquals(
                action,
                WakeSetupOnboardingActionCodec.decode(
                    WakeSetupOnboardingActionCodec.encode(action),
                ),
            )
        }
    }

    @Test
    fun `missing or unknown onboarding action fails closed`() {
        assertNull(WakeSetupOnboardingActionCodec.decode(null))
        assertNull(WakeSetupOnboardingActionCodec.decode("GRANT_AUTHORITY"))
    }
}
