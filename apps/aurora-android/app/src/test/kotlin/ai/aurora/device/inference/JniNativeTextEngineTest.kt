package ai.aurora.device.inference

import java.lang.reflect.Modifier
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Adapter/ABI tests with fake transports only; no test loads a native library or a real model. */
class JniNativeTextEngineTest {
    @Test
    fun declaresExactlyTheFourStaticNativeMethodsWithoutInitializingTheBinding() {
        val binding = Class.forName(
            "ai.aurora.device.inference.NativeLlamaBindings", false, javaClass.classLoader,
        )
        val nativeMethods = binding.declaredMethods.filter { Modifier.isNative(it.modifiers) }
        assertEquals(setOf("reserve", "generate", "cancel", "release"), nativeMethods.map { it.name }.toSet())
        assertEquals(4, nativeMethods.size)
        for (method in nativeMethods) assertTrue(Modifier.isStatic(method.modifiers))
        assertEquals(java.lang.Long.TYPE, binding.getDeclaredMethod("reserve").returnType)
        assertEquals(java.lang.Boolean.TYPE, binding.getDeclaredMethod("cancel", java.lang.Long.TYPE).returnType)
        assertEquals(java.lang.Boolean.TYPE, binding.getDeclaredMethod("release", java.lang.Long.TYPE).returnType)
        val generate = binding.getDeclaredMethod(
            "generate", java.lang.Long.TYPE, Integer.TYPE, ByteArray::class.java,
            Integer.TYPE, Integer.TYPE, Integer.TYPE, java.lang.Long.TYPE, NativeStopSignal::class.java,
        )
        assertEquals(NativeGenerationResult::class.java, generate.returnType)
        assertEquals(java.lang.Boolean.TYPE, NativeStopSignal::class.java.getDeclaredMethod("isStopped").returnType)
        assertEquals(
            NativeStopSignal::class.java,
            NativeTextOperation::class.java.declaredMethods.single { it.name == "generate" }.parameterTypes.last(),
        )
        assertFalse(binding.declaredMethods.any { it.name.endsWith("\$default") })
    }

    @Test
    fun preservesTheExactResultConstructorAndDoesNotRenderBodyInToString() {
        val resultClass = Class.forName(
            "ai.aurora.device.inference.NativeGenerationResult", false, javaClass.classLoader,
        )
        val constructor = resultClass.getDeclaredConstructor(
            Integer.TYPE, ByteArray::class.java, Integer.TYPE, Integer.TYPE,
        )
        assertEquals(
            listOf(Integer.TYPE, ByteArray::class.java, Integer.TYPE, Integer.TYPE),
            constructor.parameterTypes.toList(),
        )
        val result = NativeGenerationResult(0, "body-must-not-be-logged".toByteArray(), 12, 1)
        assertFalse(result.toString().contains("body-must-not-be-logged"))
        assertTrue(result.toString().contains("REDACTED"))
    }

    @Test
    fun constructingTheAdapterDoesNotLoadOrReserveAnything() {
        val api = FakeApi()
        val engine = JniNativeTextEngine(api)
        assertEquals(0, api.loadCalls)
        assertEquals(0, api.reserveCalls)
        assertEquals(0, api.generateCalls)

        assertNotNull(engine.reserve())
        assertEquals(1, api.loadCalls)
        assertEquals(1, api.reserveCalls)
        assertEquals(0, api.generateCalls)
    }

    @Test
    fun libraryAbsenceOrLoadFailureCannotReserveAnOperation() {
        val absent = FakeApi().also { it.libraryAvailable = false }
        assertNull(JniNativeTextEngine(absent).reserve())
        assertEquals(0, absent.reserveCalls)
        for (error in listOf(UnsatisfiedLinkError("fixture ABI absence"), SecurityException("fixture denial"))) {
            val api = FakeApi().also { it.loadError = error }
            assertNull(JniNativeTextEngine(api).reserve())
            assertEquals(0, api.reserveCalls)
            assertEquals(0, api.generateCalls)
        }
    }

