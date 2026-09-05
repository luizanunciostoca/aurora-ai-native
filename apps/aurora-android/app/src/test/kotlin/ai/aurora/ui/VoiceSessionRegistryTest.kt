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
        val a = VoiceSessionRegistry.register(onBackground = { first += 1 })
        val b = VoiceSessionRegistry.register(onBackground = { second += 1 })

        VoiceSessionRegistry.stopAllForBackground()

        assertEquals(1, first)
        assertEquals(1, second)
        a.close()
        b.close()
    }

    @Test
    fun `privacy hook is distinct from background hook`() {
        var backgroundCalls = 0
        var privacyCalls = 0
        val registration = VoiceSessionRegistry.register(
            onBackground = { backgroundCalls += 1 },
            onPrivacy = { privacyCalls += 1 },
        )

        VoiceSessionRegistry.stopAllForPrivacy()

        assertEquals(0, backgroundCalls)
        assertEquals(1, privacyCalls)
        registration.close()
    }

    @Test
    fun `closed registration is never invoked`() {
        var calls = 0
        val registration = VoiceSessionRegistry.register(onBackground = { calls += 1 })
        registration.close()

        VoiceSessionRegistry.stopAllForBackground()

        assertEquals(0, calls)
        assertEquals(0, VoiceSessionRegistry.registeredCountForTest())
    }

    @Test
    fun `one failing stopper cannot prevent remaining resources from stopping`() {
        var safeStopperCalls = 0
        val failing = VoiceSessionRegistry.register(
            onBackground = {},
            onPrivacy = { error("expected test failure") },
        )
        val safe = VoiceSessionRegistry.register(
            onBackground = {},
            onPrivacy = { safeStopperCalls += 1 },
        )

        VoiceSessionRegistry.stopAllForPrivacy()

        assertEquals(1, safeStopperCalls)
        failing.close()
        safe.close()
    }
}
