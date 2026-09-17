package ai.aurora.device.voice

import java.util.concurrent.atomic.AtomicBoolean

/**
 * Exactly-once terminal fence for one voice output operation.
 *
 * It coordinates lifecycle only. It carries no execution authority, outcome truth, or retry state.
 */
internal class TerminalCallbackFence {
    private val active = AtomicBoolean(false)

    fun tryBegin(): Boolean = active.compareAndSet(false, true)

    fun isActive(): Boolean = active.get()

    /** Returns true only for the thread/callback that wins terminal ownership. */
    fun tryFinish(): Boolean = active.compareAndSet(true, false)
}
