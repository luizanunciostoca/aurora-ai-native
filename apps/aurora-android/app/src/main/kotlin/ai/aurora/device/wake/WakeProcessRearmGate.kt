package ai.aurora.device.wake

import java.util.concurrent.atomic.AtomicBoolean

/** Process-local duplicate-start fence. It carries no execution authority. */
internal class WakeProcessRearmGate {
    private val activeOrStarting = AtomicBoolean(false)

    fun tryBeginStart(): Boolean = activeOrStarting.compareAndSet(false, true)

    fun markActive() {
        activeOrStarting.set(true)
    }

    fun markInactive() {
        activeOrStarting.set(false)
    }

    fun activeOrStarting(): Boolean = activeOrStarting.get()
}
