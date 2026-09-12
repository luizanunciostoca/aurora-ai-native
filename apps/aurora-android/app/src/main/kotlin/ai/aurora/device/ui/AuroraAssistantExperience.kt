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
                    eyebrow = "AURORA",
                    title = "Pronta para você",
                    detail = "Diga “Aurora” ou toque em Falar com Aurora para iniciar.",
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
                    detail = "Estou verificando o que posso fazer agora.",
                )
            AuroraAssistantStage.ACTING ->
                AuroraAssistantPresentation(
                    eyebrow = "AGINDO",
                    title = "Executando",
                    detail = "Estou realizando a ação com as verificações necessárias.",
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
                    eyebrow = "NÃO EXECUTADO",
                    title = "Não consegui fazer isso",
                    detail = "A solicitação não pôde ser executada com segurança.",
                )
            AuroraAssistantStage.DEGRADED ->
                AuroraAssistantPresentation(
                    eyebrow = "CONFIGURAÇÃO",
                    title = "Quase pronta",
                    detail = "Conclua a etapa indicada abaixo para liberar a experiência de voz.",
                )
        }
}
