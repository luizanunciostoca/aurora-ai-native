package ai.aurora.device.voice

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceCapabilityInquiryTest {
    @Test
    fun boundedPortugueseInquiriesWorkWithWakeWordAndAccents() {
        assertTrue(VoiceCapabilityInquiryPolicy.matches("Aurora, quais comandos você sabe executar?"))
        assertTrue(VoiceCapabilityInquiryPolicy.matches("O que você pode fazer?"))
        assertTrue(VoiceCapabilityInquiryPolicy.matches("Quais são as suas capacidades?"))
        assertTrue(VoiceCapabilityInquiryPolicy.matches("Me diga quais comandos você sabe executar."))
        assertFalse(VoiceCapabilityInquiryPolicy.matches("aumente o volume"))
        assertFalse(VoiceCapabilityInquiryPolicy.matches("apague meus arquivos"))
        assertFalse(VoiceCapabilityInquiryPolicy.matches("quais comandos voce sabe executar agora e reinicie"))
    }

    @Test
    fun missingCatalogStillDescribesLocalReadsAndDoesNotClaimNativeAuthority() {
        val response =
            VoiceCapabilityInventory.describe(
                GovernedVoiceCatalogResult.Rejected(
                    GovernedVoiceCatalogRejection.PROJECTION_UNAVAILABLE,
                ),
                setOf("AUDIO_VOLUME_STEP_UP", "OPEN_VALIDATED_APP"),
            )

        assertTrue(response.display.contains("hora, data, bateria e volume de mídia"))
        assertTrue(response.display.contains("Nenhum comando governado"))
        assertTrue(response.display.contains("não está instalado nesta sessão"))
        assertTrue(response.display.contains("2 operações nativas registradas"))
        assertTrue(response.display.contains("previsto sem executor validado"))
        assertFalse(response.authorizesExecution)
        assertFalse(response.provesExecutionSuccess)
        assertFalse(response.retryAuthorized)
    }

    @Test
    fun currentCatalogSeparatesCurrentLowRiskFromBlockedCommandsWithoutGrant() {
        val response =
            VoiceCapabilityInventory.describe(
                ready(
                    available = setOf("audio.volume.set"),
                    commands =
                        listOf(
                            definition("volume-up", "audio.volume.set", VoiceCommandRisk.LOW),
                            definition("open-aurora", "app.open", VoiceCommandRisk.LOW, "abrir aurora"),
                            definition("remote-shell", "shell.execute", VoiceCommandRisk.HIGH),
                        ),
                ),
                setOf("AUDIO_VOLUME_STEP_UP", "OPEN_VALIDATED_APP", "OPEN_CAMERA"),
            )

        assertTrue(response.display.contains("posso solicitar ajustar o volume"))
        assertTrue(response.display.contains("Os comandos abrir a Aurora não estão habilitados agora"))
        assertTrue(response.display.contains("validação da sessão e autorização antes de executar"))
        assertTrue(response.display.contains("3 operações nativas registradas"))
        assertFalse(response.display.contains("remote-shell"))
        assertFalse(response.display.contains("shell.execute"))
        assertFalse(response.authorizesExecution)
        assertFalse(response.provesExecutionSuccess)
        assertFalse(response.retryAuthorized)
    }

    @Test
    fun availableOpenAuroraIsShownOnlyWhenCurrentProjectionOffersIt() {
        val response =
            VoiceCapabilityInventory.describe(
                ready(
                    available = setOf("app.open"),
                    commands =
                        listOf(
                            definition("open-aurora", "app.open", VoiceCommandRisk.LOW, "abrir aurora"),
                        ),
                ),
                emptySet(),
            )

        assertTrue(response.display.contains("posso solicitar abrir a Aurora"))
        assertTrue(response.display.contains("Não consegui verificar o registro"))
        assertFalse(response.authorizesExecution)
    }

    @Test
    fun staleOrInvalidCatalogNeverTurnsNativeBindingsIntoAvailableCommands() {
        val stale =
            VoiceCapabilityInventory.describe(
                GovernedVoiceCatalogResult.Rejected(
                    GovernedVoiceCatalogRejection.REGISTRY_NOT_CURRENT,
                ),
                setOf("AUDIO_VOLUME_STEP_UP"),
            )
        assertTrue(stale.display.contains("projeção autenticada do catálogo está vencida"))
        assertTrue(stale.display.contains("Nenhum comando governado"))
        assertFalse(stale.authorizesExecution)

        val invalid =
            VoiceCapabilityInventory.describe(
                GovernedVoiceCatalogResult.Rejected(
                    GovernedVoiceCatalogRejection.UNKNOWN_CAPABILITY_REFERENCE,
                ),
                emptySet(),
            )
        assertTrue(invalid.display.contains("não passou na validação"))
        assertFalse(invalid.retryAuthorized)
    }

    private fun ready(
        available: Set<String>,
        commands: List<VoiceCommandDefinition>,
    ): GovernedVoiceCatalogResult.Ready =
        GovernedVoiceCatalogResult.Ready(
            GovernedVoiceCatalogSnapshot(
                activeTenantId = "tenant-physical",
                registryVersion = "W04-test",
                registrySourceRef = "fixture:registry",
                registryContentSha256 = "a".repeat(64),
                vocabularyVersion = "W15G-test",
                vocabularySourceRef = "fixture:vocabulary",
                vocabularyContentSha256 = "b".repeat(64),
                commands = commands,
                availableCapabilityIds = available,
            ),
        )

    private fun definition(
        id: String,
        capability: String,
        risk: VoiceCommandRisk,
        phrase: String = "faca algo",
    ): VoiceCommandDefinition =
        VoiceCommandDefinition(
            commandId = id,
            phrases = setOf(phrase),
            capabilityId = capability,
            risk = risk,
        )
}
