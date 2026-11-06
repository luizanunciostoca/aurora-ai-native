package ai.aurora.device.inference

import ai.aurora.device.BuildConfig
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.security.MessageDigest
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executor
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import org.junit.Assert.*
import org.junit.Test

/** JVM state/ownership proofs with tiny synthetic bytes, not GGUF inference or Android acceptance. */
class NativeInferenceRuntimeTest {
    @Test fun disabledDefaultAndShippingFactoryDoNotStartDependencies() {
        val h = Harness(enabled = false)
        assertFailure(h.runtime.submit(h.request()), NativeInferenceFailure.DISABLED)
        assertEquals(NativeInferenceState.DISABLED, h.runtime.close())
        assertEquals(0, h.sourceCalls.get())
        assertEquals(0, h.storeCalls.get())
        assertEquals(0, h.engine.reserves.get())
        assertEquals(0, h.scheduler.scheduled.get())
        assertEquals(0, (h.work as ManualExecutor).size())
        assertFalse(BuildConfig.AURORA_NATIVE_INFERENCE_ENABLED)
        val shipped = NativeInferencePreparation.create()
        assertEquals(NativeInferenceState.DISABLED, shipped.state())
        assertFailure(shipped.submit(h.request()), NativeInferenceFailure.DISABLED)
        assertEquals(NativeInferenceState.DISABLED, shipped.close())
    }

    @Test fun missingAcceptedPromptCompositionStopsBeforeFileOrNativeWork() {
        val h = Harness()
        h.prompt = { ref, stop -> UncomposedNativePublicPromptSource.resolveCurrent(ref, stop) }
        val call = h.runtime.submit(h.request())
        h.drain()
        assertFailure(call, NativeInferenceFailure.NOT_COMPOSED)
        assertEquals(0, h.storeCalls.get())
        assertEquals(0, h.engine.reserves.get())
        assertEquals(NativeInferenceState.IDLE, h.runtime.state())
    }

    @Test fun malformedRequestsCannotInvokeAnyPort() {
        val h = Harness()
        val invalid = listOf(
            h.request().copy(requestRef = " "),
            h.request().copy(requestRef = "x".repeat(257)),
            h.request().copy(requestRef = "request\nprivate"),
            h.request().copy(deadlineNanos = h.clock.now.get()),
            h.request().copy(deadlineNanos = h.clock.now.get() + NativeInferenceBounds.MAX_DURATION_NANOS + 1),
            h.request().copy(budget = NativeInferenceBudget(maxOutputTokens = 0)),
            h.request().copy(budget = NativeInferenceBudget(maxOutputTokens = 257)),
            h.request().copy(budget = NativeInferenceBudget(contextTokens = 255)),
            h.request().copy(budget = NativeInferenceBudget(contextTokens = 2_049)),
            h.request().copy(budget = NativeInferenceBudget(maxOutputBytes = 32_769)),
        )
        invalid.forEach { assertFailure(h.runtime.submit(it), NativeInferenceFailure.INVALID_REQUEST) }
        h.clock.now.set(Long.MIN_VALUE)
        assertFailure(h.runtime.submit(NativeInferenceRequest("opaque", Long.MAX_VALUE)), NativeInferenceFailure.INVALID_REQUEST)
        assertEquals(0, h.sourceCalls.get())
        assertEquals(0, h.storeCalls.get())
        assertEquals(0, h.engine.reserves.get())
    }

    @Test fun successWaitsForTeardownAndNeverGrantsExecutionAuthority() {
        val h = Harness()
        val call = h.runtime.submit(h.request())
        assertTrue((h.work as ManualExecutor).runNext())
        assertNull(call.pollResult())
        assertEquals(NativeInferenceState.BUSY, h.runtime.state())
        assertEquals(0, h.model.closes.get())
        assertEquals(0, h.operation.releases.get())
        assertFailure(h.runtime.submit(h.request()), NativeInferenceFailure.BUSY)
        h.drain()
        val result = call.pollResult() as NativeInferenceResult.Text
        assertEquals("Resposta pública.", result.text)
        assertFalse(result.authorizesExecution)
        assertFalse(result.canInvokeTools)
        assertFalse(result.toString().contains(result.text))
        assertEquals("Pergunta pública.", String(h.operation.capturedPrompt, Charsets.UTF_8))
        assertEquals(1, h.operation.releases.get())
        assertEquals(1, h.model.closes.get())
        assertEquals(NativeInferenceState.IDLE, h.runtime.state())
        call.cancel()
        assertSame(result, call.pollResult())
        assertEquals(0, h.operation.cancels.get())
    }

