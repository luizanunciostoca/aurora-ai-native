package ai.aurora.ui

/**
 * Thread-safe ownership guard for the single active TTS utterance.
 *
 * TextToSpeech callbacks can arrive after QUEUE_FLUSH has already replaced an older utterance.
 * Only the current request is allowed to mutate audio-focus or presentation state.
 */
internal class VoiceUtteranceGuard {
    private val lock = Any()
    private var currentRequestId: Long? = null

    fun begin(requestId: Long) {
        require(requestId > 0)
        synchronized(lock) { currentRequestId = requestId }
    }

    fun owns(requestId: Long): Boolean = synchronized(lock) {
        currentRequestId == requestId
    }

    fun completeIfCurrent(requestId: Long): Boolean = synchronized(lock) {
        if (currentRequestId != requestId) return@synchronized false
        currentRequestId = null
        true
    }

    fun clear(): Long? = synchronized(lock) {
        val current = currentRequestId
        currentRequestId = null
        current
    }

    internal fun currentForTest(): Long? = synchronized(lock) { currentRequestId }
}
