package ai.aurora.device.wake

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WakeSensitivityPolicyTest {
    @Test
    fun `default sensitivity preserves canonical threshold`() {
        assertEquals(0.82, WakeSensitivityPolicy.confidenceThreshold(0.50f), 0.000001)
    }

    @Test
    fun `higher sensitivity lowers only the acoustic threshold`() {
        val conservative = WakeSensitivityPolicy.confidenceThreshold(0.0f)
        val default = WakeSensitivityPolicy.confidenceThreshold(0.5f)
        val permissive = WakeSensitivityPolicy.confidenceThreshold(1.0f)

        assertTrue(conservative > default)
        assertTrue(default > permissive)
        assertEquals(0.92, conservative, 0.000001)
        assertEquals(0.72, permissive, 0.000001)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `out of range sensitivity fails closed`() {
        WakeSensitivityPolicy.confidenceThreshold(1.01f)
    }
}
