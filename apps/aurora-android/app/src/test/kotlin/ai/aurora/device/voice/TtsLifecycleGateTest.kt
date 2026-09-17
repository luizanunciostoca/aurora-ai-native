package ai.aurora.device.voice

import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TtsLifecycleGateTest {
    @Test
    fun `close and callback finish have exactly one active terminal winner`() {
        repeat(200) {
            val gate = TtsLifecycleGate()
            assertTrue(gate.tryStart())

            val ready = CountDownLatch(2)
            val release = CountDownLatch(1)
            val winners = AtomicInteger(0)
            val finisher =
                thread(start = true) {
                    ready.countDown()
                    release.await()
                    if (gate.tryFinish()) winners.incrementAndGet()
                }
            val closer =
                thread(start = true) {
                    ready.countDown()
                    release.await()
                    if (gate.close()) winners.incrementAndGet()
                }

            ready.await()
            release.countDown()
            finisher.join()
            closer.join()

            assertTrue("exactly one terminal path must own the active utterance", winners.get() == 1)
            assertFalse(gate.isActive())
        }
    }

    @Test
    fun `close is terminal and prevents a later utterance from starting`() {
        val gate = TtsLifecycleGate()
        assertFalse(gate.close())
        assertFalse(gate.tryStart())
        assertFalse(gate.isActive())
    }
}