    @Test
    fun zeroNegativeOrFailedReservationsAreUnavailable() {
        for (id in listOf(0L, -1L, Long.MIN_VALUE)) {
            val api = FakeApi().also { it.reservation = id }
            assertNull(JniNativeTextEngine(api).reserve())
            assertEquals(1, api.reserveCalls)
            assertEquals(0, api.generateCalls)
        }
        val failed = FakeApi().also { it.reserveError = IllegalStateException("fixture reserve failure") }
        assertNull(JniNativeTextEngine(failed).reserve())
        assertEquals(0, failed.generateCalls)
    }

    @Test
    fun forwardsThePinnedIdAndBoundsAndCopiesInputAndOutput() {
        val api = FakeApi()
        val nativeBody = "4 🌊".toByteArray(Charsets.UTF_8)
        api.response = NativeGenerationResult(0, nativeBody, 12, 3)
        val operation = newOperation(api)
        val prompt = prompt()
        val originalPrompt = prompt.copyOf()
        val budget = NativeInferenceBudget(8, 64, 256)
        val checkpointCalls = AtomicInteger()
        val currentness = NativeStopSignal { checkpointCalls.incrementAndGet(); false }

        val result = operation.generate(47, prompt, budget, 2_000_000_000L, currentness)
        assertEquals(NativeGenerationStatus.SUCCESS_EOG, result.statusCode)
        assertArrayEquals(nativeBody, result.outputUtf8)
        assertNotSame(nativeBody, result.outputUtf8)
        assertArrayEquals(originalPrompt, prompt)
        assertNotSame(prompt, api.retainedPrompt)
        assertArrayEquals(originalPrompt, api.observedPrompt)
        assertTrue(checkNotNull(api.retainedPrompt).all { it == 0.toByte() })
        assertEquals(41L, api.generatedId)
        assertEquals(47, api.generatedDescriptor)
        assertEquals(8, api.generatedMaxTokens)
        assertEquals(64, api.generatedMaxBytes)
        assertEquals(256, api.generatedContextTokens)
        assertEquals(2_000_000_000L, api.generatedBudgetNanos)
        assertSame(currentness, api.generatedCurrentness)
        assertEquals(0, checkpointCalls.get()) // The adapter does not precompute or replace the query.
        assertFalse(checkNotNull(api.generatedCurrentness).isStopped())
        assertEquals(1, checkpointCalls.get())
        nativeBody.fill(0)
        assertEquals("4 🌊", String(result.outputUtf8, Charsets.UTF_8))
        assertTrue(operation.release())
    }

    @Test
    fun oneReservationCanInvokeGenerateOnlyOnce() {
        val api = FakeApi()
        val operation = newOperation(api)
        assertEquals(NativeGenerationStatus.SUCCESS_EOG, generate(operation).statusCode)
        assertFailure(NativeGenerationStatus.INVALID, generate(operation))
        assertEquals(1, api.generateCalls)
        assertTrue(operation.release())
        assertFailure(NativeGenerationStatus.INVALID, generate(operation))
        assertEquals(1, api.generateCalls)
    }

    @Test
    fun rejectsInvalidBudgetsWithoutInvokingNativeGenerate() {
        val invalid = listOf(
            NativeInferenceBudget(maxOutputTokens = 0),
            NativeInferenceBudget(maxOutputTokens = -1),
            NativeInferenceBudget(maxOutputTokens = 257),
            NativeInferenceBudget(maxOutputBytes = 0),
            NativeInferenceBudget(maxOutputBytes = -1),
            NativeInferenceBudget(maxOutputBytes = 32_769),
            NativeInferenceBudget(contextTokens = 255),
            NativeInferenceBudget(contextTokens = 2_049),
            NativeInferenceBudget(maxOutputTokens = 256, contextTokens = 256),
        )
        for (budget in invalid) {
            val api = FakeApi()
            val operation = newOperation(api)
            assertFailure(NativeGenerationStatus.INVALID, operation.generate(47, prompt(), budget, 1_000_000_000, noStop()))
            assertEquals(0, api.generateCalls)
            assertTrue(operation.release())
        }
    }

