package ai.aurora.ui

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test

class VoiceSessionRegistryTest {
    @After
    fun cleanup() {
        VoiceSessionRegistry.clearForTest()
    }

    @Test
    fun `background stop reaches every active registration`() {
        var first = 0
        var second = 0
        val a = VoiceSessionRegistry.register { first += 1 }
        val b = VoiceSessionRegistry.register { second += 1 }

        VoiceSessionRegistry.stopAllForBackground()

        assertEquals(1, first)
        assertEquals(1, second)
        a.close()
        b.close()
    }

    @Test
    fun `privacy stop reaches every active registration`() {
        var calls = 0
        val registration = VoiceSessionRegistry.register { calls += 1 }

        VoiceSessionRegistry.stopAllForPrivacy()

        assertEquals(1, calls)
        registration.close()
    }

    @Test
    fun `closed registration is never invoked`() {
        var calls = 0
        val registration = VoiceSessionRegistry.register { calls += 1 }
        registration.close()

        VoiceSessionRegistry.stopAllForBackground()

        assertEquals(0, calls)
        assertEquals(0, VoiceSessionRegistry.registeredCountForTest())
    }

    @Test
    fun `one failing stopper cannot prevent remaining resources from stopping`() {
        var safeStopperCalls = 0
        val failing = VoiceSessionRegistry.register { error("expected test failure") }
        val safe = VoiceSessionRegistry.register { safeStopperCalls += 1 }

        VoiceSessionRegistry.stopAllForPrivacy()

        assertEquals(1, safeStopperCalls)
        failing.close()
        safe.close()
    }
}
