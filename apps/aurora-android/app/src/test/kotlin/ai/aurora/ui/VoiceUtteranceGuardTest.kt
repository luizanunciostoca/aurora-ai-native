package ai.aurora.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceUtteranceGuardTest {
    @Test
    fun `stale completion cannot clear replacement utterance`() {
        val guard = VoiceUtteranceGuard()
        guard.begin(1)
        guard.begin(2)

        assertFalse(guard.completeIfCurrent(1))
        assertTrue(guard.owns(2))
        assertEquals(2L, guard.currentForTest())
    }

    @Test
    fun `current completion clears ownership exactly once`() {
        val guard = VoiceUtteranceGuard()
        guard.begin(7)

        assertTrue(guard.completeIfCurrent(7))
        assertFalse(guard.completeIfCurrent(7))
        assertNull(guard.currentForTest())
    }

    @Test
    fun `clear returns active request and leaves no owner`() {
        val guard = VoiceUtteranceGuard()
        guard.begin(9)

        assertEquals(9L, guard.clear())
        assertNull(guard.clear())
        assertNull(guard.currentForTest())
    }
}
