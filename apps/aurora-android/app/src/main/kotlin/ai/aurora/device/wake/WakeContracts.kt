package ai.aurora.device.wake

/** Wake lifecycle is presence/conversation input only. No state in this enum is execution authority. */
enum class WakeState {
    DISABLED,
    INITIALIZING,
    ARMED,
    HOTWORD_LISTENING,
    HOTWORD_CANDIDATE,
    HOTWORD_CONFIRMED,
    AWAKEN,
    UTTERANCE_LISTENING,
    PROCESSING,
    RESPONDING,
    COOLDOWN,
    PERMISSION_REQUIRED,
    PRIVACY_BLOCKED,
    AUDIO_ROUTE_UNAVAILABLE,
    ENGINE_UNAVAILABLE,
    PLATFORM_RESTRICTED,
    DEGRADED,
    ERROR,
}

enum class WakeEngineKind {
    VOICE_INTERACTION_LOCAL,
    MICROPHONE_FGS_LOCAL,
}

enum class WakeAvailability {
    READY,
    USER_SETUP_REQUIRED,
    PLATFORM_LIMITED,
    PERMISSION_BLOCKED,
    PRIVACY_BLOCKED,
    MODEL_UNAVAILABLE,
    ENGINE_UNAVAILABLE,
}

data class WakeConfig(
    val keyword: String = "Aurora",
    val languageTag: String = "pt-BR",
    val confidenceThreshold: Double = 0.82,
    val debounceMs: Long = 650,
    val cooldownMs: Long = 1_800,
    val duplicateWindowMs: Long = 2_200,
    val selfPlaybackCorrelationThreshold: Double = 0.84,
) {
    init {
        require(keyword.equals("Aurora", ignoreCase = true)) { "wake model is bound to Aurora" }
        require(languageTag == "pt-BR") { "wake model is bound to pt-BR" }
        require(confidenceThreshold in 0.50..0.99)
        require(debounceMs in 100..5_000)
        require(cooldownMs in 250..15_000)
        require(duplicateWindowMs in debounceMs..30_000)
        require(selfPlaybackCorrelationThreshold in 0.50..1.0)
    }
}

data class WakeObservation(
    val observedAtMs: Long,
    val confidence: Double,
    /** Hash/fingerprint of derived features only; never raw PCM. */
    val featureFingerprint: String,
    val ttsActive: Boolean = false,
    /** Correlation against Aurora's current playback reference, when one exists. */
    val playbackCorrelation: Double? = null,
    val microphonePermissionGranted: Boolean = true,
    val privacyBlocked: Boolean = false,
) {
    init {
        require(observedAtMs >= 0)
        require(confidence in 0.0..1.0)
        require(featureFingerprint.isNotBlank() && featureFingerprint.length <= 128)
        require(playbackCorrelation == null || playbackCorrelation in 0.0..1.0)
    }
}

data class WakeCandidate(
    val candidateId: String,
    val keyword: String,
    val languageTag: String,
    val observedAtMs: Long,
    val confidence: Double,
    val featureFingerprint: String,
    val authorizesExecution: Boolean = false,
    val provesExecutionSuccess: Boolean = false,
    val retryAuthorized: Boolean = false,
) {
    init {
        require(candidateId.isNotBlank() && candidateId.length <= 128)
        require(keyword == "Aurora")
        require(languageTag == "pt-BR")
        require(observedAtMs >= 0)
        require(confidence in 0.0..1.0)
        require(featureFingerprint.isNotBlank())
        require(!authorizesExecution) { "wake word never authorizes execution" }
        require(!provesExecutionSuccess) { "wake word never proves an outcome" }
        require(!retryAuthorized) { "wake word never authorizes retry" }
    }
}

sealed interface WakeEvaluation {
    data class Confirmed(val candidate: WakeCandidate) : WakeEvaluation
    data class Rejected(val reason: RejectionReason) : WakeEvaluation
}

enum class RejectionReason {
    NOT_LISTENING,
    BELOW_THRESHOLD,
    DEBOUNCED,
    COOLDOWN,
    DUPLICATE,
    SELF_PLAYBACK,
    PERMISSION_BLOCKED,
    PRIVACY_BLOCKED,
}
