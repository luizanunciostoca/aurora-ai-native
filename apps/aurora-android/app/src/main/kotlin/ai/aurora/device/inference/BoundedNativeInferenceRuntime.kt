package ai.aurora.device.inference

import java.security.MessageDigest
import java.util.concurrent.Executor
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicReference

/**
 * Private, uncomposed preparation. The worker, cancellation executor and deadline scheduler must be
 * independent asynchronous lanes; the monotonic clock must be nonblocking. No threads are created
 * here, and the shipping factory does not construct this object or enable it.
 *
 * Completion is bounded by the independent deadline lane, not by cooperation from hashing, model
 * loading, generation, cancel or release. Completion is NOT quiescence: the single-flight slot and
 * original descriptor remain owned until all worker/cancel activity and native teardown are proven
 * finished. An indeterminate release is quarantined instead of being retried as a fresh operation.
 */
internal class BoundedNativeInferenceRuntime(
    private val modelStore: NativeModelStore,
    private val engine: NativeTextEngine,
    private val worker: Executor,
    private val cancellationExecutor: Executor,
    private val scheduler: NativeDeadlineScheduler,
    private val promptSource: NativePublicPromptSource = UncomposedNativePublicPromptSource,
    private val verifier: NativeModelVerifier = NativeModelVerifier(),
    private val clock: NativeMonotonicClock = NativeMonotonicClock { System.nanoTime() },
    private val enabled: Boolean = false,
) : NativeInference {
    private val lock = Any()
    private var active: Flight? = null
    private var closed = false
    private var quarantined = false

    private class Flight(val request: NativeInferenceRequest, val call: NativeInferenceCall) {
        val stopped = AtomicReference<NativeInferenceFailure?>(null)
        var timer: NativeScheduledTask? = null
        var model: NativeModelHandle? = null
        var verifiedStamp: NativeModelStamp? = null
        var operation: NativeTextOperation? = null
        // Private equality check for this flight only, never an authorization or reusable handle.
        var promptDigest: ByteArray? = null
        var workerStarted = false
        var workerDone = false
        var cancelIssued = false
        var cancelRunning = false
        var cleanupQueued = false
        var cleanupStarted = false
        var uncertain = false
        var pending: NativeInferenceResult = abstained(NativeInferenceFailure.NATIVE_FAILURE)
    }

    override fun submit(request: NativeInferenceRequest): NativeInferenceCall {
        if (!enabled) return completed(NativeInferenceFailure.DISABLED)
        synchronized(lock) { unavailableReason()?.let { return completed(it) } }
        val remaining = try {
            Math.subtractExact(request.deadlineNanos, clock.nowNanos())
        } catch (_: Exception) {
            return completed(NativeInferenceFailure.INVALID_REQUEST)
        }
        if (
            request.requestRef.isBlank() || request.requestRef.length > 256 ||
                request.requestRef.any { it.isISOControl() } || !request.budget.isWithinBounds() ||
                remaining !in 1..NativeInferenceBounds.MAX_DURATION_NANOS
        ) return completed(NativeInferenceFailure.INVALID_REQUEST)

        val call = NativeInferenceCall()
        val flight = Flight(request.copy(budget = request.budget.copy()), call)
        synchronized(lock) {
            unavailableReason()?.let { return completed(it) }
            active = flight
        }
        call.onCancellation { stop(flight, NativeInferenceFailure.CANCELLED) }
        try {
            val delay = remainingBudget(flight)
            if (delay <= 0) {
                finishWithoutWorker(flight, NativeInferenceFailure.TIMEOUT)
                return call
            }
            val timer = scheduler.schedule(delay) { stop(flight, NativeInferenceFailure.TIMEOUT) }
            synchronized(lock) { flight.timer = timer }
        } catch (_: Exception) {
            // No worker has been submitted, so no model/native resource could have been acquired.
            finishWithoutWorker(flight, NativeInferenceFailure.NATIVE_UNAVAILABLE)
            return call
        }
        try {
            worker.execute { runWorker(flight) }
        } catch (_: RejectedExecutionException) {
            finishWithoutWorker(flight, NativeInferenceFailure.NATIVE_UNAVAILABLE)
        } catch (_: Exception) {
            // A nonconforming executor might have accepted the work before throwing.
            quarantine(flight)
        }
        return call
    }

    override fun state(): NativeInferenceState = synchronized(lock) { stateLocked() }

    override fun close(): NativeInferenceState {
        if (!enabled) return NativeInferenceState.DISABLED
        val flight = synchronized(lock) {
            closed = true
            active
        }
        if (flight != null) stop(flight, NativeInferenceFailure.CLOSED)
        return state()
    }

    private fun runWorker(flight: Flight) {
        synchronized(lock) {
            if (active !== flight || flight.uncertain) return
            flight.workerStarted = true
        }
        var result: NativeInferenceResult = abstained(NativeInferenceFailure.NATIVE_FAILURE)
        try {
            result = perform(flight)
        } catch (_: LinkageError) {
            result = abstained(NativeInferenceFailure.NATIVE_UNAVAILABLE)
        } catch (_: Exception) {
            result = abstained(NativeInferenceFailure.NATIVE_FAILURE)
        } finally {
            synchronized(lock) {
                flight.pending = flight.stopped.get()?.let { abstained(it) }
                    ?: if (flight.uncertain) abstained(NativeInferenceFailure.QUARANTINED) else result
                flight.workerDone = true
            }
            enqueueCleanup(flight)
        }
    }

    private fun perform(flight: Flight): NativeInferenceResult {
        if (isStopped(flight)) return stoppedResult(flight)
        val resolved = promptSource.resolveCurrent(flight.request.requestRef, NativeStopSignal { isStopped(flight) })
        if (isStopped(flight)) return stoppedResult(flight)
        when (resolved) {
            NativePromptResolution.NotComposed -> return abstained(NativeInferenceFailure.NOT_COMPOSED)
            NativePromptResolution.Unavailable -> return abstained(NativeInferenceFailure.PROMPT_UNAVAILABLE)
            is NativePromptResolution.PublicText -> {
                if (resolved.requestRef != flight.request.requestRef) return abstained(NativeInferenceFailure.PROMPT_UNAVAILABLE)
                val prompt = resolved.copyUtf8()
                try {
                    if (NativeUtf8.text(prompt, NativeInferenceBounds.MAX_INPUT_BYTES) == null) {
                        return abstained(NativeInferenceFailure.INVALID_REQUEST)
                    }
                    if (isStopped(flight)) return stoppedResult(flight)
                    val digest = MessageDigest.getInstance("SHA-256").digest(prompt)
                    val captured = synchronized(lock) {
                        if (active !== flight || flight.uncertain || flight.stopped.get() != null) false
                        else { flight.promptDigest = digest; true }
                    }
                    if (!captured) {
                        digest.fill(0)
                        return stoppedResult(flight)
                    }
                    val model = try {
                        modelStore.openPinned()
                    } catch (_: NativeModelOwnershipUncertain) {
                        quarantine(flight)
                        return abstained(NativeInferenceFailure.QUARANTINED)
                    } catch (_: Exception) {
                        return abstained(NativeInferenceFailure.MODEL_UNAVAILABLE)
                    }
                    synchronized(lock) { flight.model = model }
                    if (isStopped(flight)) return stoppedResult(flight)
                    val beforeHash = model.stamp()
                    when (verifier.verify(model, NativeStopSignal { isStopped(flight) })) {
                        NativeModelVerification.INVALID -> return abstained(NativeInferenceFailure.MODEL_INVALID)
                        NativeModelVerification.UNAVAILABLE -> return abstained(NativeInferenceFailure.MODEL_UNAVAILABLE)
                        NativeModelVerification.STOPPED -> return stoppedResult(flight)
                        NativeModelVerification.VERIFIED -> Unit
                    }
                    // Preserve the stamp across verification and reservation, not just inside hashing.
                    if (model.stamp() != beforeHash) return abstained(NativeInferenceFailure.MODEL_INVALID)
                    synchronized(lock) { flight.verifiedStamp = beforeHash }
                    if (isStopped(flight)) return stoppedResult(flight)
                    val operation = engine.reserve() ?: return abstained(NativeInferenceFailure.NATIVE_UNAVAILABLE)
                    synchronized(lock) { flight.operation = operation }
                    if (isStopped(flight)) {
                        issueCancel(flight)
                        return stoppedResult(flight)
                    }
                    // Hashing/reservation may outlive the source decision. Reuse the same owner
                    // port outside the lock; a failed observation ends this flight without retry.
                    if (!currentPromptMatches(flight)) {
                        return if (isStopped(flight)) stoppedResult(flight)
                        else abstained(NativeInferenceFailure.PROMPT_UNAVAILABLE)
                    }
                    // The owner read can block: recheck file identity and remaining time AFTER it.
                    if (model.stamp() != beforeHash) return abstained(NativeInferenceFailure.MODEL_INVALID)
                    val remaining = remainingBudget(flight)
                    if (remaining <= 0 || isStopped(flight)) return stoppedResult(flight)
                    val generated = operation.generate(model.descriptor, prompt, flight.request.budget, remaining)
                    try {
                        if (isStopped(flight)) return stoppedResult(flight)
                        if (model.stamp() != beforeHash) return abstained(NativeInferenceFailure.MODEL_INVALID)
                        return validateResult(generated, flight.request.budget)
                    } finally {
                        generated.outputUtf8.fill(0)
                    }
                } finally {
                    prompt.fill(0)
                }
            }
        }
    }

    private fun currentPromptMatches(flight: Flight): Boolean {
        if (isStopped(flight)) return false
        val expected = synchronized(lock) {
            if (active !== flight || flight.uncertain) null else flight.promptDigest?.copyOf()
        } ?: return false
        var current: ByteArray? = null
        var digest: ByteArray? = null
        var matches = false
        try {
            val resolved = promptSource.resolveCurrent(flight.request.requestRef, NativeStopSignal { isStopped(flight) })
            if (isStopped(flight)) return false
            if (resolved !is NativePromptResolution.PublicText || resolved.requestRef != flight.request.requestRef) return false
            current = resolved.copyUtf8()
            if (NativeUtf8.text(current, NativeInferenceBounds.MAX_INPUT_BYTES) == null) return false
            digest = MessageDigest.getInstance("SHA-256").digest(current)
            if (!MessageDigest.isEqual(expected, digest) || isStopped(flight)) return false
            // An executor may have accepted work before throwing. Quarantine can therefore be
            // observed while the owner read is blocked, without setting a cancellation reason.
            // A matching local copy is not enough: the same live Flight must still own its digest.
            matches = synchronized(lock) {
                val owned = flight.promptDigest
                active === flight && !flight.uncertain && flight.stopped.get() == null &&
                    owned != null && MessageDigest.isEqual(expected, owned)
            }
            return matches
        } catch (_: LinkageError) {
            return false
        } catch (_: Exception) {
            return false
        } finally {
            expected.fill(0)
            current?.fill(0)
            digest?.fill(0)
            // Copies used by this worker are independent of the owned digest cleared by stop.
            // A later source recovery cannot revive a capture already observed as invalid.
            if (!matches) synchronized(lock) { clearPromptDigestLocked(flight) }
        }
    }

    private fun clearPromptDigestLocked(flight: Flight) {
        flight.promptDigest?.fill(0)
        flight.promptDigest = null
    }

    private fun validateResult(result: NativeGenerationResult, budget: NativeInferenceBudget): NativeInferenceResult {
        if (result.statusCode != NativeGenerationStatus.SUCCESS_EOG) {
            if (result.outputUtf8.isNotEmpty()) return abstained(NativeInferenceFailure.NATIVE_FAILURE)
            return abstained(when (result.statusCode) {
                NativeGenerationStatus.CANCELLED -> NativeInferenceFailure.CANCELLED
                NativeGenerationStatus.DEADLINE -> NativeInferenceFailure.TIMEOUT
                NativeGenerationStatus.UNAVAILABLE -> NativeInferenceFailure.NATIVE_UNAVAILABLE
                NativeGenerationStatus.LIMIT_REACHED -> NativeInferenceFailure.LIMIT_REACHED
                else -> NativeInferenceFailure.NATIVE_FAILURE
            })
        }
        if (
            result.inputTokens <= 0 || result.inputTokens > budget.contextTokens - budget.maxOutputTokens ||
                result.outputTokens !in 1..budget.maxOutputTokens
        ) return abstained(NativeInferenceFailure.NATIVE_FAILURE)
        val text = NativeUtf8.text(result.outputUtf8, budget.maxOutputBytes, output = true)
            ?: return abstained(NativeInferenceFailure.NATIVE_FAILURE)
        return NativeInferenceResult.Text(text)
    }

    private fun remainingBudget(flight: Flight): Long {
        if (flight.stopped.get() != null) return 0
        return try {
            val remaining = Math.subtractExact(flight.request.deadlineNanos, clock.nowNanos())
            when {
                remaining <= 0 -> { stop(flight, NativeInferenceFailure.TIMEOUT); 0 }
                remaining > NativeInferenceBounds.MAX_DURATION_NANOS -> { stop(flight, NativeInferenceFailure.NATIVE_FAILURE); 0 }
                else -> remaining
            }
        } catch (_: Exception) {
            stop(flight, NativeInferenceFailure.NATIVE_FAILURE)
            0
        }
    }

    private fun isStopped(flight: Flight): Boolean = flight.stopped.get() != null || remainingBudget(flight) <= 0

    private fun stop(flight: Flight, reason: NativeInferenceFailure) {
        synchronized(lock) {
            if (active !== flight) return
            flight.stopped.compareAndSet(null, reason)
            val result = stoppedResult(flight)
            flight.pending = result
            clearPromptDigestLocked(flight)
            // Only CAS + latch notification; no model, cancellation callback or consumer code runs here.
            flight.call.finish(result)
        }
        issueCancel(flight)
    }

    private fun issueCancel(flight: Flight) {
        val operation = synchronized(lock) {
            val current = flight.operation
            if (
                active !== flight || flight.stopped.get() == null || current == null ||
                    flight.cancelIssued || flight.cleanupStarted || flight.uncertain
            ) return
            flight.cancelIssued = true
            flight.cancelRunning = true
            current
        }
        try {
            cancellationExecutor.execute {
                try {
                    operation.cancel() // A signal receipt, never a teardown assertion.
                } catch (_: LinkageError) {
                    // Still wait for the worker to return and release to prove teardown.
                } catch (_: Exception) {
                    // No private exception content escapes.
                } finally {
                    synchronized(lock) { flight.cancelRunning = false }
                    enqueueCleanup(flight)
                }
            }
        } catch (_: RejectedExecutionException) {
            synchronized(lock) { flight.cancelRunning = false }
            enqueueCleanup(flight)
        } catch (_: Exception) {
            quarantine(flight)
        }
    }

    private fun enqueueCleanup(flight: Flight) {
        synchronized(lock) {
            if (
                active !== flight || !flight.workerDone || flight.cancelRunning ||
                    flight.cleanupQueued || flight.cleanupStarted || flight.uncertain
            ) return
            flight.cleanupQueued = true
        }
        try {
            worker.execute { cleanup(flight) }
        } catch (_: Exception) {
            // Do not close a descriptor or native session on the caller/deadline lane.
            quarantine(flight)
        }
    }

    private fun cleanup(flight: Flight) {
        synchronized(lock) {
            flight.cleanupQueued = false
            if (active !== flight || flight.uncertain || flight.cleanupStarted || flight.cancelRunning) return
            flight.cleanupStarted = true
        }
        try {
            if (flight.operation?.release() == false) {
                quarantine(flight)
                return // Retain the original FD; native ownership is not proven finished.
            }
            val model = flight.model
            if (model != null) {
                if (flight.verifiedStamp != null && model.stamp() != flight.verifiedStamp) {
                    synchronized(lock) { flight.pending = abstained(NativeInferenceFailure.MODEL_INVALID) }
                }
                model.close()
            }
        } catch (_: LinkageError) {
            quarantine(flight)
            return
        } catch (_: Exception) {
            quarantine(flight)
            return
        }
        val needsCurrentPrompt = synchronized(lock) {
            active === flight && !flight.uncertain && flight.stopped.get() == null &&
                flight.pending is NativeInferenceResult.Text
        }
        // Run on the worker, AFTER proven release and original-FD close. Active remains reserved
        // while this owner read is pending; independent stop/deadline/close never wait for it.
        if (needsCurrentPrompt && !currentPromptMatches(flight)) {
            synchronized(lock) {
                if (active === flight && !flight.uncertain) {
                    flight.pending = flight.stopped.get()?.let { abstained(it) }
                        ?: abstained(NativeInferenceFailure.PROMPT_UNAVAILABLE)
                }
            }
        }
        val timer = synchronized(lock) {
            if (active !== flight || flight.uncertain) return
            // Final linearization check after native release and original-FD close, not before.
            val reason = flight.stopped.get() ?: try {
                val remaining = Math.subtractExact(flight.request.deadlineNanos, clock.nowNanos())
                when {
                    remaining <= 0 -> NativeInferenceFailure.TIMEOUT
                    remaining > NativeInferenceBounds.MAX_DURATION_NANOS -> NativeInferenceFailure.NATIVE_FAILURE
                    else -> null
                }
            } catch (_: Exception) {
                NativeInferenceFailure.NATIVE_FAILURE
            }
            // The call retains its cancellation closure/Flight. Do not retain denied Text or a
            // fingerprint after publishing an abstention or detaching a completed flight.
            if (reason != null) flight.pending = abstained(reason)
            clearPromptDigestLocked(flight)
            flight.call.finish(flight.pending)
            flight.model = null
            flight.operation = null
            active = null
            flight.timer
        }
        cancelTimer(timer)
    }

    private fun finishWithoutWorker(flight: Flight, reason: NativeInferenceFailure) {
        val timer = synchronized(lock) {
            if (active !== flight) return
            if (flight.workerStarted) { quarantine(flight); return }
            flight.pending = flight.stopped.get()?.let { abstained(it) } ?: abstained(reason)
            clearPromptDigestLocked(flight)
            flight.call.finish(flight.pending)
            active = null
            flight.timer
        }
        cancelTimer(timer)
    }

    private fun quarantine(flight: Flight) {
        synchronized(lock) {
            if (active !== flight) return
            flight.uncertain = true
            quarantined = true
            flight.pending = abstained(NativeInferenceFailure.QUARANTINED)
            clearPromptDigestLocked(flight)
            flight.call.finish(flight.stopped.get()?.let { abstained(it) } ?: flight.pending)
        }
    }

    private fun unavailableReason(): NativeInferenceFailure? = when {
        quarantined -> NativeInferenceFailure.QUARANTINED
        closed -> NativeInferenceFailure.CLOSED
        active != null -> NativeInferenceFailure.BUSY
        else -> null
    }

    private fun stateLocked(): NativeInferenceState = when {
        !enabled -> NativeInferenceState.DISABLED
        quarantined -> NativeInferenceState.QUARANTINED
        closed && active != null -> NativeInferenceState.CLOSING
        closed -> NativeInferenceState.CLOSED
        active != null -> NativeInferenceState.BUSY
        else -> NativeInferenceState.IDLE
    }

    private fun stoppedResult(flight: Flight): NativeInferenceResult =
        abstained(flight.stopped.get() ?: NativeInferenceFailure.NATIVE_FAILURE)

    private fun cancelTimer(timer: NativeScheduledTask?) {
        try { timer?.cancel() } catch (_: Exception) { /* Detached timer cannot affect a later flight. */ }
    }

    private companion object {
        fun abstained(reason: NativeInferenceFailure): NativeInferenceResult = NativeInferenceResult.Abstained(reason)
        fun completed(reason: NativeInferenceFailure): NativeInferenceCall = NativeInferenceCall().also { it.finish(abstained(reason)) }
    }
}
