package ai.aurora.device.voice

import ai.aurora.device.capability.NativeCapabilityAvailability
import ai.aurora.device.capability.NativeCapabilityObservation

const val W04_CANONICAL_CAPABILITY_REGISTRY_KIND = "AURORA_CANONICAL_CAPABILITY_REGISTRY"
private val SHA256_HEX = Regex("^[0-9a-f]{64}$")

enum class W04VoiceCapabilityTargetKind {
    PROVIDER,
    DEVICE,
    WORKFLOW,
    LOCAL_SERVICE,
    GATEWAY,
}

enum class W04VoiceCapabilityAvailability {
    CURRENT_AVAILABLE,
    CURRENT_DEGRADED,
    UNAVAILABLE,
    UNKNOWN,
    STALE,
}

enum class W04VoiceCapabilityRiskClass {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL,
}

/** Integrity/audit provenance only; this is neither authority nor permission. */
data class GovernedProjectionProvenance(
    val sourceRef: String,
    val contentSha256: String,
) {
    init {
        require(sourceRef.isNotBlank()) { "projection sourceRef must not be blank" }
        require(sourceRef.length <= MAX_SOURCE_REF_LENGTH) { "projection sourceRef is too long" }
        require(SHA256_HEX.matches(contentSha256)) {
            "projection contentSha256 must be lowercase 64-hex SHA-256"
        }
    }

    companion object {
        private const val MAX_SOURCE_REF_LENGTH = 512
    }
}

/**
 * Read-only Android projection of one already-canonical W04 capability descriptor. The producer
 * must authenticate and reconcile the upstream W04 source before constructing this object.
 */
data class W04VoiceCapabilityEntry(
    val capabilityId: String,
    val tenantId: String? = null,
    val supportedTargetKinds: Set<W04VoiceCapabilityTargetKind>,
    val currentAvailability: W04VoiceCapabilityAvailability,
    val riskClass: W04VoiceCapabilityRiskClass,
    val observedAtMs: Long,
    val expiresAtMs: Long,
) {
    init {
        require(capabilityId.isNotBlank()) { "capabilityId must not be blank" }
        require(tenantId == null || tenantId.isNotBlank()) { "tenantId must be null or non-blank" }
        require(supportedTargetKinds.isNotEmpty()) { "supportedTargetKinds must not be empty" }
        require(observedAtMs >= 0) { "observedAtMs must be non-negative" }
        require(expiresAtMs > observedAtMs) { "expiresAtMs must follow observedAtMs" }
    }
}

data class W04VoiceCapabilityRegistryProjection(
    val registryKind: String,
    val registryVersion: String,
    val observedAtMs: Long,
    val expiresAtMs: Long,
    val provenance: GovernedProjectionProvenance,
    val entries: List<W04VoiceCapabilityEntry>,
) {
    init {
        require(registryKind.isNotBlank()) { "registryKind must not be blank" }
        require(registryVersion.isNotBlank()) { "registryVersion must not be blank" }
        require(observedAtMs >= 0) { "observedAtMs must be non-negative" }
        require(expiresAtMs > observedAtMs) { "expiresAtMs must follow observedAtMs" }
    }
}

/** W15-G command vocabulary may reference W04 ids but can never create missing capabilities. */
data class W15GVoiceCommandBinding(
    val commandId: String,
    val phrases: Set<String>,
    val capabilityId: String,
) {
    init {
        require(commandId.isNotBlank()) { "commandId must not be blank" }
        require(capabilityId.isNotBlank()) { "capabilityId must not be blank" }
        require(phrases.isNotEmpty()) { "phrases must not be empty" }
        require(phrases.all { it.isNotBlank() }) { "phrases must not contain blank values" }
    }
}

data class W15GVoiceCommandVocabularyProjection(
    val vocabularyVersion: String,
    val observedAtMs: Long,
    val expiresAtMs: Long,
    val provenance: GovernedProjectionProvenance,
    val bindings: List<W15GVoiceCommandBinding>,
) {
    init {
        require(vocabularyVersion.isNotBlank()) { "vocabularyVersion must not be blank" }
        require(observedAtMs >= 0) { "observedAtMs must be non-negative" }
        require(expiresAtMs > observedAtMs) { "expiresAtMs must follow observedAtMs" }
    }
}

