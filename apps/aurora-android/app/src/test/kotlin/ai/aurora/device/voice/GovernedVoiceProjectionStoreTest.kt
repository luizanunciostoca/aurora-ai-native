package ai.aurora.device.voice

import ai.aurora.device.capability.NativeCapabilityAvailability
import ai.aurora.device.capability.NativeCapabilityObservation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GovernedVoiceProjectionStoreTest {
    @Test
    fun `producer mutations after replace cannot alter stored atomic snapshot`() {
        val targets = mutableSetOf(W04VoiceCapabilityTargetKind.DEVICE)
        val phrases = mutableSetOf("open camera")
        val entries = mutableListOf(capability(targets))
        val bindings = mutableListOf(binding(phrases))
        val missingFeatures = mutableSetOf<String>()
        val native = mutableListOf(nativeObservation(missingFeatures))
        val store = GovernedVoiceProjectionStore()

        store.replace(bundle(entries, bindings, native))

        targets.clear()
        phrases.clear()
        entries.clear()
        bindings.clear()
        missingFeatures += "mutated.feature"
        native.clear()

        val stored = checkNotNull(store.current())
        assertEquals(1, stored.registry.entries.size)
        assertEquals(setOf(W04VoiceCapabilityTargetKind.DEVICE), stored.registry.entries.single().supportedTargetKinds)
        assertEquals(setOf("open camera"), stored.vocabulary.bindings.single().phrases)
        assertEquals(1, stored.nativeCapabilityObservations.size)
        assertTrue(stored.nativeCapabilityObservations.single().missingFeatures.isEmpty())
    }

    @Test
    fun `consumer mutations of returned copy cannot alter later reads`() {
        val store = GovernedVoiceProjectionStore()
        store.replace(
            bundle(
                entries = mutableListOf(capability(mutableSetOf(W04VoiceCapabilityTargetKind.DEVICE))),
                bindings = mutableListOf(binding(mutableSetOf("open camera"))),
                native = mutableListOf(nativeObservation(mutableSetOf())),
            ),
        )

        val first = checkNotNull(store.current())
        @Suppress("UNCHECKED_CAST")
        (first.registry.entries as MutableList<W04VoiceCapabilityEntry>).clear()
        @Suppress("UNCHECKED_CAST")
        (first.vocabulary.bindings as MutableList<W15GVoiceCommandBinding>).clear()

        val second = checkNotNull(store.current())
        assertEquals(1, second.registry.entries.size)
        assertEquals(1, second.vocabulary.bindings.size)
        assertFalse(second.registry.entries.isEmpty())
    }

    @Test
    fun `clear removes projection without creating fallback authority`() {
        val store = GovernedVoiceProjectionStore()
        store.replace(
            bundle(
                entries = mutableListOf(capability(mutableSetOf(W04VoiceCapabilityTargetKind.DEVICE))),
                bindings = mutableListOf(binding(mutableSetOf("open camera"))),
                native = mutableListOf(nativeObservation(mutableSetOf())),
            ),
        )

        store.clear()

        assertEquals(null, store.current())
    }

    private fun bundle(
        entries: MutableList<W04VoiceCapabilityEntry>,
        bindings: MutableList<W15GVoiceCommandBinding>,
        native: MutableList<NativeCapabilityObservation>,
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
                            sourceRef = "github:main/w04",
                            contentSha256 = REGISTRY_HASH,
                        ),
                    entries = entries,
                ),
            vocabulary =
                W15GVoiceCommandVocabularyProjection(
                    vocabularyVersion = "w15g-live.1",
                    observedAtMs = 900,
                    expiresAtMs = 2_000,
                    provenance =
                        GovernedProjectionProvenance(
                            sourceRef = "github:accepted/w15g",
                            contentSha256 = VOCABULARY_HASH,
                        ),
                    bindings = bindings,
                ),
            nativeCapabilityObservations = native,
        )

    private fun capability(
        targets: MutableSet<W04VoiceCapabilityTargetKind>,
    ): W04VoiceCapabilityEntry =
        W04VoiceCapabilityEntry(
            capabilityId = "camera.open",
            tenantId = "tenant-a",
            supportedTargetKinds = targets,
            currentAvailability = W04VoiceCapabilityAvailability.CURRENT_AVAILABLE,
            riskClass = W04VoiceCapabilityRiskClass.LOW,
            observedAtMs = 950,
            expiresAtMs = 1_500,
        )

    private fun binding(phrases: MutableSet<String>): W15GVoiceCommandBinding =
        W15GVoiceCommandBinding(
            commandId = "open-camera",
            phrases = phrases,
            capabilityId = "camera.open",
        )

    private fun nativeObservation(
        missingFeatures: MutableSet<String>,
    ): NativeCapabilityObservation =
        NativeCapabilityObservation(
            capabilityId = "camera.open",
            availability = NativeCapabilityAvailability.AVAILABLE,
            observedAtMs = 950,
            expiresAtMs = 1_500,
            missingFeatures = missingFeatures,
        )

    companion object {
        private const val REGISTRY_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        private const val VOCABULARY_HASH = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
}