    @Test fun wrongReferenceAndMalformedPromptDoNotOpenTheModel() {
        val prompts = listOf(
            NativePromptResolution.PublicText("other-ref", "public".toByteArray()),
            NativePromptResolution.PublicText("opaque-request", byteArrayOf()),
            NativePromptResolution.PublicText("opaque-request", " \n ".toByteArray()),
            NativePromptResolution.PublicText("opaque-request", byteArrayOf(0xC3.toByte(), 0x28)),
            NativePromptResolution.PublicText("opaque-request", "nul\u0000data".toByteArray()),
            NativePromptResolution.PublicText("opaque-request", ByteArray(8_193) { 'a'.code.toByte() }),
            NativePromptResolution.Unavailable,
        )
        for (prompt in prompts) {
            val h = Harness()
            h.prompt = { _, _ -> prompt }
            val call = h.runtime.submit(h.request())
            h.drain()
            assertTrue(call.pollResult() is NativeInferenceResult.Abstained)
            assertEquals(0, h.storeCalls.get())
            assertEquals(0, h.engine.reserves.get())
        }
    }

    @Test fun exceptionsAreRedactedAndFileFailuresAreNotNativeSuccess() {
        val h = Harness()
        h.prompt = { _, _ -> throw IllegalStateException("SECRET_PROMPT") }
        val call = h.runtime.submit(h.request())
        h.drain()
        assertFailure(call, NativeInferenceFailure.NATIVE_FAILURE)
        assertFalse(call.pollResult().toString().contains("SECRET_PROMPT"))
        assertEquals(0, h.storeCalls.get())
        val fileFailure = Harness()
        fileFailure.open = { throw IllegalStateException("private/path") }
        val failed = fileFailure.runtime.submit(fileFailure.request())
        fileFailure.drain()
        assertFailure(failed, NativeInferenceFailure.MODEL_UNAVAILABLE)
        assertEquals(0, fileFailure.engine.reserves.get())
    }

    @Test fun corruptModelAndStampChangeAcrossReservationAreRefused() {
        val h = Harness()
        h.model.bytes[h.model.bytes.lastIndex] = 0
        val corrupted = h.runtime.submit(h.request())
        h.drain()
        assertFailure(corrupted, NativeInferenceFailure.MODEL_INVALID)
        assertEquals(0, h.engine.reserves.get())
        assertEquals(1, h.model.closes.get())
        val changed = Harness()
        changed.engine.onReserve = { changed.model.metadata = changed.model.metadata.copy(changedNanos = 19) }
        val call = changed.runtime.submit(changed.request())
        changed.drain()
        assertFailure(call, NativeInferenceFailure.MODEL_INVALID)
        assertEquals(0, changed.operation.generates.get())
        assertEquals(1, changed.operation.releases.get())
        assertEquals(1, changed.model.closes.get())
    }

    @Test fun cancelBeforeWorkerPreventsAllModelAndPromptWork() {
        val h = Harness()
        val call = h.runtime.submit(h.request())
        call.cancel()
        assertFailure(call, NativeInferenceFailure.CANCELLED)
        assertEquals(NativeInferenceState.BUSY, h.runtime.state())
        h.drain()
        assertEquals(0, h.sourceCalls.get())
        assertEquals(0, h.storeCalls.get())
        assertEquals(0, h.operation.generates.get())
        assertEquals(NativeInferenceState.IDLE, h.runtime.state())
    }