/**
 * One atomically reconciled projection bundle from current W04 + governed W15-G vocabulary +
 * current W15-C observations. None of these inputs are action authority.
 */
data class GovernedVoiceProjectionBundle(
    val activeTenantId: String,
    val registry: W04VoiceCapabilityRegistryProjection,
    val vocabulary: W15GVoiceCommandVocabularyProjection,
    val nativeCapabilityObservations: List<NativeCapabilityObservation>,
) {
    init {
        require(activeTenantId.isNotBlank()) { "activeTenantId must not be blank" }
        require(activeTenantId.length <= 256) { "activeTenantId is too long" }
    }
}

/** Thread-safe projection store. Authority artifacts must never be stored here. */
class GovernedVoiceProjectionStore {
    @Volatile
    private var bundle: GovernedVoiceProjectionBundle? = null

    fun replace(projection: GovernedVoiceProjectionBundle) {
        bundle = projection.frozenCopy()
    }

    fun clear() {
        bundle = null
    }

    fun current(): GovernedVoiceProjectionBundle? = bundle?.frozenCopy()
}

data class GovernedVoiceCatalogSnapshot(
    val activeTenantId: String,
    val registryVersion: String,
    val registrySourceRef: String,
    val registryContentSha256: String,
    val vocabularyVersion: String,
    val vocabularySourceRef: String,
    val vocabularyContentSha256: String,
    val commands: List<VoiceCommandDefinition>,
    val availableCapabilityIds: Set<String>,
    val authorizesExecution: Boolean = false,
) {
    init {
        require(activeTenantId.isNotBlank())
        require(registryVersion.isNotBlank())
        require(registrySourceRef.isNotBlank())
        require(SHA256_HEX.matches(registryContentSha256))
        require(vocabularyVersion.isNotBlank())
        require(vocabularySourceRef.isNotBlank())
        require(SHA256_HEX.matches(vocabularyContentSha256))
        require(!authorizesExecution) { "voice catalog projection cannot authorize execution" }
    }
}

enum class GovernedVoiceCatalogRejection {
    PROJECTION_UNAVAILABLE,
    INVALID_REGISTRY_KIND,
    REGISTRY_NOT_CURRENT,
    VOCABULARY_NOT_CURRENT,
    DUPLICATE_CAPABILITY_ID,
    DUPLICATE_NATIVE_OBSERVATION,
    DUPLICATE_COMMAND_ID,
    UNKNOWN_CAPABILITY_REFERENCE,
}

sealed interface GovernedVoiceCatalogResult {
    data class Ready(val snapshot: GovernedVoiceCatalogSnapshot) : GovernedVoiceCatalogResult
    data class Rejected(val reason: GovernedVoiceCatalogRejection) : GovernedVoiceCatalogResult
}

/**
 * Converts authenticated/reconciled projections into the accepted W15-G classifier vocabulary.
 * A capability is locally eligible only when W04 and W15-C observations are both current and the
 * capability is current/available for DEVICE in the active tenant. Eligibility is not authority.
 */
