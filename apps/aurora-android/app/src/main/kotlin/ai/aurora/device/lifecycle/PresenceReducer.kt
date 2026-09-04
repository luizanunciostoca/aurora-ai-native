package ai.aurora.device.lifecycle

object PresenceReducer {
    fun reduce(current: PresenceSnapshot?, event: PresenceEvent): PresenceTransition =
        when (event) {
            is PresenceEvent.ProcessStarted -> startProcess(current, event.checkpoint)
            PresenceEvent.EnteredForeground -> changeVisibility(current, AppVisibility.FOREGROUND)
            PresenceEvent.EnteredBackground -> changeVisibility(current, AppVisibility.BACKGROUND)
            PresenceEvent.ServiceStarting -> changeService(current, LocalServicePhase.STARTING)
            PresenceEvent.ServiceStarted -> serviceStarted(current)
            PresenceEvent.ServiceStopping -> serviceStopping(current)
            PresenceEvent.ServiceStopped -> serviceStopped(current)
            PresenceEvent.ProcessStopping -> stopProcess(current)
        }

    private fun startProcess(
        current: PresenceSnapshot?,
        checkpoint: PresenceCheckpoint?,
    ): PresenceTransition {
        if (current?.processPhase == ProcessPhase.RUNNING) {
            return PresenceTransition.Rejected(current, "process is already running")
        }

        val previousGeneration = maxOf(current?.processGeneration ?: 0, checkpoint?.processGeneration ?: 0)
        val previousSequence = maxOf(current?.transitionSequence ?: 0, checkpoint?.transitionSequence ?: 0)
        return PresenceTransition.Applied(
            PresenceSnapshot(
                processPhase = ProcessPhase.RUNNING,
                visibility = AppVisibility.BACKGROUND,
                localServicePhase = LocalServicePhase.STOPPED,
                processGeneration = previousGeneration + 1,
                transitionSequence = previousSequence + 1,
            ),
            changed = true,
        )
    }

    private fun changeVisibility(
        current: PresenceSnapshot?,
        visibility: AppVisibility,
    ): PresenceTransition {
        val running = requireRunning(current) ?: return rejectedNotRunning(current)
        if (running.visibility == visibility) return PresenceTransition.Applied(running, changed = false)
        return PresenceTransition.Applied(
            running.copy(visibility = visibility, transitionSequence = running.transitionSequence + 1),
            changed = true,
        )
    }

    private fun changeService(
        current: PresenceSnapshot?,
        target: LocalServicePhase,
    ): PresenceTransition {
        val running = requireRunning(current) ?: return rejectedNotRunning(current)
        if (running.localServicePhase == target) return PresenceTransition.Applied(running, changed = false)
        if (target == LocalServicePhase.STARTING && running.localServicePhase != LocalServicePhase.STOPPED) {
            return PresenceTransition.Rejected(running, "service can start only from STOPPED")
        }
        return PresenceTransition.Applied(
            running.copy(localServicePhase = target, transitionSequence = running.transitionSequence + 1),
            changed = true,
        )
    }

    private fun serviceStarted(current: PresenceSnapshot?): PresenceTransition {
        val running = requireRunning(current) ?: return rejectedNotRunning(current)
        return when (running.localServicePhase) {
            LocalServicePhase.STARTING -> PresenceTransition.Applied(
                running.copy(
                    localServicePhase = LocalServicePhase.RUNNING,
                    transitionSequence = running.transitionSequence + 1,
                ),
                changed = true,
            )
            LocalServicePhase.RUNNING -> PresenceTransition.Applied(running, changed = false)
            else -> PresenceTransition.Rejected(running, "service must be STARTING before RUNNING")
        }
    }

    private fun serviceStopping(current: PresenceSnapshot?): PresenceTransition {
        val running = requireRunning(current) ?: return rejectedNotRunning(current)
        return when (running.localServicePhase) {
            LocalServicePhase.STOPPED -> PresenceTransition.Applied(running, changed = false)
            LocalServicePhase.STOPPING -> PresenceTransition.Applied(running, changed = false)
            LocalServicePhase.STARTING,
            LocalServicePhase.RUNNING,
            -> PresenceTransition.Applied(
                running.copy(
                    localServicePhase = LocalServicePhase.STOPPING,
                    transitionSequence = running.transitionSequence + 1,
                ),
                changed = true,
            )
        }
    }

    private fun serviceStopped(current: PresenceSnapshot?): PresenceTransition {
        val running = requireRunning(current) ?: return rejectedNotRunning(current)
        if (running.localServicePhase == LocalServicePhase.STOPPED) {
            return PresenceTransition.Applied(running, changed = false)
        }
        return PresenceTransition.Applied(
            running.copy(
                localServicePhase = LocalServicePhase.STOPPED,
                transitionSequence = running.transitionSequence + 1,
            ),
            changed = true,
        )
    }

    private fun stopProcess(current: PresenceSnapshot?): PresenceTransition {
        if (current == null) return PresenceTransition.Rejected(null, "process has not started")
        if (current.processPhase == ProcessPhase.STOPPED) return PresenceTransition.Applied(current, changed = false)
        return PresenceTransition.Applied(
            current.copy(
                processPhase = ProcessPhase.STOPPED,
                visibility = AppVisibility.NONE,
                localServicePhase = LocalServicePhase.STOPPED,
                transitionSequence = current.transitionSequence + 1,
            ),
            changed = true,
        )
    }

    private fun requireRunning(current: PresenceSnapshot?): PresenceSnapshot? =
        current?.takeIf { it.processPhase == ProcessPhase.RUNNING }

    private fun rejectedNotRunning(current: PresenceSnapshot?): PresenceTransition.Rejected =
        PresenceTransition.Rejected(current, "process is not running")
}
