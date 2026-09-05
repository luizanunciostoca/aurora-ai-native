package ai.aurora.device.voice

/**
 * Bounded transport request for the canonical W14 -> W07 voice-candidate route.
 *
 * Identity, tenant, device/session trust, policy/current-authority, server time, outcome and retry
 * state are intentionally absent. They must remain server-derived/current-authority-owned.
 */
data class GovernedVoiceCandidateSubmission(
    val commandId: String,
    val capabilityId: String,
    val normalizedTranscript: String,
    val requiresW07Authorization: Boolean = true,
    val authorizesExecution: Boolean = false,
) {
    init {
        require(commandId.isNotBlank() && commandId.length <= MAX_IDENTIFIER_LENGTH)
        require(capabilityId.isNotBlank() && capabilityId.length <= MAX_IDENTIFIER_LENGTH)
        require(normalizedTranscript.isNotBlank() && normalizedTranscript.length <= MAX_TRANSCRIPT_LENGTH)
        require(requiresW07Authorization) { "voice candidate must require W07 authorization" }
        require(!authorizesExecution) { "voice candidate cannot authorize execution" }
    }

    companion object {
        private const val MAX_IDENTIFIER_LENGTH = 256
        private const val MAX_TRANSCRIPT_LENGTH = 512

        fun from(candidate: VoiceDispatchCandidate): GovernedVoiceCandidateSubmission =
            GovernedVoiceCandidateSubmission(
                commandId = candidate.commandId,
                capabilityId = candidate.capabilityId,
                normalizedTranscript = candidate.normalizedTranscript,
                requiresW07Authorization = candidate.requiresW07Authorization,
                authorizesExecution = candidate.authorizesExecution,
            )
    }
}

/**
 * Sanitized transport observation. This is not authority and never proves execution or retry.
 */
sealed interface GovernedVoiceCandidateTransportResult {
    data class Delivered(
        val acceptedForEvaluation: Boolean,
        val authorizesExecution: Boolean = false,
        val provesExecutionSuccess: Boolean = false,
        val retryAuthorized: Boolean = false,
    ) : GovernedVoiceCandidateTransportResult

    data class Unavailable(
        val reason: String,
        val deliveryUncertain: Boolean = false,
        val retryAuthorized: Boolean = false,
    ) : GovernedVoiceCandidateTransportResult {
        init {
            require(reason.isNotBlank())
            require(!retryAuthorized) { "transport failure cannot authorize retry" }
        }
    }
}

/**
 * Implemented only by the shared authenticated W15-J/W14 transport composition.
 * A voice-only parallel HTTP client is intentionally forbidden by this boundary.
 */
fun interface GovernedVoiceCandidateTransport {
    fun submit(candidate: GovernedVoiceCandidateSubmission): GovernedVoiceCandidateTransportResult
}

/**
 * Android realization of [W07VoiceAuthorityIngress].
 *
 * The adapter can only submit a bounded candidate. `AcceptedForEvaluation` is returned only after
 * the transport reports the canonical sanitized acknowledgement with all authority/outcome/retry
 * flags false. Rejection, malformed authority-bearing replies, exceptions and uncertain delivery
 * all fail closed to [W07VoiceAuthorityIngressResult.Unavailable].
 */
class GovernedW07VoiceAuthorityIngress(
    private val transport: GovernedVoiceCandidateTransport,
) : W07VoiceAuthorityIngress {
    override fun submit(candidate: VoiceDispatchCandidate): W07VoiceAuthorityIngressResult {
        val request =
            runCatching { GovernedVoiceCandidateSubmission.from(candidate) }.getOrElse {
                return W07VoiceAuthorityIngressResult.Unavailable("voice candidate boundary rejected")
            }

        val transportResult =
            runCatching { transport.submit(request) }.getOrElse {
                return W07VoiceAuthorityIngressResult.Unavailable("voice candidate transport unavailable")
            }

        return when (transportResult) {
            is GovernedVoiceCandidateTransportResult.Delivered -> {
                if (
                    transportResult.acceptedForEvaluation &&
                    !transportResult.authorizesExecution &&
                    !transportResult.provesExecutionSuccess &&
                    !transportResult.retryAuthorized
                ) {
                    W07VoiceAuthorityIngressResult.AcceptedForEvaluation
                } else {
                    W07VoiceAuthorityIngressResult.Unavailable("voice candidate response rejected")
                }
            }
            is GovernedVoiceCandidateTransportResult.Unavailable ->
                W07VoiceAuthorityIngressResult.Unavailable(
                    if (transportResult.deliveryUncertain) {
                        "voice candidate delivery uncertain; reconciliation required"
                    } else {
                        transportResult.reason
                    },
                )
        }
    }
}
