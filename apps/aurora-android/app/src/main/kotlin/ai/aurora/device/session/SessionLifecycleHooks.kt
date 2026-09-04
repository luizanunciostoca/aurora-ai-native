package ai.aurora.device.session

import ai.aurora.device.lifecycle.AppVisibility
import ai.aurora.device.lifecycle.LocalServicePhase
import ai.aurora.device.lifecycle.PresenceSnapshot
import ai.aurora.device.lifecycle.ProcessPhase

enum class SessionLifecycleSignal {
    PROCESS_STARTED,
    PROCESS_RESTARTED,
    ENTERED_FOREGROUND,
    ENTERED_BACKGROUND,
    LOCAL_SERVICE_CHANGED,
    PROCESS_STOPPED,
}

data class SessionLifecycleObservation(
    val signal: SessionLifecycleSignal,
    val processGeneration: Long,
    val transitionSequence: Long,
    val visibility: AppVisibility,
    val localServicePhase: LocalServicePhase,
)

fun interface SessionLifecycleObserver {
    fun onObservation(observation: SessionLifecycleObservation)
}

class SessionLifecycleHooks(
    private val observer: SessionLifecycleObserver,
) {
    fun publish(previous: PresenceSnapshot?, current: PresenceSnapshot) {
        val signal = classify(previous, current) ?: return
        observer.onObservation(
            SessionLifecycleObservation(
                signal = signal,
                processGeneration = current.processGeneration,
                transitionSequence = current.transitionSequence,
                visibility = current.visibility,
                localServicePhase = current.localServicePhase,
            ),
        )
    }

    private fun classify(previous: PresenceSnapshot?, current: PresenceSnapshot): SessionLifecycleSignal? {
        if (previous == null) {
            return if (current.processGeneration > 1) {
                SessionLifecycleSignal.PROCESS_RESTARTED
            } else {
                SessionLifecycleSignal.PROCESS_STARTED
            }
        }
        if (previous.processGeneration != current.processGeneration) return SessionLifecycleSignal.PROCESS_RESTARTED
        if (previous.processPhase != current.processPhase && current.processPhase == ProcessPhase.STOPPED) {
            return SessionLifecycleSignal.PROCESS_STOPPED
        }
        if (previous.visibility != current.visibility) {
            return when (current.visibility) {
                AppVisibility.FOREGROUND -> SessionLifecycleSignal.ENTERED_FOREGROUND
                AppVisibility.BACKGROUND -> SessionLifecycleSignal.ENTERED_BACKGROUND
                AppVisibility.NONE -> null
            }
        }
        if (previous.localServicePhase != current.localServicePhase) {
            return SessionLifecycleSignal.LOCAL_SERVICE_CHANGED
        }
        return null
    }
}
