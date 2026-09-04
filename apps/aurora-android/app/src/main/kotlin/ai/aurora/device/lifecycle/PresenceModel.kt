package ai.aurora.device.lifecycle

enum class ProcessPhase {
    RUNNING,
    STOPPED,
}

enum class AppVisibility {
    NONE,
    BACKGROUND,
    FOREGROUND,
}

enum class LocalServicePhase {
    STOPPED,
    STARTING,
    RUNNING,
    STOPPING,
}

data class PresenceCheckpoint(
    val processGeneration: Long,
    val lastVisibility: AppVisibility,
    val transitionSequence: Long,
)

data class PresenceSnapshot(
    val processPhase: ProcessPhase,
    val visibility: AppVisibility,
    val localServicePhase: LocalServicePhase,
    val processGeneration: Long,
    val transitionSequence: Long,
) {
    fun checkpoint(): PresenceCheckpoint =
        PresenceCheckpoint(
            processGeneration = processGeneration,
            lastVisibility = visibility,
            transitionSequence = transitionSequence,
        )
}

sealed interface PresenceEvent {
    data class ProcessStarted(val checkpoint: PresenceCheckpoint? = null) : PresenceEvent

    object EnteredForeground : PresenceEvent

    object EnteredBackground : PresenceEvent

    object ServiceStarting : PresenceEvent

    object ServiceStarted : PresenceEvent

    object ServiceStopping : PresenceEvent

    object ServiceStopped : PresenceEvent

    object ProcessStopping : PresenceEvent
}

sealed interface PresenceTransition {
    data class Applied(
        val snapshot: PresenceSnapshot,
        val changed: Boolean,
    ) : PresenceTransition

    data class Rejected(
        val snapshot: PresenceSnapshot?,
        val reason: String,
    ) : PresenceTransition
}
