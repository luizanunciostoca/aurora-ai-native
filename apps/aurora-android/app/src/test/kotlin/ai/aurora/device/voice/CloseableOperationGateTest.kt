package ai.aurora.device.voice

import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CloseableOperationGateTest {
    @Test
    fun `close and terminal callback have exactly one active winner`() {
        repeat(200) {
            val gate = CloseableOperationGate()
            assertTrue(gate.tryStart())
            val ready = CountDownLatch(2)
            val release = CountDownLatch(1)
            val winners = AtomicInteger(0)

            val callback =
                thread(start = true) {
                    ready.countDown()
                    release.await()
                    if (gate.tryFinish()) winners.incrementAndGet()
                }
            val close =
                thread(start = true) {
                    ready.countDown()
                    release.await()
                    if (gate.close()) winners.incrementAndGet()
                }

            ready.await()
            release.countDown()
            callback.join()
            close.join()

            assertTrue("exactly one terminal path must own the active operation", winners.get() == 1)
            assertFalse(gate.isActive())
        }
    }

    @Test
    fun `close is terminal and prevents a later start`() {
        val gate = CloseableOperationGate()
        assertFalse(gate.close())
        assertFalse(gate.tryStart())
        assertFalse(gate.isActive())
    }
}
