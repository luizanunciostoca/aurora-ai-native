package ai.aurora.device.voice

import java.util.concurrent.atomic.AtomicReference

/** Exactly-once lifecycle fence for one closeable asynchronous voice operation. */
internal class CloseableOperationGate {
    private enum class State {
        IDLE,
        ACTIVE,
        CLOSED,
    }

    private val state = AtomicReference(State.IDLE)

    fun tryStart(): Boolean = state.compareAndSet(State.IDLE, State.ACTIVE)

    fun isActive(): Boolean = state.get() == State.ACTIVE

    /** Returns true only for the terminal callback that wins an active operation. */
    fun tryFinish(): Boolean = state.compareAndSet(State.ACTIVE, State.IDLE)

    /**
     * Makes this gate permanently closed. Returns true only when close itself claimed an active
     * operation and therefore owns its terminal cleanup.
     */
    fun close(): Boolean {
        while (true) {
            when (val current = state.get()) {
                State.CLOSED -> return false
                State.IDLE,
                State.ACTIVE,
                -> if (state.compareAndSet(current, State.CLOSED)) return current == State.ACTIVE
            }
        }
    }
}
