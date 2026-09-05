package ai.aurora.device.voice

/**
 * Explicit hand-off boundary between accepted W15-G classification and canonical W07 authority.
 * Implementations may submit a candidate for evaluation; they cannot grant authority or execution.
 */
fun interface W07VoiceAuthorityIngress {
    fun submit(candidate: VoiceDispatchCandidate): W07VoiceAuthorityIngressResult
}

sealed interface W07VoiceAuthorityIngressResult {
    /** Accepted only for downstream W07 current-authority evaluation. */
    data object AcceptedForEvaluation : W07VoiceAuthorityIngressResult

    data class Unavailable(val reason: String) : W07VoiceAuthorityIngressResult {
        init {
            require(reason.isNotBlank())
        }
    }
}

enum class WakeVoiceFallbackReason {
    TRANSCRIPT_CONFIDENCE_UNAVAILABLE,
    RUNTIME_CONTEXT_UNAVAILABLE,
    COMMAND_CATALOG_UNAVAILABLE,
    FAST_PATH_BLOCKED,
    FAST_PATH_ESCALATED,
    AUTHORITY_INGRESS_UNAVAILABLE,
}

sealed interface WakeVoiceRoute {
    /** Candidate reached W07 ingress only. This is neither authority nor execution result. */
    data class AuthoritySubmitted(val dispatch: VoiceDispatchCandidate) : WakeVoiceRoute {
        init {
            require(dispatch.requiresW07Authorization)
            require(!dispatch.authorizesExecution)
        }
    }

    data class ConversationFallback(
        val reason: WakeVoiceFallbackReason,
        val decision: VoiceFastPathDecision? = null,
        val dispatch: VoiceDispatchCandidate? = null,
    ) : WakeVoiceRoute
}

data class WakeVoiceFastPathInputs(
    val commands: List<VoiceCommandDefinition>,
    val context: VoiceFastPathContext,
    val registryVersion: String? = null,
    val vocabularyVersion: String? = null,
) {
    init {
        require(registryVersion == null || registryVersion.isNotBlank())
        require(vocabularyVersion == null || vocabularyVersion.isNotBlank())
    }
}

/**
 * Runtime adapter for wake-triggered bounded STT -> accepted W15-G classifier -> W07 candidate
 * ingress. Any missing/stale/ambiguous input fails closed to the normal conversation path.
 */
class WakeVoiceFastPathRouter(
    private val inputProvider: () -> WakeVoiceFastPathInputs,
    private val authorityIngress: W07VoiceAuthorityIngress,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
    private val minimumConfidence: Double = VoiceFastPath.DEFAULT_MINIMUM_CONFIDENCE,
) {
    init {
        require(minimumConfidence in 0.0..1.0)
    }

    fun route(
        transcript: String,
        transcriptConfidence: Double?,
    ): WakeVoiceRoute {
        val confidence =
            transcriptConfidence?.takeIf { it.isFinite() && it in 0.0..1.0 }
                ?: return WakeVoiceRoute.ConversationFallback(
                    WakeVoiceFallbackReason.TRANSCRIPT_CONFIDENCE_UNAVAILABLE,
                )

        val inputs =
            runCatching(inputProvider).getOrNull()
                ?: return WakeVoiceRoute.ConversationFallback(
                    WakeVoiceFallbackReason.RUNTIME_CONTEXT_UNAVAILABLE,
                )
        if (inputs.commands.isEmpty()) {
            return WakeVoiceRoute.ConversationFallback(
                WakeVoiceFallbackReason.COMMAND_CATALOG_UNAVAILABLE,
            )
        }

        val decision =
            runCatching {
                VoiceFastPath(
                    commands = inputs.commands,
                    nowMs = nowMs,
                    minimumConfidence = minimumConfidence,
                ).evaluate(
                    utterance =
                        VoiceUtterance(
                            wakeDetected = true,
                            transcript = transcript,
                            confidence = confidence,
                        ),
                    context = inputs.context,
                )
            }.getOrNull()
                ?: return WakeVoiceRoute.ConversationFallback(
                    WakeVoiceFallbackReason.RUNTIME_CONTEXT_UNAVAILABLE,
                )

        return when (decision) {
            VoiceFastPathDecision.IgnoredFalseWake ->
                WakeVoiceRoute.ConversationFallback(
                    WakeVoiceFallbackReason.FAST_PATH_ESCALATED,
                    decision = decision,
                )
            is VoiceFastPathDecision.Blocked ->
                WakeVoiceRoute.ConversationFallback(
                    WakeVoiceFallbackReason.FAST_PATH_BLOCKED,
                    decision = decision,
                )
            is VoiceFastPathDecision.Escalated ->
                WakeVoiceRoute.ConversationFallback(
                    WakeVoiceFallbackReason.FAST_PATH_ESCALATED,
                    decision = decision,
                )
            is VoiceFastPathDecision.Candidate -> {
                val dispatch = decision.dispatch
                check(dispatch.requiresW07Authorization) { "voice candidate must require W07" }
                check(!dispatch.authorizesExecution) { "voice candidate cannot authorize execution" }
                when (runCatching { authorityIngress.submit(dispatch) }.getOrNull()) {
                    W07VoiceAuthorityIngressResult.AcceptedForEvaluation ->
                        WakeVoiceRoute.AuthoritySubmitted(dispatch)
                    is W07VoiceAuthorityIngressResult.Unavailable,
                    null,
                    ->
                        WakeVoiceRoute.ConversationFallback(
                            WakeVoiceFallbackReason.AUTHORITY_INGRESS_UNAVAILABLE,
                            decision = decision,
                            dispatch = dispatch,
                        )
                }
            }
        }
    }
}
