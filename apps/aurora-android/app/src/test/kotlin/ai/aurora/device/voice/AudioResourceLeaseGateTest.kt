package ai.aurora.device.voice

import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AudioResourceLeaseGateTest {
    @Test
    fun `lease granted after lifecycle already closed is released immediately`() {
        val lifecycle = CloseableOperationGate()
        assertTrue(lifecycle.tryStart())
        assertTrue(lifecycle.close())
        val releases = AtomicInteger(0)
        val lease = AudioResourceLeaseGate()

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
    fun `lease acquisition and close race cannot leak or double release`() {
        repeat(200) {
            val lifecycle = CloseableOperationGate()
            assertTrue(lifecycle.tryStart())
            val lease = AudioResourceLeaseGate()
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
