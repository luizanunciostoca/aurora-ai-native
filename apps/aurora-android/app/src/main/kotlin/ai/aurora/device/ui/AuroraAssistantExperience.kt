package ai.aurora.device.ui

enum class AuroraAssistantStage {
    READY,
    LISTENING,
    UNDERSTANDING,
    ACTING,
    SPEAKING,
    COMPLETED,
    BLOCKED,
    DEGRADED,
}

data class AuroraAssistantPresentation(
    val eyebrow: String,
    val title: String,
    val detail: String,
)

object AuroraAssistantExperience {
    fun presentation(stage: AuroraAssistantStage): AuroraAssistantPresentation =
        when (stage) {
            AuroraAssistantStage.READY ->
                AuroraAssistantPresentation(
                    eyebrow = "AURORA • PREVIEW",
                    title = "Pronta para você",
                    detail = "Diga “Aurora” ou toque em Falar para iniciar.",
                )
            AuroraAssistantStage.LISTENING ->
                AuroraAssistantPresentation(
                    eyebrow = "OUVINDO",
                    title = "Pode falar",
                    detail = "Estou ouvindo sua solicitação.",
                )
            AuroraAssistantStage.UNDERSTANDING ->
                AuroraAssistantPresentation(
                    eyebrow = "ENTENDENDO",
                    title = "Entendi",
                    detail = "Estou verificando o que consigo fazer com segurança agora.",
                )
            AuroraAssistantStage.ACTING ->
                AuroraAssistantPresentation(
                    eyebrow = "AGINDO",
                    title = "Executando",
                    detail = "A ação está passando pelo fluxo governado da Aurora.",
                )
            AuroraAssistantStage.SPEAKING ->
                AuroraAssistantPresentation(
                    eyebrow = "RESPONDENDO",
                    title = "Aurora",
                    detail = "Respondendo por voz.",
                )
            AuroraAssistantStage.COMPLETED ->
                AuroraAssistantPresentation(
                    eyebrow = "CONCLUÍDO",
                    title = "Pronto",
                    detail = "A interação foi concluída.",
                )
            AuroraAssistantStage.BLOCKED ->
                AuroraAssistantPresentation(
                    eyebrow = "AÇÃO BLOQUEADA",
                    title = "Não executei",
                    detail = "A Aurora preservou as regras de segurança e autoridade.",
                )
            AuroraAssistantStage.DEGRADED ->
                AuroraAssistantPresentation(
                    eyebrow = "CONFIGURAÇÃO NECESSÁRIA",
                    title = "Quase pronta",
                    detail = "Conclua a configuração indicada abaixo para liberar a experiência de voz.",
                )
        }
}
