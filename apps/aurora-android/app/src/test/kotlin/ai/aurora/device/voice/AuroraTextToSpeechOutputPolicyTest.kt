package ai.aurora.device.voice

import android.media.AudioManager
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraTextToSpeechOutputPolicyTest {
    @Test
    fun `tts timeout grows with text but stays bounded`() {
        val shortTimeout = AuroraTextToSpeechOutput.timeoutForText(1)
        val mediumTimeout = AuroraTextToSpeechOutput.timeoutForText(256)
        val maxTimeout = AuroraTextToSpeechOutput.timeoutForText(AuroraTextToSpeechOutput.MAX_TEXT_CHARS)

        assertTrue(shortTimeout >= 10_000L)
        assertTrue(mediumTimeout > shortTimeout)
        assertTrue(maxTimeout >= mediumTimeout)
        assertTrue(maxTimeout <= 180_000L)
    }

    @Test
    fun `spoken TTS stops for permanent transient and duck focus losses`() {
        assertTrue(isTtsAudioFocusLoss(AudioManager.AUDIOFOCUS_LOSS))
        assertTrue(isTtsAudioFocusLoss(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT))
        assertTrue(isTtsAudioFocusLoss(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK))
        assertFalse(isTtsAudioFocusLoss(AudioManager.AUDIOFOCUS_GAIN))
        assertFalse(isTtsAudioFocusLoss(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT))
    }
}
