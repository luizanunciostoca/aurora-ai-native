package ai.aurora.device.lifecycle

import ai.aurora.device.session.SessionLifecycleHooks

interface PresenceCheckpointStore {
    fun load(): PresenceCheckpoint?

    fun save(checkpoint: PresenceCheckpoint)
}

class PresenceEngine(
    private val store: PresenceCheckpointStore,
    private val sessionHooks: SessionLifecycleHooks,
) {
    var snapshot: PresenceSnapshot
        private set

    init {
        snapshot = requireApplied(PresenceReducer.reduce(null, PresenceEvent.ProcessStarted(store.load())))
        store.save(snapshot.checkpoint())
        sessionHooks.publish(null, snapshot)
    }

    @Synchronized
    fun apply(event: PresenceEvent): PresenceTransition {
        val previous = snapshot
        val transition = PresenceReducer.reduce(previous, event)
        if (transition is PresenceTransition.Applied && transition.changed) {
            snapshot = transition.snapshot
            store.save(snapshot.checkpoint())
            sessionHooks.publish(previous, snapshot)
        }
        return transition
    }

    private fun requireApplied(transition: PresenceTransition): PresenceSnapshot =
        (transition as? PresenceTransition.Applied)?.snapshot
            ?: error("process bootstrap must produce an applied presence state: $transition")
}
