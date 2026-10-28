package ai.aurora.device.wake

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WakeProcessRearmGateTest {
    @Test
    fun duplicateStartsAreBlockedUntilServiceBecomesInactive() {
        val gate = WakeProcessRearmGate()
        assertTrue(gate.tryBeginStart())
        assertTrue(gate.activeOrStarting())
        assertFalse(gate.tryBeginStart())
        gate.markInactive()
        assertFalse(gate.activeOrStarting())
        assertTrue(gate.tryBeginStart())
    }

    @Test
    fun activeServiceBlocksRelaunchStartUntilDestroyed() {
        val gate = WakeProcessRearmGate()
        gate.markActive()
        assertFalse(gate.tryBeginStart())
        gate.markInactive()
        assertTrue(gate.tryBeginStart())
    }
}
