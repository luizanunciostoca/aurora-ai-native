package ai.aurora.device.wake

import ai.aurora.device.wake.AuroraAudioArbiter.AudioOwner
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraAudioArbiterTest {
    @Test
    fun `stt is exclusive and can take a governed hotword handoff`() {
        val arbiter = AuroraAudioArbiter()
        assertTrue(arbiter.tryAcquire(AudioOwner.HOTWORD_MONITOR))
        assertFalse(arbiter.tryAcquire(AudioOwner.STT))
        assertTrue(arbiter.handoffToStt())
        assertTrue(AudioOwner.STT in arbiter.snapshot().owners)
        assertFalse(arbiter.tryAcquire(AudioOwner.TTS))
        assertFalse(arbiter.tryAcquire(AudioOwner.ENROLLMENT))
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
    fun `enrollment is exclusive and blocks every other capture owner`() {
        val arbiter = AuroraAudioArbiter()
        assertTrue(arbiter.tryAcquire(AudioOwner.ENROLLMENT))
        assertFalse(arbiter.tryAcquire(AudioOwner.HOTWORD_MONITOR))
        assertFalse(arbiter.tryAcquire(AudioOwner.STT))
        assertFalse(arbiter.tryAcquire(AudioOwner.TTS))
        arbiter.release(AudioOwner.ENROLLMENT)
        assertTrue(arbiter.tryAcquire(AudioOwner.HOTWORD_MONITOR))
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
