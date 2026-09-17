package ai.aurora.device.voice

import java.util.concurrent.atomic.AtomicBoolean

/**
 * Exactly-once ownership fence for the process-local TTS audio lease.
 *
 * A lifecycle close may race the short interval between the audio arbiter granting ownership and
 * the output instance recording that ownership. This gate guarantees that either close releases an
 * already-recorded lease or the acquisition path observes the closed lifecycle and releases the
 * newly-recorded lease itself.
 */
internal class TtsResourceLeaseGate {
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
