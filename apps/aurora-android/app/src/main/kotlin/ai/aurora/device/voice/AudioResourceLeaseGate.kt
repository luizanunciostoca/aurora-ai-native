package ai.aurora.device.voice

import java.util.concurrent.atomic.AtomicBoolean

/**
 * Exactly-once ownership fence for a process-local audio resource lease.
 *
 * Lifecycle close may race the short interval between the global audio arbiter granting ownership
 * and the component recording that ownership. This gate guarantees that either close releases an
 * already-recorded lease or the acquisition path observes the closed lifecycle and releases the
 * newly-recorded lease itself.
 */
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
