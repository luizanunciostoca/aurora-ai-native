package ai.aurora.device.ui

import ai.aurora.device.voice.VoiceEscalationReason
import ai.aurora.device.voice.VoiceFastPathDecision
import ai.aurora.device.voice.WakeVoiceFallbackReason
import ai.aurora.device.voice.WakeVoiceRoute

object AuroraAssistantResponseComposer {
    fun successForCapability(capabilityId: String): String =
        when (capabilityId) {
            "audio.volume.set" -> "Pronto. Aumentei o volume."
            else -> "Pronto. A ação disponível foi concluída."
        }

    fun failedAction(): String =
        "Entendi o pedido, mas a ação não foi concluída."

    fun uncertainAction(): String =
        "A ação ficou com resultado incerto. Não vou repetir automaticamente."

    fun unavailableAction(requiresReconciliation: Boolean): String =
        if (requiresReconciliation) {
            "Não consegui confirmar o resultado. Vou preservar o estado sem repetir a ação."
        } else {
            "Entendi o pedido, mas essa ação não está disponível agora."
        }

    fun fallback(route: WakeVoiceRoute.ConversationFallback): String =
        when (route.reason) {
            WakeVoiceFallbackReason.TRANSCRIPT_CONFIDENCE_UNAVAILABLE ->
                "Ouvi você, mas não consegui medir a confiança da transcrição. Tente novamente."
            WakeVoiceFallbackReason.RUNTIME_CONTEXT_UNAVAILABLE ->
                "Entendi que você quer interagir comigo, mas meu contexto local ainda não está pronto."
            WakeVoiceFallbackReason.COMMAND_CATALOG_UNAVAILABLE ->
                "Estou ouvindo, mas meu catálogo de ações ainda não está carregado."
            WakeVoiceFallbackReason.AUTHORITY_INGRESS_UNAVAILABLE ->
                "Entendi o comando, mas o canal governado de execução está indisponível agora."
            WakeVoiceFallbackReason.FAST_PATH_BLOCKED ->
                "Entendi, mas esta interação está bloqueada pelas condições atuais do dispositivo."
            WakeVoiceFallbackReason.FAST_PATH_ESCALATED -> escalated(route.decision)
        }

    private fun escalated(decision: VoiceFastPathDecision?): String =
        when (decision) {
            is VoiceFastPathDecision.Escalated ->
                when (decision.reason) {
                    VoiceEscalationReason.EMPTY_TRANSCRIPT ->
                        "Não consegui ouvir um pedido completo. Tente novamente."
                    VoiceEscalationReason.LOW_TRANSCRIPT_CONFIDENCE ->
                        "Não entendi com confiança suficiente. Pode repetir?"
                    VoiceEscalationReason.UNKNOWN_COMMAND ->
                        "Entendi o que você disse, mas ainda não tenho uma ação disponível para esse pedido."
                    VoiceEscalationReason.AMBIGUOUS_COMMAND ->
                        "Seu pedido pode significar mais de uma ação. Reformule para eu não executar a opção errada."
                    VoiceEscalationReason.HIGH_RISK_COMMAND ->
                        "Entendi o pedido, mas essa ação exige um fluxo de confirmação mais forte."
                    VoiceEscalationReason.CAPABILITY_NOT_AVAILABLE ->
                        "Entendi o pedido, mas essa função ainda não está disponível neste dispositivo."
                }
            is VoiceFastPathDecision.Blocked ->
                "A interação foi bloqueada pelas condições atuais de privacidade, presença ou permissão."
            VoiceFastPathDecision.IgnoredFalseWake ->
                "Não confirmei uma ativação válida da Aurora."
            is VoiceFastPathDecision.Candidate,
            null,
            -> "Entendi o pedido, mas ainda não consigo executá-lo nesta versão."
        }
}
