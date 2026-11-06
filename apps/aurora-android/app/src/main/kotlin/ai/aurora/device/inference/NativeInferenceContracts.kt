package ai.aurora.device.inference

import java.io.IOException
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Private preparation vocabulary, not a W02 approval, W05 registry or W07 action contract. */
internal object NativeInferenceBounds {
    const val MAX_INPUT_BYTES = 8_192
    const val MAX_OUTPUT_BYTES = 32_768
    const val MAX_OUTPUT_TOKENS = 256
    const val MIN_CONTEXT_TOKENS = 256
    const val MAX_CONTEXT_TOKENS = 2_048
    const val MAX_DURATION_NANOS = 30_000_000_000L
}

internal object NativePinnedModel {
    const val DIRECTORY = "aurora-native-inference"
    const val FILE_NAME = "Qwen3.5-2B-Q4_K_M.gguf"
    const val LENGTH_BYTES = 1_280_835_840L
    const val SHA256 = "aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223"
}

internal data class NativeInferenceBudget(
    val maxOutputTokens: Int = 64,
    val maxOutputBytes: Int = 8_192,
    val contextTokens: Int = 1_024,
) {
    fun isWithinBounds(): Boolean =
        maxOutputTokens in 1..NativeInferenceBounds.MAX_OUTPUT_TOKENS &&
            maxOutputBytes in 1..NativeInferenceBounds.MAX_OUTPUT_BYTES &&
            contextTokens in NativeInferenceBounds.MIN_CONTEXT_TOKENS..NativeInferenceBounds.MAX_CONTEXT_TOKENS &&
            maxOutputTokens < contextTokens
}

/** Only an opaque lookup reference crosses this ingress; callers cannot supply a model or approval. */
internal data class NativeInferenceRequest(
    val requestRef: String,
    val deadlineNanos: Long,
    val budget: NativeInferenceBudget = NativeInferenceBudget(),
)

internal enum class NativeInferenceFailure {
    DISABLED,
    NOT_COMPOSED,
    INVALID_REQUEST,
    PROMPT_UNAVAILABLE,
    MODEL_UNAVAILABLE,
    MODEL_INVALID,
    BUSY,
    CLOSED,
    CANCELLED,
    TIMEOUT,
    NATIVE_UNAVAILABLE,
    NATIVE_FAILURE,
    LIMIT_REACHED,
    QUARANTINED,
}

internal sealed class NativeInferenceResult {
    val authorizesExecution: Boolean = false
    val canInvokeTools: Boolean = false

    class Text(val text: String) : NativeInferenceResult() {
        override fun toString(): String = "NativeInferenceResult.Text(REDACTED)"
    }

    class Abstained(val reason: NativeInferenceFailure) : NativeInferenceResult() {
        override fun toString(): String = "NativeInferenceResult.Abstained($reason)"
    }
}

/** Completion and cancellation deliberately do not expose a mutable Future or imply quiescence. */
internal class NativeInferenceCall {
    private val result = AtomicReference<NativeInferenceResult?>(null)
    private val completed = CountDownLatch(1)

    @Volatile private var cancellation: () -> Unit = {}

    fun cancel() = cancellation()

    fun pollResult(): NativeInferenceResult? = result.get()

    /** For non-UI consumers/tests. A null wait result is not an inference timeout or teardown proof. */
    fun awaitResult(timeout: Long, unit: TimeUnit): NativeInferenceResult? {
        require(timeout >= 0)
        return if (completed.await(timeout, unit)) result.get() else null
    }

    internal fun onCancellation(action: () -> Unit) {
        cancellation = action
    }

    internal fun finish(value: NativeInferenceResult): Boolean {
        if (!result.compareAndSet(null, value)) return false
        completed.countDown()
        return true
    }
}

internal enum class NativeInferenceState { DISABLED, IDLE, BUSY, CLOSING, CLOSED, QUARANTINED }

internal interface NativeInference {
    fun submit(request: NativeInferenceRequest): NativeInferenceCall
    fun state(): NativeInferenceState
    /** Nonblocking: CLOSING/QUARANTINED explicitly mean resources are not proven quiescent. */
    fun close(): NativeInferenceState
}

internal fun interface NativeMonotonicClock {
    fun nowNanos(): Long
}

internal fun interface NativeScheduledTask {
    fun cancel()
}

internal fun interface NativeDeadlineScheduler {
    /** Implementations schedule asynchronously; they must not execute the delay on the caller. */
    fun schedule(delayNanos: Long, action: () -> Unit): NativeScheduledTask
}

internal fun interface NativeStopSignal {
    fun isStopped(): Boolean
}

/**
 * A future accepted W05/W06 adapter must establish provenance, current policy and PUBLIC local-use
 * permission before producing this result. The type is NOT an attestation. There is deliberately no
 * production implementation, boolean approval, JSON ingress, raw-context or tool port in this leaf.
 */