class GovernedVoiceCommandCatalog(
    private val projectionProvider: () -> GovernedVoiceProjectionBundle?,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    fun snapshot(): GovernedVoiceCatalogResult {
        val projection =
            runCatching(projectionProvider).getOrNull()
                ?: return GovernedVoiceCatalogResult.Rejected(
                    GovernedVoiceCatalogRejection.PROJECTION_UNAVAILABLE,
                )
        val now = nowMs()
        val registry = projection.registry
        val vocabulary = projection.vocabulary

        if (registry.registryKind != W04_CANONICAL_CAPABILITY_REGISTRY_KIND) {
            return GovernedVoiceCatalogResult.Rejected(
                GovernedVoiceCatalogRejection.INVALID_REGISTRY_KIND,
            )
        }
        if (!isCurrent(registry.observedAtMs, registry.expiresAtMs, now)) {
            return GovernedVoiceCatalogResult.Rejected(
                GovernedVoiceCatalogRejection.REGISTRY_NOT_CURRENT,
            )
        }
        if (!isCurrent(vocabulary.observedAtMs, vocabulary.expiresAtMs, now)) {
            return GovernedVoiceCatalogResult.Rejected(
                GovernedVoiceCatalogRejection.VOCABULARY_NOT_CURRENT,
            )
        }
        if (hasDuplicates(registry.entries.map { it.capabilityId })) {
            return GovernedVoiceCatalogResult.Rejected(
                GovernedVoiceCatalogRejection.DUPLICATE_CAPABILITY_ID,
            )
        }
        if (hasDuplicates(projection.nativeCapabilityObservations.map { it.capabilityId })) {
            return GovernedVoiceCatalogResult.Rejected(
                GovernedVoiceCatalogRejection.DUPLICATE_NATIVE_OBSERVATION,
            )
        }
        if (hasDuplicates(vocabulary.bindings.map { it.commandId })) {
            return GovernedVoiceCatalogResult.Rejected(
                GovernedVoiceCatalogRejection.DUPLICATE_COMMAND_ID,
            )
        }

        val entriesById = registry.entries.associateBy { it.capabilityId }
        if (vocabulary.bindings.any { it.capabilityId !in entriesById }) {
            return GovernedVoiceCatalogResult.Rejected(
                GovernedVoiceCatalogRejection.UNKNOWN_CAPABILITY_REFERENCE,
            )
        }
        val nativeById = projection.nativeCapabilityObservations.associateBy { it.capabilityId }

        val availableIds =
            registry.entries
                .asSequence()
                .filter { it.tenantId == null || it.tenantId == projection.activeTenantId }
                .filter { W04VoiceCapabilityTargetKind.DEVICE in it.supportedTargetKinds }
                .filter { it.currentAvailability == W04VoiceCapabilityAvailability.CURRENT_AVAILABLE }
                .filter { isCurrent(it.observedAtMs, it.expiresAtMs, now) }
                .filter { entry ->
                    val native = nativeById[entry.capabilityId] ?: return@filter false
                    native.availability == NativeCapabilityAvailability.AVAILABLE &&
                        native.capabilityId == entry.capabilityId &&
                        isCurrent(native.observedAtMs, native.expiresAtMs, now)
                }.map { it.capabilityId }
                .toSet()

        val commands =
            vocabulary.bindings.map { binding ->
                val capability = checkNotNull(entriesById[binding.capabilityId])
                VoiceCommandDefinition(
                    commandId = binding.commandId,
                    phrases = binding.phrases.toSet(),
                    capabilityId = binding.capabilityId,
                    risk =
                        if (capability.riskClass == W04VoiceCapabilityRiskClass.LOW) {
                            VoiceCommandRisk.LOW
                        } else {
                            VoiceCommandRisk.HIGH
                        },
                )
            }

        return GovernedVoiceCatalogResult.Ready(
            GovernedVoiceCatalogSnapshot(
                activeTenantId = projection.activeTenantId,
                registryVersion = registry.registryVersion,
                registrySourceRef = registry.provenance.sourceRef,
                registryContentSha256 = registry.provenance.contentSha256,
                vocabularyVersion = vocabulary.vocabularyVersion,
                vocabularySourceRef = vocabulary.provenance.sourceRef,
                vocabularyContentSha256 = vocabulary.provenance.contentSha256,
                commands = commands.toList(),
                availableCapabilityIds = availableIds.toSet(),
            ),
        )
    }

    private fun isCurrent(observedAtMs: Long, expiresAtMs: Long, now: Long): Boolean =
        observedAtMs >= 0 && observedAtMs <= now && now < expiresAtMs

    private fun hasDuplicates(values: List<String>): Boolean = values.toSet().size != values.size
}

private fun GovernedVoiceProjectionBundle.frozenCopy(): GovernedVoiceProjectionBundle =
    copy(
        registry =
            registry.copy(
                entries =
                    registry.entries.map { entry ->
                        entry.copy(supportedTargetKinds = entry.supportedTargetKinds.toSet())
                    },
            ),
        vocabulary =
            vocabulary.copy(
                bindings =
                    vocabulary.bindings.map { binding ->
                        binding.copy(phrases = binding.phrases.toSet())
                    },
            ),
        nativeCapabilityObservations =
            nativeCapabilityObservations.map { observation ->
                observation.copy(
                    missingFeatures = observation.missingFeatures.toSet(),
                    missingPermissions = observation.missingPermissions.toSet(),
                )
            },
    )
