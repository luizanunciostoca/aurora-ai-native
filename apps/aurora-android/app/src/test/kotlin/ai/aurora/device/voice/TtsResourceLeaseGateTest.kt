package ai.aurora.device.voice

import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TtsResourceLeaseGateTest {
    @Test
    fun `lease granted after lifecycle already closed is released immediately`() {
        val lifecycle = TtsLifecycleGate()
        assertTrue(lifecycle.tryStart())
        assertTrue(lifecycle.close())
        val releases = AtomicInteger(0)
        val lease = TtsResourceLeaseGate()

        assertFalse(
            lease.markHeldAndValidate(
                isLifecycleActive = lifecycle::isActive,
                release = { releases.incrementAndGet() },
            ),
        )
        assertFalse(lease.isHeld())
        assertEquals(1, releases.get())
    }

    @Test
    fun `acquire and close race cannot leave lease held or release twice`() {
        repeat(200) {
            val lifecycle = TtsLifecycleGate()
            assertTrue(lifecycle.tryStart())
            val lease = TtsResourceLeaseGate()
            val releases = AtomicInteger(0)
            val ready = CountDownLatch(2)
            val releaseThreads = CountDownLatch(1)

            val acquire =
                thread(start = true) {
                    ready.countDown()
                    releaseThreads.await()
                    lease.markHeldAndValidate(
                        isLifecycleActive = lifecycle::isActive,
                        release = { releases.incrementAndGet() },
                    )
                }
            val close =
                thread(start = true) {
                    ready.countDown()
                    releaseThreads.await()
                    val activeAtClose = lifecycle.close()
                    if (activeAtClose) {
                        lease.releaseIfHeld { releases.incrementAndGet() }
                    }
                }

            ready.await()
            releaseThreads.countDown()
            acquire.join()
            close.join()

            lease.releaseIfHeld { releases.incrementAndGet() }
            assertFalse(lease.isHeld())
            assertEquals("one granted lease must be released exactly once", 1, releases.get())
        }
    }
}
