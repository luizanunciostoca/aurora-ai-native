package ai.aurora.device.wake

import ai.aurora.device.wake.AuroraAudioArbiter.AudioOwner
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraAudioArbiterTest {
    @Test
    fun `stt waits until hotword physically releases its own lease`() {
        val arbiter = AuroraAudioArbiter()
        assertTrue(arbiter.tryAcquire(AudioOwner.HOTWORD_MONITOR))
        assertFalse(arbiter.tryAcquire(AudioOwner.STT))
        assertFalse(arbiter.handoffToStt())
        assertEquals(setOf(AudioOwner.HOTWORD_MONITOR), arbiter.snapshot().owners)

        arbiter.release(AudioOwner.HOTWORD_MONITOR)
        assertTrue(arbiter.handoffToStt())
        assertEquals(setOf(AudioOwner.STT), arbiter.snapshot().owners)
        assertFalse(arbiter.tryAcquire(AudioOwner.TTS))
        assertFalse(arbiter.tryAcquire(AudioOwner.ENROLLMENT))
    }

    @Test
    fun `tts and hotword may coexist only for barge in without synthetic lease release`() {
        val arbiter = AuroraAudioArbiter(bargeInEnabled = true)
        assertTrue(arbiter.tryAcquire(AudioOwner.TTS))
        assertTrue(arbiter.tryAcquire(AudioOwner.HOTWORD_MONITOR))

        arbiter.setBargeInEnabled(false)
        assertEquals(
            setOf(AudioOwner.TTS, AudioOwner.HOTWORD_MONITOR),
            arbiter.snapshot().owners,
        )
        assertFalse(arbiter.handoffToStt())

        arbiter.release(AudioOwner.HOTWORD_MONITOR)
        assertFalse(arbiter.handoffToStt())
        assertEquals(setOf(AudioOwner.TTS), arbiter.snapshot().owners)
        arbiter.release(AudioOwner.TTS)
        assertTrue(arbiter.handoffToStt())
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
    fun `stt hands back to hotword only when it is the sole owner`() {
        val arbiter = AuroraAudioArbiter()
        assertFalse(arbiter.handoffFromSttToHotword())
        assertTrue(arbiter.tryAcquire(AudioOwner.STT))
        assertTrue(arbiter.handoffFromSttToHotword())
        assertTrue(AudioOwner.HOTWORD_MONITOR in arbiter.snapshot().owners)
        assertFalse(AudioOwner.STT in arbiter.snapshot().owners)
    }
}