    @Test
    fun rejectsExpiredOversizedOrNegativeDurationAndInvalidDescriptor() {
        for (duration in listOf(0L, -1L, Long.MIN_VALUE, NativeInferenceBounds.MAX_DURATION_NANOS + 1, Long.MAX_VALUE)) {
            val api = FakeApi()
            val operation = newOperation(api)
            assertFailure(NativeGenerationStatus.INVALID, operation.generate(47, prompt(), budget(), duration, noStop()))
            assertEquals(0, api.generateCalls)
            assertTrue(operation.release())
        }
        val api = FakeApi()
        val operation = newOperation(api)
        assertFailure(NativeGenerationStatus.INVALID, operation.generate(-1, prompt(), budget(), 1_000_000_000, noStop()))
        assertEquals(0, api.generateCalls)
        assertTrue(operation.release())
    }

    @Test
    fun rejectsEmptyBlankNulMalformedAndOversizedInputBeforeNativeInvocation() {
        val invalid = listOf(
            ByteArray(0), " \n\t".toByteArray(), "a\u0000b".toByteArray(),
            byteArrayOf(0x80.toByte()),
            byteArrayOf(0xc0.toByte(), 0xaf.toByte()),
            byteArrayOf(0xed.toByte(), 0xa0.toByte(), 0x80.toByte()),
            byteArrayOf(0xf4.toByte(), 0x90.toByte(), 0x80.toByte(), 0x80.toByte()),
            byteArrayOf(0xf0.toByte(), 0x9f.toByte(), 0x92.toByte()),
            ByteArray(NativeInferenceBounds.MAX_INPUT_BYTES + 1) { 'a'.code.toByte() },
        )
        for (bytes in invalid) {
            val api = FakeApi()
            val operation = newOperation(api)
            assertFailure(NativeGenerationStatus.INVALID, operation.generate(47, bytes, budget(), 1_000_000_000, noStop()))
            assertEquals(0, api.generateCalls)
            assertTrue(operation.release())
        }
    }

    @Test
    fun refusesBodyOnEveryNonSuccessStatusAndUnknownStatus() {
        for (code in 1..6) {
            val api = FakeApi().also { it.response = NativeGenerationResult(code, "untrusted partial".toByteArray(), 8, 4) }
            val operation = newOperation(api)
            assertFailure(NativeGenerationStatus.FAILURE, generate(operation))
            assertTrue(operation.release())

            val empty = FakeApi().also { it.response = NativeGenerationResult(code, ByteArray(0), 999, 999) }
            val emptyOperation = newOperation(empty)
            assertFailure(code, generate(emptyOperation))
            assertTrue(emptyOperation.release())
        }
        for (code in listOf(-1, 7, Int.MIN_VALUE, Int.MAX_VALUE)) {
            val api = FakeApi().also { it.response = NativeGenerationResult(code, ByteArray(0), 0, 0) }
            val operation = newOperation(api)
            assertFailure(NativeGenerationStatus.FAILURE, generate(operation))
            assertTrue(operation.release())
        }
    }

    @Test
    fun refusesInvalidSuccessCountsEvenWhenResponseTextLooksPlausible() {
        val invalidCounts = listOf(
            0 to 1, -1 to 1, 961 to 1, Int.MAX_VALUE to 1,
            12 to 0, 12 to -1, 12 to 65, 12 to Int.MAX_VALUE,
        )
        for ((inputTokens, outputTokens) in invalidCounts) {
            val api = FakeApi().also {
                it.response = NativeGenerationResult(0, "4".toByteArray(), inputTokens, outputTokens)
            }
            val operation = newOperation(api)
            assertFailure(NativeGenerationStatus.FAILURE, generate(operation))
            assertTrue(operation.release())
        }
    }

    @Test
    fun refusesMalformedBlankOversizedOrToolFormattedSuccessOutput() {
        val invalid = listOf(
            ByteArray(0), " \n".toByteArray(), "4\u0000".toByteArray(),
            byteArrayOf(0xed.toByte(), 0xa0.toByte(), 0x80.toByte()),
            byteArrayOf(0xc0.toByte(), 0xaf.toByte()),
            byteArrayOf(0xf0.toByte(), 0x9f.toByte()),
            ByteArray(8_193) { 'a'.code.toByte() },
            "<tool_call>{}</tool_call>".toByteArray(),
            "</TOOL_CALL>".toByteArray(),
            "{\"tool_calls\":[]}".toByteArray(),
            "{\"FUNCTION_CALL\":{}}".toByteArray(),
        )
        for (body in invalid) {
            val api = FakeApi().also { it.response = NativeGenerationResult(0, body, 12, 1) }
            val operation = newOperation(api)
            assertFailure(NativeGenerationStatus.FAILURE, generate(operation))
            assertTrue(operation.release())
        }
    }

