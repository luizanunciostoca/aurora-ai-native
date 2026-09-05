package ai.aurora.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class VoiceRecognitionConfigTest {
    @Test
    fun `default recognition profile is bounded for pt BR tap to talk`() {
        val config = VoiceRecognitionConfig()
        assertEquals("pt-BR", config.languageTag)
        assertEquals(true, config.preferOffline)
        assertEquals(true, config.partialResults)
        assertEquals(3, config.maxResults)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `blank language is rejected`() {
        VoiceRecognitionConfig(languageTag = "")
    }

    @Test(expected = IllegalArgumentException::class)
    fun `excessive recognition alternatives are rejected`() {
        VoiceRecognitionConfig(maxResults = 6)
    }
}
