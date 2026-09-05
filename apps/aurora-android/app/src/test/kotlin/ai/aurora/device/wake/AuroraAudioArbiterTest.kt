package ai.aurora.device.wake

import ai.aurora.device.wake.AuroraAudioArbiter.AudioOwner
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraAudioArbiterTest {
    @Test
    fun `stt is exclusive`() {
        val arbiter = AuroraAudioArbiter()
        assertTrue(arbiter.tryAcquire(AudioOwner.HOTWORD_MONITOR))
        assertFalse(arbiter.tryAcquire(AudioOwner.STT))
        assertTrue(arbiter.handoffToStt())
        assertTrue(AudioOwner.STT in arbiter.snapshot().owners)
        assertFalse(arbiter.tryAcquire(AudioOwner.TTS))
    }

    @Test
    fun `tts and hotword may coexist only for barge in`() {
        val arbiter = AuroraAudioArbiter(bargeInEnabled = true)
        assertTrue(arbiter.tryAcquire(AudioOwner.TTS))
        assertTrue(arbiter.tryAcquire(AudioOwner.HOTWORD_MONITOR))

        arbiter.setBargeInEnabled(false)
        assertFalse(AudioOwner.HOTWORD_MONITOR in arbiter.snapshot().owners)
        assertFalse(arbiter.tryAcquire(AudioOwner.HOTWORD_MONITOR))
    }

    @Test
    fun `stt hands back to hotword deterministically`() {
        val arbiter = AuroraAudioArbiter()
        assertTrue(arbiter.tryAcquire(AudioOwner.STT))
        assertTrue(arbiter.handoffFromSttToHotword())
        assertTrue(AudioOwner.HOTWORD_MONITOR in arbiter.snapshot().owners)
        assertFalse(AudioOwner.STT in arbiter.snapshot().owners)
    }
}
