package ai.aurora.device.ui

import ai.aurora.device.voice.VoiceEscalationReason
import ai.aurora.device.voice.VoiceFastPathDecision
import ai.aurora.device.voice.WakeVoiceFallbackReason
import ai.aurora.device.voice.WakeVoiceRoute
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AuroraAssistantResponseComposerTest {
    @Test
    fun volumeCapabilityHasSpecificSuccessCopy() {
        assertEquals(
            "Pronto. Aumentei o volume.",
            AuroraAssistantResponseComposer.successForCapability("audio.volume.set"),
        )
    }

    @Test
    fun unknownCommandExplainsThatExecutionIsUnavailable() {
        val response =
            AuroraAssistantResponseComposer.fallback(
                WakeVoiceRoute.ConversationFallback(
                    reason = WakeVoiceFallbackReason.FAST_PATH_ESCALATED,
                    decision =
                        VoiceFastPathDecision.Escalated(
                            VoiceEscalationReason.UNKNOWN_COMMAND,
                        ),
                ),
            )
        assertTrue(response.contains("ainda não tenho uma ação disponível"))
    }

    @Test
    fun uncertainActionExplicitlyRejectsAutomaticRepeat() {
        val response = AuroraAssistantResponseComposer.uncertainAction()
        assertTrue(response.contains("incerto"))
        assertTrue(response.contains("Não vou repetir automaticamente"))
    }
}
