package ai.aurora.device.wake

import java.lang.ref.WeakReference

/** In-process handoff only while MainActivity is visibly started. */
object WakeInteractionBridge {
    interface Receiver {
        fun onWake(candidate: WakeCandidate)
    }

    @Volatile
    private var receiver: WeakReference<Receiver>? = null

    fun register(value: Receiver) {
        receiver = WeakReference(value)
    }

    fun unregister(value: Receiver) {
        if (receiver?.get() === value) receiver = null
    }

    fun dispatch(candidate: WakeCandidate): Boolean {
        val current = receiver?.get() ?: return false
        current.onWake(candidate)
        return true
    }
}
