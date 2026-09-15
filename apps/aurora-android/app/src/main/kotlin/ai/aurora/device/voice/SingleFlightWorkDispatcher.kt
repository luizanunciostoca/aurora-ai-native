package ai.aurora.device.voice

import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Lifecycle-owned single-flight worker for potentially blocking voice-side orchestration.
 *
 * Closing prevents new work but intentionally does not interrupt an already-running governed
 * execution. Interrupting after an external effect may have started could turn a known result into
 * an uncertain one and must never be used as an implicit retry/cancellation mechanism.
 */
internal class SingleFlightWorkDispatcher(
    private val executor: ExecutorService =
        Executors.newSingleThreadExecutor { runnable ->
            Thread(runnable, "aurora-governed-execution").apply { isDaemon = true }
        },
) : AutoCloseable {
    private val inFlight = AtomicBoolean(false)
    private val closed = AtomicBoolean(false)

    fun <T> submit(
        operation: () -> T,
        onComplete: (T) -> Unit,
        onFailure: (Throwable) -> Unit,
    ): Boolean {
        if (closed.get() || !inFlight.compareAndSet(false, true)) return false
        executor.execute {
            try {
                onComplete(operation())
            } catch (failure: Throwable) {
                onFailure(failure)
            } finally {
                inFlight.set(false)
            }
        }
        return true
    }

    fun hasInFlightWork(): Boolean = inFlight.get()

    override fun close() {
        if (closed.compareAndSet(false, true)) {
            executor.shutdown()
        }
    }
}
