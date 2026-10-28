package ai.aurora.device.voice

/**
 * Bounded, read-only capability inquiry. This is intentionally independent of W07 ingress and
 * gateway bootstrap: an unavailable catalog must not prevent an honest answer about local reads.
 */
object VoiceCapabilityInquiryPolicy {
    private val inquiries =
        setOf(
            "quais comandos voce sabe executar",
            "quais comandos voce executa",
            "quais comandos voce conhece",
            "quais sao seus comandos",
            "quais sao os seus comandos",
            "que comandos voce sabe executar",
            "que comandos voce conhece",
            "o que voce pode fazer",
            "o que voce sabe fazer",
            "quais as suas capacidades",
            "quais sao suas capacidades",
            "quais sao as suas capacidades",
            "me diga quais comandos voce sabe executar",
            "me diga o que voce pode fazer",
        )

    fun matches(transcript: String): Boolean {
        val normalized = LocalDeviceReadPolicy.normalize(transcript)
        val withoutWake = normalized.removePrefix("aurora ").trim()
        return withoutWake in inquiries
    }
}

data class VoiceCapabilityInquiryResult(
    val display: String,
    val authorizesExecution: Boolean = false,
    val provesExecutionSuccess: Boolean = false,
    val retryAuthorized: Boolean = false,
) {
    init {
        require(display.isNotBlank())
        require(!authorizesExecution)
        require(!provesExecutionSuccess)
        require(!retryAuthorized)
    }
}

/**
 * The three groups describe independently verified facts:
 * - local reads and low-risk commands in the current W04/W15-G/W15-C projection;
 * - native ports or published commands that are not currently eligible;
 * - historical planned capabilities, which must never be inferred as executable.
 *
 * Even a current projection never proves the W14 session, a W07 grant, or execution success.
 */
object VoiceCapabilityInventory {
    fun describe(
        catalog: GovernedVoiceCatalogResult,
        registeredNativeActionIds: Set<String>,
    ): VoiceCapabilityInquiryResult {
        val snapshot = (catalog as? GovernedVoiceCatalogResult.Ready)?.snapshot
        val active =
            snapshot?.commands.orEmpty().filter { command ->
                command.risk == VoiceCommandRisk.LOW &&
                    command.capabilityId in snapshot?.availableCapabilityIds.orEmpty()
            }
        val unavailable = snapshot?.commands.orEmpty().filterNot { it in active }

        val liveDescription =
            if (active.isEmpty()) {
                "Nenhum comando governado está comprovadamente habilitado nesta sessão."
            } else {
                val names = recognizedLabels(active)
                if (names.isEmpty()) {
                    "Há comandos publicados e disponíveis no catálogo, mas sem descrição de voz validada. " +
                        "A execução continua sujeita a W14 e W07."
                } else {
                    "No catálogo atual, posso solicitar ${names.joinToString(", ")}, " +
                        "sempre com validação da sessão e autorização antes de executar."
                }
            }

        val unavailableDescription =
            when (catalog) {
                is GovernedVoiceCatalogResult.Rejected ->
                    when (catalog.reason) {
                        GovernedVoiceCatalogRejection.PROJECTION_UNAVAILABLE ->
                            "O catálogo autenticado não está instalado nesta sessão."
                        GovernedVoiceCatalogRejection.REGISTRY_NOT_CURRENT,
                        GovernedVoiceCatalogRejection.VOCABULARY_NOT_CURRENT,
                        -> "A projeção autenticada do catálogo está vencida."
                        else -> "A projeção autenticada do catálogo não passou na validação."
                    }
                is GovernedVoiceCatalogResult.Ready ->
                    if (unavailable.isEmpty()) {
                        "Não há outro comando publicado com indisponibilidade comprovada agora."
                    } else {
                        val names = recognizedLabels(unavailable)
                        if (names.isEmpty()) {
                            "Há ${unavailable.size} comandos publicados sem disponibilidade atual confirmada."
                        } else {
                            "Os comandos ${names.joinToString(", ")} não estão habilitados agora."
                        }
                    }
            }

        val nativeDescription =
            if (registeredNativeActionIds.isEmpty()) {
                "Não consegui verificar o registro de operações nativas desta instalação."
            } else {
                "O aplicativo possui ${registeredNativeActionIds.size} operações nativas registradas; " +
                    "isso, por si só, não as publica nem autoriza."
            }

        return VoiceCapabilityInquiryResult(
            "Chefe, categoria um, disponível agora: posso consultar hora, data, bateria e volume de mídia. " +
                "$liveDescription " +
                "Categoria dois, implementado mas dependente de disponibilidade, conexão ou autorização: " +
                "$unavailableDescription $nativeDescription " +
                "Categoria três, previsto sem executor validado: há capacidades no planejamento " +
                "que não posso apresentar como comandos executáveis nesta sessão.",
        )
    }

    private fun recognizedLabels(commands: List<VoiceCommandDefinition>): List<String> =
        commands.mapNotNull { command ->
            when (command.capabilityId) {
                "audio.volume.set" -> "ajustar o volume"
                "app.open" -> {
                    val opensAurora =
                        command.phrases.any {
                            LocalDeviceReadPolicy.normalize(it).let { phrase ->
                                phrase == "abrir aurora" || phrase == "abra a aurora"
                            }
                        }
                    if (opensAurora) "abrir a Aurora" else "abrir um aplicativo validado"
                }
                else -> null
            }
        }.distinct().sorted()
}
