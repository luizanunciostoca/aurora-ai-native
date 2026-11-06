package ai.aurora.device.inference

import java.util.concurrent.atomic.AtomicBoolean

/** No init block and no name-mangled internal methods: JNI binds these four exact static names. */
internal object NativeLlamaBindings {
    @JvmStatic external fun reserve(): Long

    @JvmStatic external fun generate(
        id: Long,
        modelFd: Int,
        promptUtf8: ByteArray,
        maxOutputTokens: Int,
        maxOutputBytes: Int,
        contextTokens: Int,
        remainingBudgetNanos: Long,
        currentness: NativeStopSignal,
    ): NativeGenerationResult

    @JvmStatic external fun cancel(id: Long): Boolean
    @JvmStatic external fun release(id: Long): Boolean
}

/** Private test seam; production uses only the exact native adapter, not a script or HTTP fallback. */
internal interface NativeLlamaApi {
    fun loadLibrary(): Boolean
    fun reserve(): Long
    fun generate(
        id: Long,
        modelFd: Int,
        promptUtf8: ByteArray,
        maxOutputTokens: Int,
        maxOutputBytes: Int,
        contextTokens: Int,
        remainingBudgetNanos: Long,
        currentness: NativeStopSignal,
    ): NativeGenerationResult
    fun cancel(id: Long): Boolean
    fun release(id: Long): Boolean
}

private object PackagedNativeLlamaApi : NativeLlamaApi {
    @Volatile private var loaded = false

    @Synchronized override fun loadLibrary(): Boolean {
        if (loaded) return true
        return try {
            System.loadLibrary("aurora_llama")
            loaded = true
            true
        } catch (_: LinkageError) {
            false
        } catch (_: SecurityException) {
            false
        }
    }

    override fun reserve(): Long = NativeLlamaBindings.reserve()

    override fun generate(
        id: Long,
        modelFd: Int,
        promptUtf8: ByteArray,
        maxOutputTokens: Int,
        maxOutputBytes: Int,
        contextTokens: Int,
        remainingBudgetNanos: Long,
        currentness: NativeStopSignal,
    ): NativeGenerationResult =
        NativeLlamaBindings.generate(
            id, modelFd, promptUtf8, maxOutputTokens, maxOutputBytes, contextTokens, remainingBudgetNanos, currentness,
        )

    override fun cancel(id: Long): Boolean = NativeLlamaBindings.cancel(id)
    override fun release(id: Long): Boolean = NativeLlamaBindings.release(id)
}

internal class JniNativeTextEngine(private val api: NativeLlamaApi = PackagedNativeLlamaApi) : NativeTextEngine {
    override fun reserve(): NativeTextOperation? {
        val id = try {
            if (!api.loadLibrary()) return null
            api.reserve()
        } catch (_: LinkageError) {
            return null
        } catch (_: Exception) {
            return null
        }
        return if (id > 0L) Operation(id, api) else null
    }

    private class Operation(private val id: Long, private val api: NativeLlamaApi) : NativeTextOperation {
        private val generated = AtomicBoolean(false)
        private val released = AtomicBoolean(false)

        override fun generate(
            modelDescriptor: Int,
            promptUtf8: ByteArray,
            budget: NativeInferenceBudget,
            remainingBudgetNanos: Long,
            currentness: NativeStopSignal,
        ): NativeGenerationResult {
            if (
                released.get() || !generated.compareAndSet(false, true) || modelDescriptor < 0 ||
                    !budget.isWithinBounds() || remainingBudgetNanos !in 1..NativeInferenceBounds.MAX_DURATION_NANOS ||
                    NativeUtf8.text(promptUtf8, NativeInferenceBounds.MAX_INPUT_BYTES) == null
            ) return failure(NativeGenerationStatus.INVALID)
            val snapshot = promptUtf8.copyOf()
            return try {
                val result = api.generate(
                    id, modelDescriptor, snapshot, budget.maxOutputTokens,
                    budget.maxOutputBytes, budget.contextTokens, remainingBudgetNanos, currentness,
                )
                if (result.statusCode != NativeGenerationStatus.SUCCESS_EOG) {
                    val code = if (result.statusCode in 1..6 && result.outputUtf8.isEmpty()) {
                        result.statusCode
                    } else NativeGenerationStatus.FAILURE
                    return failure(code)
                }
                if (
                    result.inputTokens <= 0 || result.inputTokens > budget.contextTokens - budget.maxOutputTokens ||
                        result.outputTokens !in 1..budget.maxOutputTokens ||
                        NativeUtf8.text(result.outputUtf8, budget.maxOutputBytes, output = true) == null
                ) return failure(NativeGenerationStatus.FAILURE)
                NativeGenerationResult(result.statusCode, result.outputUtf8.copyOf(), result.inputTokens, result.outputTokens)
            } catch (_: LinkageError) {
                failure(NativeGenerationStatus.UNAVAILABLE)
            } catch (_: Exception) {
                failure(NativeGenerationStatus.FAILURE)
            } finally {
                snapshot.fill(0)
            }
        }

        override fun cancel(): Boolean = !released.get() && api.cancel(id)

        override fun release(): Boolean {
            if (released.get()) return true
            if (!api.release(id)) return false
            released.set(true)
            return true
        }

        private fun failure(code: Int): NativeGenerationResult = NativeGenerationResult(code, ByteArray(0), 0, 0)
    }
}
