package ai.aurora.ui

import ai.aurora.ui.model.AuroraSettings
import ai.aurora.ui.model.VoicePresentationPolicy
import ai.aurora.ui.model.VoiceSpeakRequest
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceUiModelTest {
    @Test
    fun `auto speak remains presentation only and respects privacy`() {
        val enabled = AuroraSettings(
            voiceOutputEnabled = true,
            autoSpeakResponses = true,
            privacyMode = false,
        )
        assertTrue(VoicePresentationPolicy.maySpeak(enabled, "Resposta verificada"))
        assertFalse(VoicePresentationPolicy.maySpeak(enabled.copy(privacyMode = true), "Resposta verificada"))
        assertFalse(VoicePresentationPolicy.maySpeak(enabled.copy(voiceOutputEnabled = false), "Resposta verificada"))
        assertFalse(VoicePresentationPolicy.maySpeak(enabled, ""))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `speech rate outside bounded range is rejected`() {
        AuroraSettings(voiceSpeechRate = 1.7f)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `pitch outside bounded range is rejected`() {
        AuroraSettings(voicePitch = 0.2f)
    }

    @Test
    fun `speak request is bounded local presentation state`() {
        val request = VoiceSpeakRequest(1, "Olá")
        assertTrue(request.id > 0)
        assertTrue(request.text.isNotBlank())
    }
}