internal fun interface NativePublicPromptSource {
    fun resolveCurrent(requestRef: String, stop: NativeStopSignal): NativePromptResolution
}

internal sealed class NativePromptResolution {
    object NotComposed : NativePromptResolution()
    object Unavailable : NativePromptResolution()

    class PublicText(val requestRef: String, utf8: ByteArray) : NativePromptResolution() {
        private val captured =
            if (utf8.size <= NativeInferenceBounds.MAX_INPUT_BYTES) utf8.copyOf() else ByteArray(0)
        fun copyUtf8(): ByteArray = captured.copyOf()
        override fun toString(): String = "NativePromptResolution.PublicText(REDACTED)"
    }
}

internal object UncomposedNativePublicPromptSource : NativePublicPromptSource {
    override fun resolveCurrent(requestRef: String, stop: NativeStopSignal): NativePromptResolution =
        NativePromptResolution.NotComposed
}

internal data class NativeModelStamp(
    val device: Long,
    val inode: Long,
    val lengthBytes: Long,
    val modifiedSeconds: Long,
    val modifiedNanos: Long,
    val changedSeconds: Long,
    val changedNanos: Long,
    val regularFile: Boolean,
    val readOnlyDescriptor: Boolean,
    val ownedByApp: Boolean,
)

internal interface NativeModelHandle : AutoCloseable {
    /** Original open descriptor, kept alive through native release. Never a request-supplied path. */
    val descriptor: Int
    fun stamp(): NativeModelStamp
    /**
     * Owns only a duplicate, positioned at zero. Closing it must not close the original. If its close
     * is indeterminate (even suppressed by a read failure), the handle must retain that uncertainty
     * and throw NativeModelOwnershipUncertain from close(), without retrying the duplicate close.
     */
    fun openHashStream(): InputStream
    override fun close()
}

internal fun interface NativeModelStore {
    fun openPinned(): NativeModelHandle
}

/** Sanitized ownership uncertainty, not a retryable missing-model error. No pathname or cause. */
internal class NativeModelOwnershipUncertain : IOException("NATIVE_MODEL_OWNERSHIP_UNCERTAIN")

internal enum class NativeModelVerification { VERIFIED, INVALID, STOPPED, UNAVAILABLE }

/** JNI constructor signature is (I[BII)V. Do not make this a logging data class. */
internal class NativeGenerationResult(
    val statusCode: Int,
    val outputUtf8: ByteArray,
    val inputTokens: Int,
    val outputTokens: Int,
) {
    override fun toString(): String = "NativeGenerationResult(status=$statusCode, output=REDACTED)"
}

internal object NativeGenerationStatus {
    const val SUCCESS_EOG = 0
    const val CANCELLED = 1
    const val DEADLINE = 2
    const val INVALID = 3
    const val UNAVAILABLE = 4
    const val FAILURE = 5
    const val LIMIT_REACHED = 6
}

internal interface NativeTextOperation {
    /**
     * Synchronous on the dedicated worker only. currentness is an obligatory, same-call stop query,
     * not an approval: the native entry thread polls it at its explicit work boundaries. It may
     * read the existing prompt owner and block; never invoke it from an engine progress/abort
     * thread or under an ownership lock. Never claim teardown from returned text alone.
     */
    fun generate(
        modelDescriptor: Int,
        promptUtf8: ByteArray,
        budget: NativeInferenceBudget,
        remainingBudgetNanos: Long,
        currentness: NativeStopSignal,
    ): NativeGenerationResult

    /** Signal only. Callers wait for generate + release, not this boolean, to prove quiescence. */
    fun cancel(): Boolean
    fun release(): Boolean
}

internal fun interface NativeTextEngine {
    /** A missing library/ABI/busy reservation is unavailable; reservation must not load a model. */
    fun reserve(): NativeTextOperation?
}

internal object NativeUtf8 {
    /** Strict decoding: replacement characters cannot turn malformed native bytes into success. */
    fun text(bytes: ByteArray, maxBytes: Int, output: Boolean = false): String? {
        if (bytes.isEmpty() || bytes.size > maxBytes || bytes.any { it == 0.toByte() }) return null
        return try {
            val decoded =
                Charsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes))
                    .toString()
            if (decoded.isBlank()) return null
            // A narrow output-format refusal, not DLP, prompt-injection proof or authority parsing.
            if (
                output &&
                    (decoded.contains("<tool_call", ignoreCase = true) ||
                        decoded.contains("</tool_call", ignoreCase = true) ||
                        decoded.contains("\"tool_calls\"", ignoreCase = true) ||
                        decoded.contains("\"function_call\"", ignoreCase = true))
            ) return null
            decoded
        } catch (_: Exception) {
            null
        }
    }
}
