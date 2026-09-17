package ai.aurora.device.voice

import ai.aurora.device.capability.NativeCapabilityAvailability
import ai.aurora.device.capability.NativeCapabilityBinding
import ai.aurora.device.capability.NativeRuntimeProbe
import ai.aurora.device.capability.NativeRuntimeSnapshot
import ai.aurora.device.network.GatewayGovernedVoiceProjection
import ai.aurora.device.network.GatewayProjectionProvenance
import ai.aurora.device.network.GatewayVoiceCapabilityEntry
import ai.aurora.device.network.GatewayVoiceCommandBinding
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class GatewayVoiceProjectionAdapterTest {
    @Test
    fun `current tenant-bound projection becomes ready catalog without authority`() {
        val installed =
            installableGatewayVoiceProjection(
                context = null,
                projection = projection(),
                expectedTenantId = TENANT_ID,
                nowMs = { NOW },
                runtimeProbe = availableRuntimeProbe(),
            )

        val catalog = GovernedVoiceCommandCatalog({ installed.bundle }, nowMs = { NOW }).snapshot()
        assertTrue(catalog is GovernedVoiceCatalogResult.Ready)
        catalog as GovernedVoiceCatalogResult.Ready
        assertEquals(setOf(CAPABILITY_ID), catalog.snapshot.availableCapabilityIds)
        assertEquals(COMMAND_ID, catalog.snapshot.commands.single().commandId)
        assertFalse(catalog.snapshot.authorizesExecution)
        assertTrue(installed.capabilityBridge.discover(CAPABILITY_ID).isAvailable)
    }

    @Test
    fun `tenant mismatch is rejected before local capability probing`() {
        var probeCalls = 0
        val probe =
            NativeRuntimeProbe {
                probeCalls += 1
                availableSnapshot()
            }

        assertRejected("tenant mismatch") {
            installableGatewayVoiceProjection(
                context = null,
                projection = projection(),
                expectedTenantId = "ten_01J11111111111111111111111",
                nowMs = { NOW },
                runtimeProbe = probe,
            )
        }
        assertEquals(0, probeCalls)
    }

    @Test
    fun `stale registry and vocabulary projections fail closed`() {
        assertRejected("registry projection is not current") {
            installableGatewayVoiceProjection(
                context = null,
                projection = projection(registryExpiresAtMs = NOW),
                expectedTenantId = TENANT_ID,
                nowMs = { NOW },
                runtimeProbe = availableRuntimeProbe(),
            )
        }
        assertRejected("vocabulary projection is not current") {
            installableGatewayVoiceProjection(
                context = null,
                projection = projection(vocabularyExpiresAtMs = NOW),
                expectedTenantId = TENANT_ID,
                nowMs = { NOW },
                runtimeProbe = availableRuntimeProbe(),
            )
        }
    }

    @Test
    fun `malformed target enum is rejected instead of widening local eligibility`() {
        val malformed =
            projection(
                entries =
                    listOf(
                        capabilityEntry(supportedTargetKinds = setOf("ARBITRARY_NATIVE_TARGET")),
                    ),
            )

        assertRejected(null) {
            installableGatewayVoiceProjection(
                context = null,
                projection = malformed,
                expectedTenantId = TENANT_ID,
                nowMs = { NOW },
                runtimeProbe = availableRuntimeProbe(),
            )
        }
    }

    @Test
    fun `stale local native observation keeps command unavailable without minting authority`() {
        val staleProbe =
            NativeRuntimeProbe {
                NativeRuntimeSnapshot(
                    observedAtMs = -1,
                    apiLevel = 35,
                    availableFeatures = emptySet(),
                    grantedPermissions = emptySet(),
                )
            }
        val installed =
            installableGatewayVoiceProjection(
                context = null,
                projection = projection(),
                expectedTenantId = TENANT_ID,
                nowMs = { NOW },
                runtimeProbe = staleProbe,
            )

        val native = installed.capabilityBridge.discover(CAPABILITY_ID)
        assertEquals(NativeCapabilityAvailability.STALE_RUNTIME_STATE, native.availability)
        val catalog = GovernedVoiceCommandCatalog({ installed.bundle }, nowMs = { NOW }).snapshot()
        assertTrue(catalog is GovernedVoiceCatalogResult.Ready)
        catalog as GovernedVoiceCatalogResult.Ready
        assertTrue(catalog.snapshot.availableCapabilityIds.isEmpty())
        assertFalse(catalog.snapshot.authorizesExecution)
    }

    private fun projection(
        registryExpiresAtMs: Long = 2_000,
        vocabularyExpiresAtMs: Long = 2_000,
        entries: List<GatewayVoiceCapabilityEntry> = listOf(capabilityEntry()),
    ) =
        GatewayGovernedVoiceProjection(
            activeTenantId = TENANT_ID,
            registryKind = "AURORA_CANONICAL_CAPABILITY_REGISTRY",
            registryVersion = "w04-dp5-v1",
            registryObservedAtMs = 900,
            registryExpiresAtMs = registryExpiresAtMs,
            registryProvenance = provenance("registry:w04:dp5"),
            entries = entries,
            vocabularyVersion = "w15g-dp5-v1",
            vocabularyObservedAtMs = 900,
            vocabularyExpiresAtMs = vocabularyExpiresAtMs,
            vocabularyProvenance = provenance("vocabulary:w15g:dp5"),
            bindings =
                listOf(
                    GatewayVoiceCommandBinding(
                        commandId = COMMAND_ID,
                        phrases = setOf("aumentar volume"),
                        capabilityId = CAPABILITY_ID,
                    ),
                ),
            nativeBindings =
                listOf(
                    NativeCapabilityBinding(
                        capabilityId = CAPABILITY_ID,
                        minApiLevel = 26,
                        maxSnapshotAgeMs = 30_000,
                    ),
                ),
        )

    private fun capabilityEntry(
        supportedTargetKinds: Set<String> = setOf("DEVICE"),
    ) =
        GatewayVoiceCapabilityEntry(
            capabilityId = CAPABILITY_ID,
            tenantId = TENANT_ID,
            supportedTargetKinds = supportedTargetKinds,
            currentAvailability = "CURRENT_AVAILABLE",
            riskClass = "LOW",
            observedAtMs = 900,
            expiresAtMs = 2_000,
        )

    private fun provenance(source: String) =
        GatewayProjectionProvenance(
            sourceRef = source,
            contentSha256 = "a".repeat(64),
        )

    private fun availableRuntimeProbe() = NativeRuntimeProbe { availableSnapshot() }

    private fun availableSnapshot() =
        NativeRuntimeSnapshot(
            observedAtMs = 950,
            apiLevel = 35,
            availableFeatures = emptySet(),
            grantedPermissions = emptySet(),
        )

    private fun assertRejected(messageFragment: String?, block: () -> Unit) {
        try {
            block()
            fail("projection must fail closed")
        } catch (error: IllegalArgumentException) {
            if (messageFragment != null) {
                assertTrue(error.message.orEmpty().contains(messageFragment))
            }
        }
    }

    private companion object {
        const val NOW = 1_000L
        const val TENANT_ID = "ten_01J00000000000000000000000"
        const val CAPABILITY_ID = "audio.volume.set"
        const val COMMAND_ID = "cmd_01J00000000000000000000000"
    }
}
