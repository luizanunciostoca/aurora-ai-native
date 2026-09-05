package ai.aurora.device.voice

import ai.aurora.device.capability.NativeCapabilityAvailability
import ai.aurora.device.capability.NativeCapabilityObservation

const val W04_CANONICAL_CAPABILITY_REGISTRY_KIND = "AURORA_CANONICAL_CAPABILITY_REGISTRY"

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

/**
 * Read-only Android projection of one already-canonical W04 capability descriptor.
 *
 * This type deliberately cannot create capability truth. A producer must first validate/parse the
 * canonical W04 registry and then project only the fields W15-G needs for deterministic routing.
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
    val entries: List<W04VoiceCapabilityEntry>,
) {
    init {
        require(registryKind.isNotBlank()) { "registryKind must not be blank" }
        require(registryVersion.isNotBlank()) { "registryVersion must not be blank" }
        require(observedAtMs >= 0) { "observedAtMs must be non-negative" }
        require(expiresAtMs > observedAtMs) { "expiresAtMs must follow observedAtMs" }
    }
}

/**
 * Explicit W15-G command vocabulary projection.
 *
 * Phrase ownership remains W15-G governance. Capability ids are references to W04; this projection
 * cannot add a capability that is absent from the supplied canonical W04 registry projection.
 */
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
    val bindings: List<W15GVoiceCommandBinding>,
) {
    init {
        require(vocabularyVersion.isNotBlank()) { "vocabularyVersion must not be blank" }
        require(observedAtMs >= 0) { "observedAtMs must be non-negative" }
        require(expiresAtMs > observedAtMs) { "expiresAtMs must follow observedAtMs" }
    }
}

/**
 * One atomically-reconciled projection bundle for the wake fast path.
 *
 * The bundle must be produced from current W04 + governed W15-G vocabulary + W15-C native
 * observations for exactly one active tenant. None of those inputs are authority.
 */
data class GovernedVoiceProjectionBundle(
    val activeTenantId: String,
    val registry: W04VoiceCapabilityRegistryProjection,
    val vocabulary: W15GVoiceCommandVocabularyProjection,
    val nativeCapabilityObservations: List<NativeCapabilityObservation>,
) {
    init {
        require(activeTenantId.isNotBlank()) { "activeTenantId must not be blank" }
    }
}

/** Thread-safe composition point. It stores projections only and never stores authority tokens. */
class GovernedVoiceProjectionStore {
    @Volatile
    private var bundle: GovernedVoiceProjectionBundle? = null

    fun replace(projection: GovernedVoiceProjectionBundle) {
        bundle = projection
    }

    fun clear() {
        bundle = null
    }

    fun current(): GovernedVoiceProjectionBundle? = bundle
}

data class GovernedVoiceCatalogSnapshot(
    val activeTenantId: String,
    val registryVersion: String,
    val vocabularyVersion: String,
    val commands: List<VoiceCommandDefinition>,
    val availableCapabilityIds: Set<String>,
    val authorizesExecution: Boolean = false,
) {
    init {
        require(activeTenantId.isNotBlank())
        require(registryVersion.isNotBlank())
        require(vocabularyVersion.isNotBlank())
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
    data class Ready(
        val snapshot: GovernedVoiceCatalogSnapshot,
    ) : GovernedVoiceCatalogResult

    data class Rejected(
        val reason: GovernedVoiceCatalogRejection,
    ) : GovernedVoiceCatalogResult
}

/**
 * Projects governed W04/W15-C/W15-G inputs into the existing accepted VoiceFastPath vocabulary.
 *
 * A capability reaches [availableCapabilityIds] only when all of the following are true at the same
 * instant: canonical W04 registry is current, capability is current/available for DEVICE, tenant
 * scope matches, and the W15-C Android-native observation is current and AVAILABLE. Medium/high/
 * critical W04 risk is conservatively mapped to HIGH so W15-G escalates it instead of dispatching.
 */
class GovernedVoiceCommandCatalog(
    private val projectionProvider: () -> GovernedVoiceProjectionBundle?,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    fun snapshot(): GovernedVoiceCatalogResult {
        val projection = runCatching(projectionProvider).getOrNull()
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
                }
                .map { it.capabilityId }
                .toSet()

        val commands =
            vocabulary.bindings.map { binding ->
                val capability = checkNotNull(entriesById[binding.capabilityId])
                VoiceCommandDefinition(
                    commandId = binding.commandId,
                    phrases = binding.phrases,
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
                vocabularyVersion = vocabulary.vocabularyVersion,
                commands = commands,
                availableCapabilityIds = availableIds,
            ),
        )
    }

    private fun isCurrent(observedAtMs: Long, expiresAtMs: Long, now: Long): Boolean =
        observedAtMs >= 0 && observedAtMs <= now && now < expiresAtMs

    private fun hasDuplicates(values: List<String>): Boolean = values.toSet().size != values.size
}
