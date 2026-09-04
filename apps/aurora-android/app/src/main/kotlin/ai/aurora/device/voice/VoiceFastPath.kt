package ai.aurora.device.voice

import ai.aurora.device.lifecycle.AppVisibility
import ai.aurora.device.permission.RuntimePermissionObservation
import ai.aurora.device.permission.RuntimePermissionState

/** Static eligibility vocabulary only. Actual action risk/policy authority remains W02/W07-owned. */
enum class VoiceCommandRisk {
    LOW,
    HIGH,
}

data class VoiceCommandDefinition(
    val commandId: String,
    val phrases: Set<String>,
    val capabilityId: String,
    val risk: VoiceCommandRisk,
) {
    init {
        require(commandId.isNotBlank()) { "commandId must not be blank" }
        require(capabilityId.isNotBlank()) { "capabilityId must not be blank" }
        require(phrases.isNotEmpty()) { "at least one deterministic phrase is required" }
        require(phrases.all { normalizeVoicePhrase(it).isNotBlank() }) {
            "voice phrases must not normalize to blank"
        }
    }
}

data class VoiceUtterance(
    val wakeDetected: Boolean,
    val transcript: String,
    val confidence: Double,
) {
    init {
        require(confidence in 0.0..1.0) { "confidence must be between 0 and 1" }
    }
}

data class VoiceFastPathContext(
    val appVisibility: AppVisibility,
    val microphonePermission: RuntimePermissionObservation,
    val availableCapabilityIds: Set<String>,
    val privacyModeEnabled: Boolean = false,
)

enum class VoiceBlockReason {
    PRIVACY_MODE_ENABLED,
    LIFECYCLE_NOT_FOREGROUND,
    MICROPHONE_PERMISSION_NOT_CURRENT,
}

enum class VoiceEscalationReason {
    EMPTY_TRANSCRIPT,
    LOW_TRANSCRIPT_CONFIDENCE,
    UNKNOWN_COMMAND,
    AMBIGUOUS_COMMAND,
    HIGH_RISK_COMMAND,
    CAPABILITY_NOT_AVAILABLE,
}

/**
 * Candidate for the normal Aurora authority/execution path.
 *
 * This is deliberately not a PolicyToken, OwnerDecision, W07 authorization, permission grant, or
 * native command. W07 must perform current authority/target validation and W15-F must independently
 * revalidate session/capability/permission state before any side effect.
 */
data class VoiceDispatchCandidate(
    val commandId: String,
    val capabilityId: String,
    val normalizedTranscript: String,
    val requiresW07Authorization: Boolean = true,
    val authorizesExecution: Boolean = false,
)

sealed interface VoiceFastPathDecision {
    object IgnoredFalseWake : VoiceFastPathDecision

    data class Blocked(
        val reason: VoiceBlockReason,
    ) : VoiceFastPathDecision

    data class Escalated(
        val reason: VoiceEscalationReason,
    ) : VoiceFastPathDecision

    data class Candidate(
        val dispatch: VoiceDispatchCandidate,
    ) : VoiceFastPathDecision
}

/**
 * W15-G deterministic voice/wake/presence fast path.
 *
 * The fast path reduces inference latency for exact low-risk phrases only. It never executes a
 * command and never converts speech confidence into Aurora authority.
 */
class VoiceFastPath(
    commands: List<VoiceCommandDefinition>,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
    private val minimumConfidence: Double = DEFAULT_MINIMUM_CONFIDENCE,
) {
    private val commandsByPhrase: Map<String, List<VoiceCommandDefinition>>

    init {
        require(commands.isNotEmpty()) { "voice command catalog must not be empty" }
        require(minimumConfidence in 0.0..1.0) { "minimumConfidence must be between 0 and 1" }
        require(commands.map { it.commandId }.distinct().size == commands.size) {
            "commandId values must be unique"
        }
        commandsByPhrase =
            commands
                .flatMap { command -> command.phrases.map { normalizeVoicePhrase(it) to command } }
                .groupBy({ it.first }, { it.second })
    }

    fun evaluate(
        utterance: VoiceUtterance,
        context: VoiceFastPathContext,
    ): VoiceFastPathDecision {
        if (!utterance.wakeDetected) return VoiceFastPathDecision.IgnoredFalseWake
        if (context.privacyModeEnabled) {
            return VoiceFastPathDecision.Blocked(VoiceBlockReason.PRIVACY_MODE_ENABLED)
        }
        if (context.appVisibility != AppVisibility.FOREGROUND) {
            return VoiceFastPathDecision.Blocked(VoiceBlockReason.LIFECYCLE_NOT_FOREGROUND)
        }

        val permission = context.microphonePermission
        val currentMs = nowMs()
        if (
            permission.state != RuntimePermissionState.GRANTED ||
            !permission.preconditionSatisfied ||
            permission.observedAtMs > currentMs ||
            currentMs >= permission.expiresAtMs
        ) {
            return VoiceFastPathDecision.Blocked(VoiceBlockReason.MICROPHONE_PERMISSION_NOT_CURRENT)
        }

        val normalized = normalizeVoicePhrase(utterance.transcript)
        if (normalized.isBlank()) {
            return VoiceFastPathDecision.Escalated(VoiceEscalationReason.EMPTY_TRANSCRIPT)
        }
        if (utterance.confidence < minimumConfidence) {
            return VoiceFastPathDecision.Escalated(VoiceEscalationReason.LOW_TRANSCRIPT_CONFIDENCE)
        }

        val matches = commandsByPhrase[normalized].orEmpty()
        if (matches.isEmpty()) {
            return VoiceFastPathDecision.Escalated(VoiceEscalationReason.UNKNOWN_COMMAND)
        }
        if (matches.size != 1) {
            return VoiceFastPathDecision.Escalated(VoiceEscalationReason.AMBIGUOUS_COMMAND)
        }

        val command = matches.single()
        if (command.risk != VoiceCommandRisk.LOW) {
            return VoiceFastPathDecision.Escalated(VoiceEscalationReason.HIGH_RISK_COMMAND)
        }
        if (command.capabilityId !in context.availableCapabilityIds) {
            return VoiceFastPathDecision.Escalated(VoiceEscalationReason.CAPABILITY_NOT_AVAILABLE)
        }

        return VoiceFastPathDecision.Candidate(
            VoiceDispatchCandidate(
                commandId = command.commandId,
                capabilityId = command.capabilityId,
                normalizedTranscript = normalized,
            ),
        )
    }

    companion object {
        const val DEFAULT_MINIMUM_CONFIDENCE: Double = 0.90
    }
}

internal fun normalizeVoicePhrase(value: String): String =
    value
        .trim()
        .lowercase()
        .replace(Regex("\\s+"), " ")
