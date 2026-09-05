package ai.aurora.device.wake

import java.util.concurrent.atomic.AtomicBoolean

/**
 * Process-local playback awareness used only for acoustic self-wake suppression and barge-in.
 * No rendered audio, transcript, authority, or raw microphone data is persisted here.
 */
object WakePlaybackAwareness {
    private val ttsActive = AtomicBoolean(false)
    private val keywordPlaybackActive = AtomicBoolean(false)

    fun onTtsStarted(text: String) {
        ttsActive.set(true)
        keywordPlaybackActive.set(text.contains("aurora", ignoreCase = true))
    }

    fun onTtsStopped() {
        keywordPlaybackActive.set(false)
        ttsActive.set(false)
    }

    fun snapshot(): WakePlaybackSnapshot = WakePlaybackSnapshot(
        ttsActive = ttsActive.get(),
        keywordPlaybackActive = keywordPlaybackActive.get(),
    )
}

data class WakePlaybackSnapshot(
    val ttsActive: Boolean,
    val keywordPlaybackActive: Boolean,
)
