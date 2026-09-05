package ai.aurora.device.voice

/**
 * Explicit hand-off boundary between the accepted W15-G voice fast-path classifier and the
 * canonical W07 authority path.
 *
 * Implementations may enqueue a candidate for current-authority evaluation, but this interface
 * cannot grant authority, authorize execution, prove outcome, or authorize retry.
 */
fun interface W07VoiceAuthorityIngress {
    fun submit(candidate: VoiceDispatchCandidate): W07VoiceAuthorityIngressResult
}

sealed interface W07VoiceAuthorityIngressResult {
    /** The candidate was accepted only for downstream W07 authority evaluation. */
    data object AcceptedForEvaluation : W07VoiceAuthorityIngressResult

    data class Unavailable(
        val reason: String,
    ) : W07VoiceAuthorityIngressResult {
        init {
            require(reason.isNotBlank()) { "reason must not be blank" }
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
    /** Candidate reached W07 ingress only. This is not an authority or execution result. */
    data class AuthoritySubmitted(
        val dispatch: VoiceDispatchCandidate,
    ) : WakeVoiceRoute {
        init {
            require(dispatch.requiresW07Authorization)
            require(!dispatch.authorizesExecution)
        }
    }

    /**
     * The deterministic path could not safely complete. Caller should use the normal Conversation
     * path, which remains responsible for intelligence/orchestration and all canonical authority
     * gates.
     */
    data class ConversationFallback(
        val reason: WakeVoiceFallbackReason,
        val decision: VoiceFastPathDecision? = null,
        val dispatch: VoiceDispatchCandidate? = null,
    ) : WakeVoiceRoute
}

/**
 * One atomic view of command vocabulary + current Android preconditions for a single evaluation.
 * A caller should derive both from the same reconciled W04/W15-C/W15-G projection snapshot.
 */
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
 * Runtime adapter for wake-triggered bounded STT -> W15-G -> W07 candidate ingress.
 *
 * No command catalog is invented here. The input provider must atomically project current governed
 * capability/vocabulary/runtime state. An absent catalog, absent recognizer confidence, unavailable
 * runtime observation, blocked/escalated W15-G result, or unavailable W07 ingress all fail closed to
 * the normal Conversation path.
 */
class WakeVoiceFastPathRouter(
    private val inputProvider: () -> WakeVoiceFastPathInputs,
    private val authorityIngress: W07VoiceAuthorityIngress,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
    private val minimumConfidence: Double = VoiceFastPath.DEFAULT_MINIMUM_CONFIDENCE,
) {
    init {
        require(minimumConfidence in 0.0..1.0) { "minimumConfidence must be between 0 and 1" }
    }

    fun route(
        transcript: String,
        transcriptConfidence: Double?,
    ): WakeVoiceRoute {
        val confidence = transcriptConfidence
            ?.takeIf { it.isFinite() && it in 0.0..1.0 }
            ?: return WakeVoiceRoute.ConversationFallback(
                WakeVoiceFallbackReason.TRANSCRIPT_CONFIDENCE_UNAVAILABLE,
            )

        val inputs = runCatching(inputProvider).getOrNull()
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
                check(dispatch.requiresW07Authorization) {
                    "W15-G candidate must require W07 authorization"
                }
                check(!dispatch.authorizesExecution) {
                    "W15-G candidate must never authorize execution"
                }

                when (runCatching { authorityIngress.submit(dispatch) }.getOrNull()) {
                    W07VoiceAuthorityIngressResult.AcceptedForEvaluation ->
                        WakeVoiceRoute.AuthoritySubmitted(dispatch)

                    is W07VoiceAuthorityIngressResult.Unavailable,
                    null ->
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