    @Test
    fun nativeExceptionsAndLinkageFailureCannotLeakBodiesAndClearThePromptCopy() {
        for ((error, status) in listOf(
            IllegalStateException("private exception fixture") to NativeGenerationStatus.FAILURE,
            UnsatisfiedLinkError("private linkage fixture") to NativeGenerationStatus.UNAVAILABLE,
        )) {
            val api = FakeApi().also { it.generateError = error }
            val operation = newOperation(api)
            val result = generate(operation)
            assertFailure(status, result)
            assertFalse(result.toString().contains("private"))
            assertTrue(checkNotNull(api.retainedPrompt).all { it == 0.toByte() })
            assertTrue(operation.release())
        }
    }

    @Test
    fun forwardsPreGenerationCancellationToTheSameOpaqueIdWithoutResettingIt() {
        val api = FakeApi().also { it.cancelControlsResponse = true }
        val operation = newOperation(api)
        assertTrue(operation.cancel())
        assertEquals(listOf(41L), api.cancelledIds)
        assertFailure(NativeGenerationStatus.CANCELLED, generate(operation))
        assertEquals(41L, api.generatedId)
        assertEquals(1, api.generateCalls)
        assertTrue(operation.release())
        assertEquals(listOf(41L), api.releasedIds)
        // This proves adapter routing only; the fake is not native quiescence evidence.
    }

    @Test
    fun failedReleaseDoesNotMarkTheOperationReleasedAndSuccessIsIdempotent() {
        val api = FakeApi().also { it.releaseAllowed = false }
        val operation = newOperation(api)
        assertFalse(operation.release())
        assertTrue(operation.cancel())
        assertEquals(listOf(41L), api.cancelledIds)
        api.releaseAllowed = true
        assertTrue(operation.release())
        assertTrue(operation.release())
        assertEquals(listOf(41L, 41L), api.releasedIds)
        assertFalse(operation.cancel())
        assertEquals(1, api.cancelledIds.size)
        assertFailure(NativeGenerationStatus.INVALID, generate(operation))
        assertEquals(0, api.generateCalls)
    }

    @Test
    fun releaseExceptionCannotManufactureAnAcknowledgedRelease() {
        val api = FakeApi().also { it.releaseError = IllegalStateException("fixture uncertain release") }
        val operation = newOperation(api)
        assertThrows(IllegalStateException::class.java) { operation.release() }
        api.releaseError = null
        api.releaseAllowed = false
        assertFalse(operation.release())
        api.releaseAllowed = true
        assertTrue(operation.release())
        assertEquals(listOf(41L, 41L, 41L), api.releasedIds)
    }

    @Test
    fun aCurrentnessQueryIsForwardedLiveRatherThanTurnedIntoAnAdmissionBoolean() {
        val api = FakeApi()
        var stopped = false
        var calls = 0
        val currentness = NativeStopSignal { calls++; stopped }
        api.onGenerate = {
            assertSame(currentness, api.generatedCurrentness)
            assertFalse(checkNotNull(api.generatedCurrentness).isStopped())
            stopped = true
            assertTrue(checkNotNull(api.generatedCurrentness).isStopped())
            NativeGenerationResult(NativeGenerationStatus.CANCELLED, ByteArray(0), 0, 0)
        }
        val operation = newOperation(api)
        assertFailure(
            NativeGenerationStatus.CANCELLED,
            operation.generate(47, prompt(), budget(), 1_000_000_000L, currentness),
        )
        assertEquals(2, calls)
        assertTrue(operation.release())
    }

