package ai.aurora.device.wake

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WakePlaybackAwarenessTest {
    @Test
    fun `tts saying Aurora activates deterministic self wake suppression`() {
        WakePlaybackAwareness.onTtsStopped()
        WakePlaybackAwareness.onTtsStarted("Eu sou a Aurora e posso ajudar.")

        val snapshot = WakePlaybackAwareness.snapshot()
        assertTrue(snapshot.ttsActive)
        assertTrue(snapshot.keywordPlaybackActive)

        WakePlaybackAwareness.onTtsStopped()
        assertFalse(WakePlaybackAwareness.snapshot().ttsActive)
    }

    @Test
    fun `tts without wake word keeps real user barge in distinguishable`() {
        WakePlaybackAwareness.onTtsStopped()
        WakePlaybackAwareness.onTtsStarted("Aqui estão suas campanhas de hoje.")

        val snapshot = WakePlaybackAwareness.snapshot()
        assertTrue(snapshot.ttsActive)
        assertFalse(snapshot.keywordPlaybackActive)

        WakePlaybackAwareness.onTtsStopped()
    }
}
