package ai.aurora.device.voice

import ai.aurora.device.capability.NativeCapabilityAvailability
import ai.aurora.device.capability.NativeCapabilityObservation
import ai.aurora.device.lifecycle.AppVisibility
import ai.aurora.device.permission.RuntimePermissionObservation
import ai.aurora.device.permission.RuntimePermissionRequirement
import ai.aurora.device.permission.RuntimePermissionState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WakeGovernedFastPathIntegrationTest {
    private val nowMs = 1_000L

    @Test
    fun `current low risk device projection can reach W07 evaluation but cannot authorize execution`() {
        var submitted: VoiceDispatchCandidate? = null
        val catalog = catalog(bundle())
        val router =
            WakeVoiceFastPathRouter(
                inputProvider = { inputsFrom(catalog) },
                authorityIngress = W07VoiceAuthorityIngress { candidate ->
                    submitted = candidate
                    W07VoiceAuthorityIngressResult.AcceptedForEvaluation
                },
                nowMs = { nowMs },
            )

        val route = router.route("open camera", 0.99) as WakeVoiceRoute.AuthoritySubmitted

        assertEquals("camera.open", route.dispatch.capabilityId)
        assertTrue(route.dispatch.requiresW07Authorization)
        assertFalse(route.dispatch.authorizesExecution)
        assertEquals(route.dispatch, submitted)
    }

    @Test
    fun `medium canonical risk escalates before W07 ingress`() {
        var ingressCalls = 0
        val projection = bundle(risk = W04VoiceCapabilityRiskClass.MEDIUM)
        val router =
            WakeVoiceFastPathRouter(
                inputProvider = { inputsFrom(catalog(projection)) },
                authorityIngress = W07VoiceAuthorityIngress {
                    ingressCalls += 1
                    W07VoiceAuthorityIngressResult.AcceptedForEvaluation
                },
                nowMs = { nowMs },
            )

        val fallback = router.route("open camera", 0.99) as WakeVoiceRoute.ConversationFallback

        assertEquals(WakeVoiceFallbackReason.FAST_PATH_ESCALATED, fallback.reason)
        assertEquals(0, ingressCalls)
    }

    @Test
    fun `stale native capability never reaches W07 ingress`() {
        var ingressCalls = 0
        val staleNative = nativeObservation().copy(expiresAtMs = nowMs)
        val projection = bundle().copy(nativeCapabilityObservations = listOf(staleNative))
        val router =
            WakeVoiceFastPathRouter(
                inputProvider = { inputsFrom(catalog(projection)) },
                authorityIngress = W07VoiceAuthorityIngress {
                    ingressCalls += 1
                    W07VoiceAuthorityIngressResult.AcceptedForEvaluation
                },
                nowMs = { nowMs },
            )

        val fallback = router.route("open camera", 0.99) as WakeVoiceRoute.ConversationFallback

        assertEquals(WakeVoiceFallbackReason.FAST_PATH_ESCALATED, fallback.reason)
        val decision = fallback.decision as VoiceFastPathDecision.Escalated
        assertEquals(VoiceEscalationReason.CAPABILITY_NOT_AVAILABLE, decision.reason)
        assertEquals(0, ingressCalls)
    }

    @Test
    fun `absent governed projection stays in conversation and never calls W07`() {
        var ingressCalls = 0
        val catalog = GovernedVoiceCommandCatalog({ null }, nowMs = { nowMs })
        val router =
            WakeVoiceFastPathRouter(
                inputProvider = { inputsFrom(catalog) },
                authorityIngress = W07VoiceAuthorityIngress {
                    ingressCalls += 1
                    W07VoiceAuthorityIngressResult.AcceptedForEvaluation
                },
                nowMs = { nowMs },
            )

        val fallback = router.route("open camera", 0.99) as WakeVoiceRoute.ConversationFallback

        assertEquals(WakeVoiceFallbackReason.COMMAND_CATALOG_UNAVAILABLE, fallback.reason)
        assertEquals(0, ingressCalls)
    }

    private fun inputsFrom(catalog: GovernedVoiceCommandCatalog): WakeVoiceFastPathInputs =
        when (val result = catalog.snapshot()) {
            is GovernedVoiceCatalogResult.Ready ->
                WakeVoiceFastPathInputs(
                    commands = result.snapshot.commands,
                    context = context(result.snapshot.availableCapabilityIds),
                    registryVersion = result.snapshot.registryVersion,
                    vocabularyVersion = result.snapshot.vocabularyVersion,
                )
            is GovernedVoiceCatalogResult.Rejected ->
                WakeVoiceFastPathInputs(
                    commands = emptyList(),
                    context = context(emptySet()),
                )
        }

    private fun catalog(bundle: GovernedVoiceProjectionBundle): GovernedVoiceCommandCatalog =
        GovernedVoiceCommandCatalog({ bundle }, nowMs = { nowMs })

    private fun bundle(
        risk: W04VoiceCapabilityRiskClass = W04VoiceCapabilityRiskClass.LOW,
    ): GovernedVoiceProjectionBundle =
        GovernedVoiceProjectionBundle(
            activeTenantId = "tenant-a",
            registry =
                W04VoiceCapabilityRegistryProjection(
                    registryKind = W04_CANONICAL_CAPABILITY_REGISTRY_KIND,
                    registryVersion = "w04-live.1",
                    observedAtMs = 900,
                    expiresAtMs = 2_000,
                    provenance =
                        GovernedProjectionProvenance(
                            sourceRef = "github:main/packages/registries/capabilities@w04-live.1",
                            contentSha256 = REGISTRY_HASH,
                        ),
                    entries =
                        listOf(
                            W04VoiceCapabilityEntry(
                                capabilityId = "camera.open",
                                tenantId = "tenant-a",
                                supportedTargetKinds = setOf(W04VoiceCapabilityTargetKind.DEVICE),
                                currentAvailability = W04VoiceCapabilityAvailability.CURRENT_AVAILABLE,
                                riskClass = risk,
                                observedAtMs = 950,
                                expiresAtMs = 1_500,
                            ),
                        ),
                ),
            vocabulary =
                W15GVoiceCommandVocabularyProjection(
                    vocabularyVersion = "w15g-live.1",
                    observedAtMs = 900,
                    expiresAtMs = 2_000,
                    provenance =
                        GovernedProjectionProvenance(
                            sourceRef = "github:accepted/W15-G/vocabulary@w15g-live.1",
                            contentSha256 = VOCABULARY_HASH,
                        ),
                    bindings =
                        listOf(
                            W15GVoiceCommandBinding(
                                commandId = "open-camera",
                                phrases = setOf("open camera"),
                                capabilityId = "camera.open",
                            ),
                        ),
                ),
            nativeCapabilityObservations = listOf(nativeObservation()),
        )

    private fun nativeObservation(): NativeCapabilityObservation =
        NativeCapabilityObservation(
            capabilityId = "camera.open",
            availability = NativeCapabilityAvailability.AVAILABLE,
            observedAtMs = 950,
            expiresAtMs = 1_500,
        )

    private fun context(available: Set<String>): VoiceFastPathContext =
        VoiceFastPathContext(
            appVisibility = AppVisibility.FOREGROUND,
            microphonePermission =
                RuntimePermissionObservation(
                    requirement = RuntimePermissionRequirement("android.permission.RECORD_AUDIO"),
                    state = RuntimePermissionState.GRANTED,
                    observedAtMs = 950,
                    expiresAtMs = 1_500,
                    shouldShowRationale = false,
                ),
            availableCapabilityIds = available,
            privacyModeEnabled = false,
        )

    companion object {
        private const val REGISTRY_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        private const val VOCABULARY_HASH = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
}