    @Test fun blockedGenerationCannotDelayCancelOrReleaseItsFlightEarly() {
        val worker = daemonExecutor()
        val entered = CountDownLatch(1)
        val allowReturn = CountDownLatch(1)
        val h = Harness(work = worker)
        h.operation.onGenerate = { entered.countDown(); allowReturn.await(); goodOutput() }
        try {
            val call = h.runtime.submit(h.request())
            await(entered)
            call.cancel()
            assertFailure(call, NativeInferenceFailure.CANCELLED)
            assertFailure(h.runtime.submit(h.request()), NativeInferenceFailure.BUSY)
            assertEquals(0, h.model.closes.get())
            allowReturn.countDown()
            barrier(worker)
            assertEquals(0, h.operation.releases.get()) // Cancellation is still queued.
            assertEquals(NativeInferenceState.BUSY, h.runtime.state())
            (h.cancellations as ManualExecutor).drain()
            await(h.model.closed)
            barrier(worker)
            assertEquals(NativeInferenceState.IDLE, h.runtime.state())
            assertFailure(call, NativeInferenceFailure.CANCELLED)
        } finally {
            allowReturn.countDown()
            worker.shutdownNow()
        }
    }

    @Test fun blockedCancelSignalDoesNotBlockCallerOrPermitEarlyTeardown() {
        val cancellationLane = daemonExecutor()
        val cancelEntered = CountDownLatch(1)
        val allowCancel = CountDownLatch(1)
        val h = Harness(cancellations = cancellationLane)
        h.operation.onCancel = { cancelEntered.countDown(); allowCancel.await(); true }
        val call = h.runtime.submit(h.request())
        h.operation.onGenerate = { call.cancel(); goodOutput() }
        try {
            (h.work as ManualExecutor).runNext()
            await(cancelEntered)
            assertFailure(call, NativeInferenceFailure.CANCELLED)
            assertEquals(NativeInferenceState.BUSY, h.runtime.state())
            assertEquals(0, h.operation.releases.get())
            assertEquals(0, h.model.closes.get())
            allowCancel.countDown()
            barrier(cancellationLane)
            h.drain()
            assertEquals(NativeInferenceState.IDLE, h.runtime.state())
            assertEquals(1, h.operation.releases.get())
        } finally {
            allowCancel.countDown()
            cancellationLane.shutdownNow()
        }
    }

    @Test fun deadlineCompletesWhileHashingIsBlockedWithoutClosingItsDescriptor() {
        val worker = daemonExecutor()
        val hashEntered = CountDownLatch(1)
        val allowHash = CountDownLatch(1)
        val h = Harness(work = worker)
        h.model.beforeHash = { hashEntered.countDown(); allowHash.await() }
        try {
            val request = h.request()
            val call = h.runtime.submit(request)
            await(hashEntered)
            h.clock.now.set(request.deadlineNanos)
            h.scheduler.fireDue()
            assertFailure(call, NativeInferenceFailure.TIMEOUT)
            assertEquals(0, h.model.closes.get())
            assertEquals(0, h.engine.reserves.get())
            assertFailure(h.runtime.submit(h.request()), NativeInferenceFailure.BUSY)
            allowHash.countDown()
            await(h.model.closed)
            barrier(worker)
            assertEquals(NativeInferenceState.IDLE, h.runtime.state())
            assertFailure(call, NativeInferenceFailure.TIMEOUT)
        } finally {
            allowHash.countDown()
            worker.shutdownNow()
        }
    }

    @Test fun deadlineDiscardsLateGenerationAndWaitsForCancelAndCleanup() {
        val worker = daemonExecutor()
        val entered = CountDownLatch(1)
        val allowReturn = CountDownLatch(1)
        val h = Harness(work = worker)
        h.operation.onGenerate = { entered.countDown(); allowReturn.await(); goodOutput() }
        try {
            val request = h.request()
            val call = h.runtime.submit(request)
            await(entered)
            h.clock.now.set(request.deadlineNanos)
            h.scheduler.fireDue()
            assertFailure(call, NativeInferenceFailure.TIMEOUT)
            assertEquals(NativeInferenceState.BUSY, h.runtime.state())
            allowReturn.countDown()
            barrier(worker)
            assertEquals(0, h.model.closes.get())
            (h.cancellations as ManualExecutor).drain()
            await(h.model.closed)
            barrier(worker)
            assertFailure(call, NativeInferenceFailure.TIMEOUT)
            assertEquals(NativeInferenceState.IDLE, h.runtime.state())
        } finally {
            allowReturn.countDown()
            worker.shutdownNow()
        }
    }