    @Test
    fun aThrowingCurrentnessQueryCannotBecomeTextInTheAdapterTestTransport() {
        val api = FakeApi()
        val currentness = NativeStopSignal { throw IllegalStateException("PRIVATE_CURRENTNESS_EXCEPTION") }
        api.onGenerate = { checkNotNull(api.generatedCurrentness).isStopped(); api.response }
        val operation = newOperation(api)
        val result = operation.generate(47, prompt(), budget(), 1_000_000_000L, currentness)
        assertFailure(NativeGenerationStatus.FAILURE, result)
        assertFalse(result.toString().contains("PRIVATE_CURRENTNESS_EXCEPTION"))
        assertTrue(checkNotNull(api.retainedPrompt).all { it == 0.toByte() })
        assertTrue(operation.release())
        // The real JNI exception/latch path is separately exercised by the model-free C++ harness.
    }

    private fun prompt(): ByteArray = "public fixture: 2+2=?".toByteArray(Charsets.UTF_8)

    private fun budget(): NativeInferenceBudget = NativeInferenceBudget()

    private fun newOperation(api: FakeApi): NativeTextOperation = checkNotNull(JniNativeTextEngine(api).reserve())

    private fun noStop(): NativeStopSignal = NativeStopSignal { false } // Explicit synthetic transport fixture.

    private fun generate(operation: NativeTextOperation): NativeGenerationResult =
        operation.generate(47, prompt(), budget(), 1_000_000_000L, noStop())

    private fun assertFailure(expected: Int, result: NativeGenerationResult) {
        assertEquals(expected, result.statusCode)
        assertEquals(0, result.outputUtf8.size)
        assertEquals(0, result.inputTokens)
        assertEquals(0, result.outputTokens)
    }

    private class FakeApi : NativeLlamaApi {
        var libraryAvailable = true
        var reservation = 41L
        var loadError: Throwable? = null
        var reserveError: Throwable? = null
        var generateError: Throwable? = null
        var releaseError: Throwable? = null
        var releaseAllowed = true
        var cancelControlsResponse = false
        var cancelled = false
        var response = NativeGenerationResult(0, "4".toByteArray(), 12, 1)
        var loadCalls = 0
        var reserveCalls = 0
        var generateCalls = 0
        var generatedId = 0L
        var generatedDescriptor = -1
        var generatedMaxTokens = 0
        var generatedMaxBytes = 0
        var generatedContextTokens = 0
        var generatedBudgetNanos = 0L
        var generatedCurrentness: NativeStopSignal? = null
        var onGenerate: (() -> NativeGenerationResult)? = null
        var observedPrompt: ByteArray? = null
        var retainedPrompt: ByteArray? = null
        val cancelledIds = mutableListOf<Long>()
        val releasedIds = mutableListOf<Long>()

        override fun loadLibrary(): Boolean {
            loadCalls++
            loadError?.let { throw it }
            return libraryAvailable
        }

        override fun reserve(): Long {
            reserveCalls++
            reserveError?.let { throw it }
            return reservation
        }

        override fun generate(
            id: Long,
            modelFd: Int,
            promptUtf8: ByteArray,
            maxOutputTokens: Int,
            maxOutputBytes: Int,
            contextTokens: Int,
            remainingBudgetNanos: Long,
            currentness: NativeStopSignal,
        ): NativeGenerationResult {
            generateCalls++
            generatedId = id
            generatedDescriptor = modelFd
            generatedMaxTokens = maxOutputTokens
            generatedMaxBytes = maxOutputBytes
            generatedContextTokens = contextTokens
            generatedBudgetNanos = remainingBudgetNanos
            generatedCurrentness = currentness
            retainedPrompt = promptUtf8
            observedPrompt = promptUtf8.copyOf()
            generateError?.let { throw it }
            if (cancelControlsResponse && cancelled) {
                return NativeGenerationResult(NativeGenerationStatus.CANCELLED, ByteArray(0), 0, 0)
            }
            onGenerate?.let { return it() }
            return response
        }

        override fun cancel(id: Long): Boolean {
            cancelledIds.add(id)
            cancelled = true
            return true
        }

        override fun release(id: Long): Boolean {
            releasedIds.add(id)
            releaseError?.let { throw it }
            return releaseAllowed
        }
    }
}
