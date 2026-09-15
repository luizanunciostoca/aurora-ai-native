package ai.aurora.device.voice

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SingleFlightWorkDispatcherTest {
    @Test
    fun `blocking operation does not run on caller thread`() {
        val dispatcher = SingleFlightWorkDispatcher()
        val callerThread = Thread.currentThread().id
        val completed = CountDownLatch(1)
        var workerThread = callerThread

        try {
            assertTrue(
                dispatcher.submit(
                    operation = {
                        workerThread = Thread.currentThread().id
                        Unit
                    },
                    onComplete = { completed.countDown() },
                    onFailure = { completed.countDown() },
                ),
            )
            assertTrue(completed.await(2, TimeUnit.SECONDS))
            assertNotEquals(callerThread, workerThread)
        } finally {
            dispatcher.close()
        }
    }

    @Test
    fun `second operation is rejected while governed work is in flight`() {
        val dispatcher = SingleFlightWorkDispatcher()
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val completed = CountDownLatch(1)

        try {
            assertTrue(
                dispatcher.submit(
                    operation = {
                        entered.countDown()
                        release.await(2, TimeUnit.SECONDS)
                    },
                    onComplete = { completed.countDown() },
                    onFailure = { completed.countDown() },
                ),
            )
            assertTrue(entered.await(2, TimeUnit.SECONDS))
            assertTrue(dispatcher.hasInFlightWork())
            assertFalse(
                dispatcher.submit(
                    operation = { Unit },
                    onComplete = {},
                    onFailure = {},
                ),
            )
        } finally {
            release.countDown()
            completed.await(2, TimeUnit.SECONDS)
            dispatcher.close()
        }
    }

    @Test
    fun `close prevents new work without interrupting active operation`() {
        val dispatcher = SingleFlightWorkDispatcher()
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val completed = CountDownLatch(1)
        var interrupted = false

        assertTrue(
            dispatcher.submit(
                operation = {
                    entered.countDown()
                    try {
                        release.await(2, TimeUnit.SECONDS)
                    } catch (_: InterruptedException) {
                        interrupted = true
                    }
                },
                onComplete = { completed.countDown() },
                onFailure = { completed.countDown() },
            ),
        )
        assertTrue(entered.await(2, TimeUnit.SECONDS))
        dispatcher.close()
        assertFalse(
            dispatcher.submit(
                operation = { Unit },
                onComplete = {},
                onFailure = {},
            ),
        )
        release.countDown()
        assertTrue(completed.await(2, TimeUnit.SECONDS))
        assertFalse(interrupted)
    }
}
