package ai.aurora.device.ui

internal enum class AuroraSystemStatusTone {
    POSITIVE,
    ATTENTION,
    PRIVACY,
    NEUTRAL,
}

internal data class AuroraSystemStatusItem(
    val label: String,
    val value: String,
    val tone: AuroraSystemStatusTone = AuroraSystemStatusTone.NEUTRAL,
)

internal data class AuroraSystemStatusInput(
    val setupProgress: AuroraOnboardingProgress,
    val microphoneGranted: Boolean,
    val assistantSelected: Boolean,
    val wakeOperational: Boolean,
    val privacyEnabled: Boolean,
)

/**
 * Presentation-only mapping for the Home status summary.
 *
 * Inputs are already-decided UI facts. This policy never computes Android permission, assistant,
 * wake-runtime, authority, execution or DP5 truth; it only maps those supplied values to readable
 * labels and redundant visual tones.
 */
internal object AuroraSystemStatusPolicy {
    fun items(input: AuroraSystemStatusInput): List<AuroraSystemStatusItem> =
        buildList {
            if (input.setupProgress.showTrack) {
                add(
                    AuroraSystemStatusItem(
                        label = "Configuração",
                        value = input.setupProgress.summaryLabel,
                        tone =
                            if (input.setupProgress.isComplete) {
                                AuroraSystemStatusTone.POSITIVE
                            } else {
                                AuroraSystemStatusTone.NEUTRAL
                            },
                    ),
                )
            }
            add(
                AuroraSystemStatusItem(
                    label = "Microfone",
                    value = if (input.microphoneGranted) "Autorizado" else "Pendente",
                    tone =
                        if (input.microphoneGranted) {
                            AuroraSystemStatusTone.POSITIVE
                        } else {
                            AuroraSystemStatusTone.ATTENTION
                        },
                ),
            )
            add(
                AuroraSystemStatusItem(
                    label = "Assistente",
                    value = if (input.assistantSelected) "Selecionada" else "Pendente",
                    tone =
                        if (input.assistantSelected) {
                            AuroraSystemStatusTone.POSITIVE
                        } else {
                            AuroraSystemStatusTone.ATTENTION
                        },
                ),
            )
            add(
                AuroraSystemStatusItem(
                    label = "Wake word",
                    value = if (input.wakeOperational) "Ativo" else "Inativo",
                    tone =
                        when {
                            input.privacyEnabled -> AuroraSystemStatusTone.PRIVACY
                            input.wakeOperational -> AuroraSystemStatusTone.POSITIVE
                            else -> AuroraSystemStatusTone.ATTENTION
                        },
                ),
            )
            add(
                AuroraSystemStatusItem(
                    label = "Privacidade",
                    value = if (input.privacyEnabled) "Ativa" else "Normal",
                    tone =
                        if (input.privacyEnabled) {
                            AuroraSystemStatusTone.PRIVACY
                        } else {
                            AuroraSystemStatusTone.NEUTRAL
                        },
                ),
            )
        }
}
