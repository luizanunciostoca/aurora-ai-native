package ai.aurora.device.concurrent

import java.util.concurrent.atomic.AtomicBoolean

/** Exactly-once ownership fence for a process-local resource lease. */
internal class AudioResourceLeaseGate {
    private val held = AtomicBoolean(false)

    fun markHeldAndValidate(
        isLifecycleActive: () -> Boolean,
        release: () -> Unit,
    ): Boolean {
        held.set(true)
        if (isLifecycleActive()) return true
        releaseIfHeld(release)
        return false
    }

    fun releaseIfHeld(release: () -> Unit): Boolean {
        if (!held.compareAndSet(true, false)) return false
        release()
        return true
    }

    fun isHeld(): Boolean = held.get()
}