    @Test fun cancelAndDeadlineRemainBoundedWhileReleaseIsBlocked() {
        for (byDeadline in listOf(false, true)) {
            val worker = daemonExecutor()
            val releaseEntered = CountDownLatch(1)
            val allowRelease = CountDownLatch(1)
            val h = Harness(work = worker)
            h.operation.onRelease = { releaseEntered.countDown(); allowRelease.await(); true }
            try {
                val request = h.request()
                val call = h.runtime.submit(request)
                await(releaseEntered)
                assertNull(call.pollResult())
                if (byDeadline) { h.clock.now.set(request.deadlineNanos); h.scheduler.fireDue() } else call.cancel()
                val expected = if (byDeadline) NativeInferenceFailure.TIMEOUT else NativeInferenceFailure.CANCELLED
                assertFailure(call, expected)
                assertEquals(NativeInferenceState.BUSY, h.runtime.state())
                assertEquals(0, h.model.closes.get())
                assertEquals(0, h.operation.cancels.get()) // Never race cancel against release.
                allowRelease.countDown()
                await(h.model.closed)
                barrier(worker)
                assertFailure(call, expected)
                assertEquals(NativeInferenceState.IDLE, h.runtime.state())
            } finally {
                allowRelease.countDown()
                worker.shutdownNow()
            }
        }
    }

    @Test fun cancellationDuringReservationIsRetainedBeforeOperationPublication() {
        val worker = daemonExecutor()
        val reserveEntered = CountDownLatch(1)
        val allowReserve = CountDownLatch(1)
        val h = Harness(work = worker)
        h.engine.onReserve = { reserveEntered.countDown(); allowReserve.await() }
        try {
            val call = h.runtime.submit(h.request())
            await(reserveEntered)
            call.cancel()
            assertFailure(call, NativeInferenceFailure.CANCELLED)
            assertEquals(0, h.operation.generates.get())
            allowReserve.countDown()
            barrier(worker)
            assertEquals(0, h.operation.generates.get())
            assertEquals(0, h.model.closes.get())
            (h.cancellations as ManualExecutor).drain()
            await(h.model.closed)
            barrier(worker)
            assertEquals(1, h.operation.cancels.get())
            assertEquals(NativeInferenceState.IDLE, h.runtime.state())
        } finally {
            allowReserve.countDown()
            worker.shutdownNow()
        }
    }

    @Test fun uncertainReleaseRetainsTheOriginalDescriptorAndQuarantines() {
        for (throws in listOf(false, true)) {
            val h = Harness()
            h.operation.onRelease = { if (throws) throw IllegalStateException("private-native-detail") else false }
            val call = h.runtime.submit(h.request())
            h.drain()
            assertFailure(call, NativeInferenceFailure.QUARANTINED)
            assertEquals(0, h.model.closes.get())
            assertEquals(NativeInferenceState.QUARANTINED, h.runtime.state())
            assertFailure(h.runtime.submit(h.request()), NativeInferenceFailure.QUARANTINED)
            assertEquals(NativeInferenceState.QUARANTINED, h.runtime.close())
        }
    }

    @Test fun uncertainDescriptorCloseCannotDeliverTextOrPermitASecondFlight() {
        val h = Harness()
        h.model.closeFails = true
        val call = h.runtime.submit(h.request())
        h.drain()
        assertEquals(1, h.operation.releases.get())
        assertEquals(1, h.model.closes.get())
        assertFailure(call, NativeInferenceFailure.QUARANTINED)
        assertFailure(h.runtime.submit(h.request()), NativeInferenceFailure.QUARANTINED)
    }

    @Test fun uncertainHashDuplicateCloseIsNotRepairedByClosingTheOriginal() {
        val h = Harness()
        h.model.hashCloseFails = true
        val call = h.runtime.submit(h.request())
        h.drain()
        assertEquals(1, h.model.hashCloses.get())
        assertEquals(1, h.model.closes.get())
        assertEquals(0, h.engine.reserves.get())
        assertFailure(call, NativeInferenceFailure.QUARANTINED)
        assertEquals(NativeInferenceState.QUARANTINED, h.runtime.state())
        assertFailure(h.runtime.submit(h.request()), NativeInferenceFailure.QUARANTINED)
        assertEquals(1, h.model.hashCloses.get()) // No retry of an uncertain, possibly reused FD.
    }

