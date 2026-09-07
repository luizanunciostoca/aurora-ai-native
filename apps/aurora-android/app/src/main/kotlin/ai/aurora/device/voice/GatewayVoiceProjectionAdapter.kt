package ai.aurora.device.voice

import android.content.Context
import ai.aurora.device.capability.AndroidRuntimeCapabilityProbe
import ai.aurora.device.capability.NativeCapabilityBridge
import ai.aurora.device.capability.NativeRuntimeProbe
import ai.aurora.device.network.GatewayGovernedVoiceProjection

data class InstalledGatewayVoiceProjection(
    val bundle: GovernedVoiceProjectionBundle,
    val capabilityBridge: NativeCapabilityBridge,
)

/**
 * Converts the authenticated W14 wire projection into the existing W15-G read-only catalog model.
 *
 * The wire projection is still non-authoritative. Android recomputes current W15-C native
 * observations locally instead of trusting server claims about permissions/features. No W02/W07
 * authority object is accepted by this adapter.
 */
fun installableGatewayVoiceProjection(
    context: Context,
    projection: GatewayGovernedVoiceProjection,
    expectedTenantId: String,
    nowMs: () -> Long = { System.currentTimeMillis() },
    runtimeProbe: NativeRuntimeProbe = AndroidRuntimeCapabilityProbe(context, clockMs = nowMs),
): InstalledGatewayVoiceProjection {
    require(projection.activeTenantId == expectedTenantId) { "voice projection tenant mismatch" }
    val currentMs = nowMs()
    require(projection.registryObservedAtMs <= currentMs && currentMs < projection.registryExpiresAtMs) {
        "voice registry projection is not current"
    }
    require(
        projection.vocabularyObservedAtMs <= currentMs &&
            currentMs < projection.vocabularyExpiresAtMs,
    ) { "voice vocabulary projection is not current" }

    val capabilityBridge =
        NativeCapabilityBridge(
            bindings = projection.nativeBindings,
            runtimeProbe = runtimeProbe,
            nowMs = nowMs,
        )
    val nativeObservations = capabilityBridge.discoverAll()

    val bundle =
        GovernedVoiceProjectionBundle(
            activeTenantId = projection.activeTenantId,
            registry =
                W04VoiceCapabilityRegistryProjection(
                    registryKind = projection.registryKind,
                    registryVersion = projection.registryVersion,
                    observedAtMs = projection.registryObservedAtMs,
                    expiresAtMs = projection.registryExpiresAtMs,
                    provenance =
                        GovernedProjectionProvenance(
                            sourceRef = projection.registryProvenance.sourceRef,
                            contentSha256 = projection.registryProvenance.contentSha256,
                        ),
                    entries =
                        projection.entries.map { entry ->
                            W04VoiceCapabilityEntry(
                                capabilityId = entry.capabilityId,
                                tenantId = entry.tenantId,
                                supportedTargetKinds =
                                    entry.supportedTargetKinds.mapTo(mutableSetOf()) {
                                        W04VoiceCapabilityTargetKind.valueOf(it)
                                    },
                                currentAvailability =
                                    W04VoiceCapabilityAvailability.valueOf(entry.currentAvailability),
                                riskClass = W04VoiceCapabilityRiskClass.valueOf(entry.riskClass),
                                observedAtMs = entry.observedAtMs,
                                expiresAtMs = entry.expiresAtMs,
                            )
                        },
                ),
            vocabulary =
                W15GVoiceCommandVocabularyProjection(
                    vocabularyVersion = projection.vocabularyVersion,
                    observedAtMs = projection.vocabularyObservedAtMs,
                    expiresAtMs = projection.vocabularyExpiresAtMs,
                    provenance =
                        GovernedProjectionProvenance(
                            sourceRef = projection.vocabularyProvenance.sourceRef,
                            contentSha256 = projection.vocabularyProvenance.contentSha256,
                        ),
                    bindings =
                        projection.bindings.map { binding ->
                            W15GVoiceCommandBinding(
                                commandId = binding.commandId,
                                phrases = binding.phrases,
                                capabilityId = binding.capabilityId,
                            )
                        },
                ),
            nativeCapabilityObservations = nativeObservations,
        )

    val catalog = GovernedVoiceCommandCatalog({ bundle }, nowMs).snapshot()
    require(catalog is GovernedVoiceCatalogResult.Ready) { "voice projection is not locally usable" }
    return InstalledGatewayVoiceProjection(bundle, capabilityBridge)
}
