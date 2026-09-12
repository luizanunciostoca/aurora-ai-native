package ai.aurora.device.ui

enum class AuroraOnboardingStep {
    PRIVACY_BLOCKED,
    MICROPHONE,
    ASSISTANT_ROLE,
    WAKE_MODEL,
    WAKE_ENABLE,
    READY,
}

data class AuroraOnboardingInput(
    val microphoneGranted: Boolean,
    val assistantSelected: Boolean,
    val wakeModelReady: Boolean,
    val wakeEnabled: Boolean,
    val privacyModeEnabled: Boolean,
)

data class AuroraOnboardingPresentation(
    val step: AuroraOnboardingStep,
    val title: String,
    val detail: String,
    val primaryActionLabel: String,
    val progressLabel: String,
)

/**
 * Product-only setup guidance. This policy never grants Android permissions, assistant roles,
 * execution authority, or action capability; it only chooses the next user-visible setup step.
 */
object AuroraOnboardingPolicy {
    fun present(input: AuroraOnboardingInput): AuroraOnboardingPresentation {
        val step = nextStep(input)
        return when (step) {
            AuroraOnboardingStep.PRIVACY_BLOCKED ->
                AuroraOnboardingPresentation(
                    step = step,
                    title = "Privacidade ativa",
                    detail = "O microfone e a wake word estão pausados. Revise a configuração de privacidade para voltar a conversar.",
                    primaryActionLabel = "Revisar privacidade",
                    progressLabel = "Voz pausada pelo usuário",
                )
            AuroraOnboardingStep.MICROPHONE ->
                AuroraOnboardingPresentation(
                    step = step,
                    title = "Vamos configurar sua voz",
                    detail = "Primeiro, permita que a Aurora use o microfone. O Android sempre pedirá seu consentimento.",
                    primaryActionLabel = "Conceder acesso ao microfone",
                    progressLabel = "Configuração 1 de 4",
                )
            AuroraOnboardingStep.ASSISTANT_ROLE ->
                AuroraOnboardingPresentation(
                    step = step,
                    title = "Escolha a Aurora como assistente",
                    detail = "Isso libera o atalho de assistente do Android sem conceder autoridade para executar ações.",
                    primaryActionLabel = "Definir Aurora como assistente",
                    progressLabel = "Configuração 2 de 4",
                )
            AuroraOnboardingStep.WAKE_MODEL ->
                AuroraOnboardingPresentation(
                    step = step,
                    title = "Ensine a Aurora a reconhecer você",
                    detail = "Grave três amostras curtas dizendo “Aurora”. O modelo permanece local no dispositivo.",
                    primaryActionLabel = "Treinar “Aurora”",
                    progressLabel = "Configuração 3 de 4",
                )
            AuroraOnboardingStep.WAKE_ENABLE ->
                AuroraOnboardingPresentation(
                    step = step,
                    title = "Ative a wake word",
                    detail = "O detector local já está treinado. Ative-o para iniciar conversas dizendo “Aurora”.",
                    primaryActionLabel = "Ativar wake word",
                    progressLabel = "Configuração 4 de 4",
                )
            AuroraOnboardingStep.READY ->
                AuroraOnboardingPresentation(
                    step = step,
                    title = "Pronta para você",
                    detail = "Diga “Aurora” ou toque em Falar com Aurora para iniciar.",
                    primaryActionLabel = "Falar com Aurora",
                    progressLabel = "Aurora pronta",
                )
        }
    }

    fun nextStep(input: AuroraOnboardingInput): AuroraOnboardingStep =
        when {
            input.privacyModeEnabled -> AuroraOnboardingStep.PRIVACY_BLOCKED
            !input.microphoneGranted -> AuroraOnboardingStep.MICROPHONE
            !input.assistantSelected -> AuroraOnboardingStep.ASSISTANT_ROLE
            !input.wakeModelReady -> AuroraOnboardingStep.WAKE_MODEL
            !input.wakeEnabled -> AuroraOnboardingStep.WAKE_ENABLE
            else -> AuroraOnboardingStep.READY
        }
}