    @Test fun ownershipFailureBeforeModelHandoffQuarantinesInsteadOfAllowingRetry() {
        val h = Harness()
        h.open = { throw NativeModelOwnershipUncertain() }
        val call = h.runtime.submit(h.request())
        h.drain()
        assertFailure(call, NativeInferenceFailure.QUARANTINED)
        assertEquals(NativeInferenceState.QUARANTINED, h.runtime.state())
        assertFailure(h.runtime.submit(h.request()), NativeInferenceFailure.QUARANTINED)
        assertEquals(1, h.storeCalls.get())
        assertEquals(0, h.engine.reserves.get())
        assertFalse(call.pollResult().toString().contains("path"))
    }

    @Test fun finalDeadlineCheckRunsAfterReleaseEvenIfTimerDidNotFire() {
        val h = Harness()
        val request = h.request()
        h.operation.onRelease = { h.clock.now.set(request.deadlineNanos); true }
        val call = h.runtime.submit(request)
        h.drain()
        assertFailure(call, NativeInferenceFailure.TIMEOUT)
        assertEquals(1, h.model.closes.get())
        assertEquals(NativeInferenceState.IDLE, h.runtime.state())
    }

    @Test fun nonSuccessOutputMalformedUtf8ToolsAndInvalidCountsAreNeverText() {
        val outputs = listOf<() -> NativeGenerationResult>(
            { NativeGenerationResult(1, byteArrayOf(), 0, 0) },
            { NativeGenerationResult(2, byteArrayOf(), 0, 0) },
            { NativeGenerationResult(3, byteArrayOf(), 0, 0) },
            { NativeGenerationResult(4, byteArrayOf(), 0, 0) },
            { NativeGenerationResult(5, byteArrayOf(), 0, 0) },
            { NativeGenerationResult(6, byteArrayOf(), 0, 0) },
            { NativeGenerationResult(99, byteArrayOf(), 0, 0) },
            { NativeGenerationResult(1, "must-not-escape".toByteArray(), 2, 2) },
            { NativeGenerationResult(0, byteArrayOf(), 2, 2) },
            { NativeGenerationResult(0, byteArrayOf(0xC3.toByte(), 0x28), 2, 2) },
            { NativeGenerationResult(0, "<tool_call>danger</tool_call>".toByteArray(), 2, 2) },
            { NativeGenerationResult(0, "{\"tool_calls\":[]}".toByteArray(), 2, 2) },
            { NativeGenerationResult(0, "valid".toByteArray(), 0, 1) },
            { NativeGenerationResult(0, "valid".toByteArray(), 2, 0) },
            { NativeGenerationResult(0, "valid".toByteArray(), 2, 65) },
            { NativeGenerationResult(0, "valid".toByteArray(), 1_000, 1) },
            { NativeGenerationResult(0, ByteArray(8_193) { 'x'.code.toByte() }, 2, 1) },
        )
        for (output in outputs) {
            val h = Harness()
            h.operation.onGenerate = output
            val call = h.runtime.submit(h.request())
            h.drain()
            val result = call.pollResult()
            assertTrue(result is NativeInferenceResult.Abstained)
            assertFalse(result!!.authorizesExecution)
            assertFalse(result.canInvokeTools)
            assertEquals(1, h.model.closes.get())
        }
    }

    @Test fun schedulerAndInitialWorkerRejectionNeverStartModelWork() {
        val h = Harness()
        h.scheduler.fail = true
        assertFailure(h.runtime.submit(h.request()), NativeInferenceFailure.NATIVE_UNAVAILABLE)
        assertEquals(NativeInferenceState.IDLE, h.runtime.state())
        assertEquals(0, h.storeCalls.get())
        val rejected = Harness()
        (rejected.work as ManualExecutor).reject = true
        assertFailure(rejected.runtime.submit(rejected.request()), NativeInferenceFailure.NATIVE_UNAVAILABLE)
        assertEquals(NativeInferenceState.IDLE, rejected.runtime.state())
        assertEquals(0, rejected.engine.reserves.get())
    }

