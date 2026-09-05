package ai.aurora.device.wake

import java.util.concurrent.atomic.AtomicLong

/** Deterministic acoustic/presence state only; transitions never confer action authority. */
class WakeStateMachine(
    private val config: WakeConfig = WakeConfig(),
) {
    var state: WakeState = WakeState.DISABLED
        private set

    private var lastAcceptedAtMs: Long? = null
    private var lastAcceptedFingerprint: String? = null
    private val candidateSequence = AtomicLong(0)

    fun transition(next: WakeState) {
        require(next in allowedTransitions.getValue(state)) {
            "invalid wake transition $state -> $next"
        }
        state = next
    }

    fun arm() {
        when (state) {
            WakeState.DISABLED,
            WakeState.PERMISSION_REQUIRED,
            WakeState.PRIVACY_BLOCKED,
            WakeState.AUDIO_ROUTE_UNAVAILABLE,
            WakeState.ENGINE_UNAVAILABLE,
            WakeState.PLATFORM_RESTRICTED,
            WakeState.DEGRADED,
            WakeState.ERROR,
            -> transition(WakeState.INITIALIZING)
            else -> Unit
        }
        if (state == WakeState.INITIALIZING) transition(WakeState.ARMED)
        if (state == WakeState.ARMED) transition(WakeState.HOTWORD_LISTENING)
    }

    fun disarm() {
        state = WakeState.DISABLED
        lastAcceptedAtMs = null
        lastAcceptedFingerprint = null
    }

    fun evaluate(observation: WakeObservation): WakeEvaluation {
        if (state != WakeState.HOTWORD_LISTENING) {
            return WakeEvaluation.Rejected(RejectionReason.NOT_LISTENING)
        }
        if (observation.privacyBlocked) {
            transition(WakeState.PRIVACY_BLOCKED)
            return WakeEvaluation.Rejected(RejectionReason.PRIVACY_BLOCKED)
        }
        if (!observation.microphonePermissionGranted) {
            transition(WakeState.PERMISSION_REQUIRED)
            return WakeEvaluation.Rejected(RejectionReason.PERMISSION_BLOCKED)
        }
        if (observation.confidence < config.confidenceThreshold) {
            return WakeEvaluation.Rejected(RejectionReason.BELOW_THRESHOLD)
        }
        if (
            observation.ttsActive &&
            (observation.playbackCorrelation ?: 1.0) >= config.selfPlaybackCorrelationThreshold
        ) {
            return WakeEvaluation.Rejected(RejectionReason.SELF_PLAYBACK)
        }

        val previousAt = lastAcceptedAtMs
        if (previousAt != null) {
            val elapsed = observation.observedAtMs - previousAt
            if (elapsed < 0 || elapsed < config.debounceMs) {
                return WakeEvaluation.Rejected(RejectionReason.DEBOUNCED)
            }
            if (elapsed < config.cooldownMs) {
                return WakeEvaluation.Rejected(RejectionReason.COOLDOWN)
            }
            if (
                elapsed < config.duplicateWindowMs &&
                observation.featureFingerprint == lastAcceptedFingerprint
            ) {
                return WakeEvaluation.Rejected(RejectionReason.DUPLICATE)
            }
        }

        transition(WakeState.HOTWORD_CANDIDATE)
        val candidate =
            WakeCandidate(
                candidateId = "wake-${observation.observedAtMs}-${candidateSequence.incrementAndGet()}",
                keyword = config.keyword,
                languageTag = config.languageTag,
                observedAtMs = observation.observedAtMs,
                confidence = observation.confidence,
                featureFingerprint = observation.featureFingerprint,
            )
        lastAcceptedAtMs = observation.observedAtMs
        lastAcceptedFingerprint = observation.featureFingerprint
        transition(WakeState.HOTWORD_CONFIRMED)
        return WakeEvaluation.Confirmed(candidate)
    }

    fun awaken() = transition(WakeState.AWAKEN)
    fun beginUtterance() = transition(WakeState.UTTERANCE_LISTENING)
    fun beginProcessing() = transition(WakeState.PROCESSING)
    fun beginResponding() = transition(WakeState.RESPONDING)

    fun completeInteraction() {
        if (state == WakeState.RESPONDING) transition(WakeState.COOLDOWN)
    }

    fun rearm() {
        if (state == WakeState.COOLDOWN) transition(WakeState.ARMED)
        if (state == WakeState.ARMED) transition(WakeState.HOTWORD_LISTENING)
    }

    companion object {
        private val allowedTransitions: Map<WakeState, Set<WakeState>> =
            mapOf(
                WakeState.DISABLED to setOf(WakeState.INITIALIZING),
                WakeState.INITIALIZING to
                    setOf(
                        WakeState.ARMED,
                        WakeState.PERMISSION_REQUIRED,
                        WakeState.PRIVACY_BLOCKED,
                        WakeState.AUDIO_ROUTE_UNAVAILABLE,
                        WakeState.ENGINE_UNAVAILABLE,
                        WakeState.PLATFORM_RESTRICTED,
                        WakeState.DEGRADED,
                        WakeState.ERROR,
                    ),
                WakeState.ARMED to setOf(WakeState.HOTWORD_LISTENING, WakeState.DISABLED),
                WakeState.HOTWORD_LISTENING to
                    setOf(
                        WakeState.HOTWORD_CANDIDATE,
                        WakeState.PERMISSION_REQUIRED,
                        WakeState.PRIVACY_BLOCKED,
                        WakeState.AUDIO_ROUTE_UNAVAILABLE,
                        WakeState.ENGINE_UNAVAILABLE,
                        WakeState.DEGRADED,
                        WakeState.ERROR,
                        WakeState.DISABLED,
                    ),
                WakeState.HOTWORD_CANDIDATE to
                    setOf(WakeState.HOTWORD_CONFIRMED, WakeState.HOTWORD_LISTENING),
                WakeState.HOTWORD_CONFIRMED to
                    setOf(WakeState.AWAKEN, WakeState.COOLDOWN, WakeState.DISABLED),
                WakeState.AWAKEN to
                    setOf(WakeState.UTTERANCE_LISTENING, WakeState.COOLDOWN, WakeState.DISABLED),
                WakeState.UTTERANCE_LISTENING to
                    setOf(WakeState.PROCESSING, WakeState.COOLDOWN, WakeState.DISABLED),
                WakeState.PROCESSING to
                    setOf(WakeState.RESPONDING, WakeState.COOLDOWN, WakeState.DISABLED),
                WakeState.RESPONDING to setOf(WakeState.COOLDOWN, WakeState.DISABLED),
                WakeState.COOLDOWN to setOf(WakeState.ARMED, WakeState.DISABLED),
                WakeState.PERMISSION_REQUIRED to setOf(WakeState.INITIALIZING, WakeState.DISABLED),
                WakeState.PRIVACY_BLOCKED to setOf(WakeState.INITIALIZING, WakeState.DISABLED),
                WakeState.AUDIO_ROUTE_UNAVAILABLE to setOf(WakeState.INITIALIZING, WakeState.DISABLED),
                WakeState.ENGINE_UNAVAILABLE to setOf(WakeState.INITIALIZING, WakeState.DISABLED),
                WakeState.PLATFORM_RESTRICTED to setOf(WakeState.INITIALIZING, WakeState.DISABLED),
                WakeState.DEGRADED to setOf(WakeState.INITIALIZING, WakeState.DISABLED),
                WakeState.ERROR to setOf(WakeState.INITIALIZING, WakeState.DISABLED),
            )
    }
}
