package ai.aurora.device.wake

internal enum class MicrophonePermissionAction {
    NONE,
    REQUEST,
    OPEN_SETTINGS,
}

/**
 * Separates Android's runtime-permission history from the wake runtime state.
 *
 * `shouldShowRequestPermissionRationale()` is false both before the first request and after Android
 * stops offering the runtime dialog. A durable request-attempt bit is therefore required to avoid
 * misclassifying a fresh install as permanently denied.
 */
internal object MicrophonePermissionFlow {
    fun nextAction(
        granted: Boolean,
        requestAttempted: Boolean,
        shouldShowRationale: Boolean,
    ): MicrophonePermissionAction {
        if (granted) return MicrophonePermissionAction.NONE
        return if (requestAttempted && !shouldShowRationale) {
            MicrophonePermissionAction.OPEN_SETTINGS
        } else {
            MicrophonePermissionAction.REQUEST
        }
    }
}