    @Test fun cleanupRejectionQuarantinesWithoutClosingResourcesOnCaller() {
        val h = Harness()
        val call = h.runtime.submit(h.request())
        val queue = h.work as ManualExecutor
        queue.reject = true // The initial worker is queued; only its cleanup submission is rejected.
        assertTrue(queue.runNext())
        assertFailure(call, NativeInferenceFailure.QUARANTINED)
        assertEquals(0, h.operation.releases.get())
        assertEquals(0, h.model.closes.get())
        assertEquals(NativeInferenceState.QUARANTINED, h.runtime.state())
    }

    @Test fun clockFailureAndCloseAreFailClosedWithoutClaimingQuiescence() {
        val failedClock = Harness()
        failedClock.clock.fail = true
        assertFailure(failedClock.runtime.submit(failedClock.request()), NativeInferenceFailure.INVALID_REQUEST)
        assertEquals(0, failedClock.storeCalls.get())
        val h = Harness()
        val call = h.runtime.submit(h.request())
        assertEquals(NativeInferenceState.CLOSING, h.runtime.close())
        assertFailure(call, NativeInferenceFailure.CLOSED)
        assertFailure(h.runtime.submit(h.request()), NativeInferenceFailure.CLOSED)
        h.drain()
        assertEquals(NativeInferenceState.CLOSED, h.runtime.state())
        assertEquals(0, h.storeCalls.get())
    }

    private class Harness(
        val work: Executor = ManualExecutor(),
        val cancellations: Executor = ManualExecutor(),
        enabled: Boolean = true,
    ) {
        val clock = TestClock()
        val scheduler = TestScheduler(clock)
        val sourceCalls = AtomicInteger()
        val storeCalls = AtomicInteger()
        val model = TestModel()
        val operation = TestOperation()
        val engine = TestEngine(operation)
        var prompt: (String, NativeStopSignal) -> NativePromptResolution = { ref, _ ->
            NativePromptResolution.PublicText(ref, "Pergunta pública.".toByteArray())
        }
        var open: () -> NativeModelHandle = { model }
        val runtime = BoundedNativeInferenceRuntime(
            modelStore = NativeModelStore { storeCalls.incrementAndGet(); open() },
            engine = engine,
            worker = work,
            cancellationExecutor = cancellations,
            scheduler = scheduler,
            promptSource = NativePublicPromptSource { ref, stop -> sourceCalls.incrementAndGet(); prompt(ref, stop) },
            verifier = NativeModelVerifier(testModelBytes().size.toLong(), sha256(testModelBytes())),
            clock = clock,
            enabled = enabled,
        )
        fun request(): NativeInferenceRequest = NativeInferenceRequest("opaque-request", clock.now.get() + 1_000_000_000L)
        fun drain() { (work as ManualExecutor).drain() }
    }

    private class TestClock : NativeMonotonicClock {
        val now = AtomicLong(100L)
        @Volatile var fail = false
        override fun nowNanos(): Long = if (fail) throw IllegalStateException("clock") else now.get()
    }

    private class ManualExecutor : Executor {
        private val tasks = ConcurrentLinkedQueue<Runnable>()
        @Volatile var reject = false
        override fun execute(command: Runnable) {
            if (reject) throw RejectedExecutionException()
            tasks.add(command)
        }
        fun runNext(): Boolean = tasks.poll()?.let { it.run(); true } ?: false
        fun size(): Int = tasks.size
        fun drain() {
            var runs = 0
            while (runNext()) check(++runs < 100) { "Unexpected scheduling loop" }
        }
    }

    private class TestScheduler(private val clock: TestClock) : NativeDeadlineScheduler {
        private class Entry(val deadline: Long, val action: () -> Unit) {
            @Volatile var cancelled = false
            @Volatile var fired = false
        }
        private val entries = mutableListOf<Entry>()
        val scheduled = AtomicInteger()
        @Volatile var fail = false
        override fun schedule(delayNanos: Long, action: () -> Unit): NativeScheduledTask {
            if (fail) throw IllegalStateException("scheduler")
            val entry = Entry(clock.now.get() + delayNanos, action)
            synchronized(entries) { entries.add(entry) }
            scheduled.incrementAndGet()
            return NativeScheduledTask { entry.cancelled = true }
        }
        fun fireDue() {
            val snapshot = synchronized(entries) { entries.toList() }
            snapshot.filter { !it.cancelled && !it.fired && it.deadline <= clock.now.get() }.forEach {
                it.fired = true
                it.action()
            }
        }
    }

