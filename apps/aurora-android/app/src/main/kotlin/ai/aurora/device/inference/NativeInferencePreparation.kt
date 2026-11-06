package ai.aurora.device.inference

import ai.aurora.device.BuildConfig

/**
 * Packaging the library is not activation. Even a future accidental true flag cannot compose a
 * prompt authority here. A real W05/W06 ingress and activation need a separate owner-reviewed edit.
 * No Context, model store, executor, scheduler or JNI instance is constructed by this factory.
 */
internal object NativeInferencePreparation {
    fun create(): NativeInference =
        DisabledNativeInference(
            if (BuildConfig.AURORA_NATIVE_INFERENCE_ENABLED) NativeInferenceFailure.NOT_COMPOSED
            else NativeInferenceFailure.DISABLED,
        )
}

private class DisabledNativeInference(private val reason: NativeInferenceFailure) : NativeInference {
    override fun submit(request: NativeInferenceRequest): NativeInferenceCall =
        NativeInferenceCall().also { it.finish(NativeInferenceResult.Abstained(reason)) }

    override fun state(): NativeInferenceState = NativeInferenceState.DISABLED

    override fun close(): NativeInferenceState = NativeInferenceState.DISABLED
}
