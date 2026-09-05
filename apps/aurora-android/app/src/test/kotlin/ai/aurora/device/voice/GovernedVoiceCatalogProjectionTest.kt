package ai.aurora.device.voice

import ai.aurora.device.capability.NativeCapabilityAvailability
import ai.aurora.device.capability.NativeCapabilityObservation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GovernedVoiceCatalogProjectionTest {
    private val nowMs = 1_000L

    @Test
    fun unavailableProjectionFailsClosed() {
        val result = GovernedVoiceCommandCatalog({ null }, nowMs = { nowMs }).snapshot()

        val rejected = result as GovernedVoiceCatalogResult.Rejected
        assertEquals(GovernedVoiceCatalogRejection.PROJECTION_UNAVAILABLE, rejected.reason)
    }

    @Test
    fun onlyCurrentTenantMatchedDeviceCapabilityWithNativeObservationBecomesAvailable() {
        val result = catalog(bundle()).snapshot() as GovernedVoiceCatalogResult.Ready

        assertEquals(setOf("camera.open"), result.snapshot.availableCapabilityIds)
        assertEquals(1, result.snapshot.commands.size)
        assertEquals(VoiceCommandRisk.LOW, result.snapshot.commands.single().risk)
        assertEquals("github:main/packages/registries/capabilities@w04-live.1", result.snapshot.registrySourceRef)
        assertEquals(REGISTRY_HASH, result.snapshot.registryContentSha256)
        assertEquals("github:accepted/W15-G/vocabulary@w15g-live.1", result.snapshot.vocabularySourceRef)
        assertEquals(VOCABULARY_HASH, result.snapshot.vocabularyContentSha256)
        assertFalse(result.snapshot.authorizesExecution)
    }

    @Test
    fun invalidProjectionHashIsRejectedAtConstructionBoundary() {
        val failure = runCatching {
            GovernedProjectionProvenance(
                sourceRef = "github:main/w04",
                contentSha256 = "not-a-sha256",
            )
        }

        assertTrue(failure.isFailure)
    }

    @Test
    fun canonicalCapabilityWithoutCurrentNativeObservationCannotEnterAvailableSet() {
        val projection = bundle().copy(nativeCapabilityObservations = emptyList())
        val result = catalog(projection).snapshot() as GovernedVoiceCatalogResult.Ready

        assertTrue(result.snapshot.availableCapabilityIds.isEmpty())
        assertEquals("camera.open", result.snapshot.commands.single().capabilityId)
    }

    @Test
    fun tenantMismatchFailsCapabilityAvailabilityClosed() {
        val entry = capability(tenantId = "tenant-other")
        val projection = bundle().copy(registry = registry(entries = listOf(entry)))
        val result = catalog(projection).snapshot() as GovernedVoiceCatalogResult.Ready

        assertTrue(result.snapshot.availableCapabilityIds.isEmpty())
    }

    @Test
    fun nonLowCanonicalRiskIsMappedHighSoVoiceFastPathMustEscalate() {
        val entry = capability(risk = W04VoiceCapabilityRiskClass.MEDIUM)
        val projection = bundle().copy(registry = registry(entries = listOf(entry)))
        val result = catalog(projection).snapshot() as GovernedVoiceCatalogResult.Ready

        assertEquals(VoiceCommandRisk.HIGH, result.snapshot.commands.single().risk)
    }

    @Test
    fun staleRegistryRejectsEntireCatalog() {
        val projection = bundle().copy(
            registry = registry(entries = listOf(capability())).copy(expiresAtMs = nowMs),
        )
        val result = catalog(projection).snapshot() as GovernedVoiceCatalogResult.Rejected

        assertEquals(GovernedVoiceCatalogRejection.REGISTRY_NOT_CURRENT, result.reason)
    }

    @Test
    fun unknownCapabilityReferenceRejectsEntireCatalogInsteadOfInventingCapability() {
        val vocabulary =
            vocabulary(
                bindings =
                    listOf(
                        W15GVoiceCommandBinding(
                            commandId = "unknown-command",
                            phrases = setOf("do unknown thing"),
                            capabilityId = "device.unknown",
                        ),
                    ),
            )
        val result = catalog(bundle().copy(vocabulary = vocabulary)).snapshot()
            as GovernedVoiceCatalogResult.Rejected

        assertEquals(GovernedVoiceCatalogRejection.UNKNOWN_CAPABILITY_REFERENCE, result.reason)
    }

    @Test
    fun duplicateCapabilityOrNativeObservationRejectsWholeProjection() {
        val duplicateCapability =
            bundle().copy(
                registry = registry(entries = listOf(capability(), capability())),
            )
        val capabilityResult = catalog(duplicateCapability).snapshot()
            as GovernedVoiceCatalogResult.Rejected
        assertEquals(GovernedVoiceCatalogRejection.DUPLICATE_CAPABILITY_ID, capabilityResult.reason)

        val duplicateNative =
            bundle().copy(
                nativeCapabilityObservations = listOf(nativeObservation(), nativeObservation()),
            )
        val nativeResult = catalog(duplicateNative).snapshot()
            as GovernedVoiceCatalogResult.Rejected
        assertEquals(GovernedVoiceCatalogRejection.DUPLICATE_NATIVE_OBSERVATION, nativeResult.reason)
    }

    @Test
    fun degradedCanonicalOrStaleNativeStateNeverBecomesAvailable() {
        val degraded = capability(availability = W04VoiceCapabilityAvailability.CURRENT_DEGRADED)
        val degradedResult =
            catalog(bundle().copy(registry = registry(entries = listOf(degraded)))).snapshot()
                as GovernedVoiceCatalogResult.Ready
        assertTrue(degradedResult.snapshot.availableCapabilityIds.isEmpty())

        val staleNative = nativeObservation().copy(expiresAtMs = nowMs)
        val staleResult =
            catalog(bundle().copy(nativeCapabilityObservations = listOf(staleNative))).snapshot()
                as GovernedVoiceCatalogResult.Ready
        assertTrue(staleResult.snapshot.availableCapabilityIds.isEmpty())
    }

    private fun catalog(bundle: GovernedVoiceProjectionBundle): GovernedVoiceCommandCatalog =
        GovernedVoiceCommandCatalog(
            projectionProvider = { bundle },
            nowMs = { nowMs },
        )

    private fun bundle(): GovernedVoiceProjectionBundle =
        GovernedVoiceProjectionBundle(
            activeTenantId = "tenant-a",
            registry = registry(entries = listOf(capability())),
            vocabulary = vocabulary(),
            nativeCapabilityObservations = listOf(nativeObservation()),
        )

    private fun registry(
        entries: List<W04VoiceCapabilityEntry>,
    ): W04VoiceCapabilityRegistryProjection =
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
            entries = entries,
        )

    private fun vocabulary(
        bindings: List<W15GVoiceCommandBinding> =
            listOf(
                W15GVoiceCommandBinding(
                    commandId = "open-camera",
                    phrases = setOf("open camera"),
                    capabilityId = "camera.open",
                ),
            ),
    ): W15GVoiceCommandVocabularyProjection =
        W15GVoiceCommandVocabularyProjection(
            vocabularyVersion = "w15g-live.1",
            observedAtMs = 900,
            expiresAtMs = 2_000,
            provenance =
                GovernedProjectionProvenance(
                    sourceRef = "github:accepted/W15-G/vocabulary@w15g-live.1",
                    contentSha256 = VOCABULARY_HASH,
                ),
            bindings = bindings,
        )

    private fun capability(
        tenantId: String? = "tenant-a",
        availability: W04VoiceCapabilityAvailability = W04VoiceCapabilityAvailability.CURRENT_AVAILABLE,
        risk: W04VoiceCapabilityRiskClass = W04VoiceCapabilityRiskClass.LOW,
    ): W04VoiceCapabilityEntry =
        W04VoiceCapabilityEntry(
            capabilityId = "camera.open",
            tenantId = tenantId,
            supportedTargetKinds = setOf(W04VoiceCapabilityTargetKind.DEVICE),
            currentAvailability = availability,
            riskClass = risk,
            observedAtMs = 950,
            expiresAtMs = 1_500,
        )

    private fun nativeObservation(): NativeCapabilityObservation =
        NativeCapabilityObservation(
            capabilityId = "camera.open",
            availability = NativeCapabilityAvailability.AVAILABLE,
            observedAtMs = 950,
            expiresAtMs = 1_500,
        )

    companion object {
        private const val REGISTRY_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        private const val VOCABULARY_HASH = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
}