    private class TestModel : NativeModelHandle {
        val bytes = testModelBytes()
        @Volatile var metadata = NativeModelStamp(1, 2, bytes.size.toLong(), 3, 4, 5, 6, true, true, true)
        @Volatile var beforeHash: () -> Unit = {}
        @Volatile var closeFails = false
        @Volatile var hashCloseFails = false
        @Volatile var hashOwnershipUncertain = false
        val closes = AtomicInteger()
        val hashCloses = AtomicInteger()
        val closed = CountDownLatch(1)
        override val descriptor: Int = 17
        override fun stamp(): NativeModelStamp = metadata
        override fun openHashStream(): InputStream {
            beforeHash()
            return object : ByteArrayInputStream(bytes) {
                override fun close() {
                    hashCloses.incrementAndGet()
                    if (hashCloseFails) {
                        hashOwnershipUncertain = true
                        throw NativeModelOwnershipUncertain()
                    }
                    super.close()
                }
            }
        }
        override fun close() {
            closes.incrementAndGet()
            if (closeFails) throw IllegalStateException("private-file-close")
            closed.countDown()
            if (hashOwnershipUncertain) throw NativeModelOwnershipUncertain()
        }
    }

    private class TestEngine(private val operation: TestOperation) : NativeTextEngine {
        val reserves = AtomicInteger()
        @Volatile var onReserve: () -> Unit = {}
        override fun reserve(): NativeTextOperation { reserves.incrementAndGet(); onReserve(); return operation }
    }

    private class TestOperation : NativeTextOperation {
        val generates = AtomicInteger()
        val cancels = AtomicInteger()
        val releases = AtomicInteger()
        @Volatile var capturedPrompt = byteArrayOf()
        @Volatile var onGenerate: () -> NativeGenerationResult = { goodOutput() }
        @Volatile var onCancel: () -> Boolean = { true }
        @Volatile var onRelease: () -> Boolean = { true }
        override fun generate(modelDescriptor: Int, promptUtf8: ByteArray, budget: NativeInferenceBudget, remainingBudgetNanos: Long): NativeGenerationResult {
            generates.incrementAndGet()
            capturedPrompt = promptUtf8.copyOf()
            assertEquals(17, modelDescriptor)
            assertTrue(remainingBudgetNanos in 1..NativeInferenceBounds.MAX_DURATION_NANOS)
            return onGenerate()
        }
        override fun cancel(): Boolean { cancels.incrementAndGet(); return onCancel() }
        override fun release(): Boolean { releases.incrementAndGet(); return onRelease() }
    }

    private companion object {
        fun testModelBytes(): ByteArray = byteArrayOf(71, 71, 85, 70, 3, 0, 0, 0, 11, 22, 33, 44)
        fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        fun goodOutput(): NativeGenerationResult = NativeGenerationResult(0, "Resposta pública.".toByteArray(), 8, 4)
        fun daemonExecutor(): ExecutorService = Executors.newSingleThreadExecutor { task -> Thread(task, "native-inference-jvm-test").apply { isDaemon = true } }
        fun await(latch: CountDownLatch) { assertTrue("JVM fixture did not reach the expected boundary", latch.await(5, TimeUnit.SECONDS)) }
        fun barrier(executor: ExecutorService) { executor.submit {}.get(5, TimeUnit.SECONDS) }
        fun assertFailure(call: NativeInferenceCall, expected: NativeInferenceFailure) {
            val result = call.pollResult()
            assertTrue("Expected $expected, got $result", result is NativeInferenceResult.Abstained)
            assertEquals(expected, (result as NativeInferenceResult.Abstained).reason)
            assertFalse(result.authorizesExecution)
            assertFalse(result.canInvokeTools)
        }
    }
}
