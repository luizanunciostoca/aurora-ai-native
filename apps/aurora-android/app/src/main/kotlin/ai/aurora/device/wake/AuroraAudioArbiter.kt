package ai.aurora.device.wake

/**
 * Coordinates audio ownership without granting Aurora business/action authority.
 * HOTWORD_MONITOR may coexist with TTS only when barge-in is explicitly enabled; STT is exclusive.
 */
class AuroraAudioArbiter(
    private var bargeInEnabled: Boolean = true,
) {
    enum class AudioOwner {
        HOTWORD_MONITOR,
        STT,
        TTS,
    }

    data class Snapshot(
        val owners: Set<AudioOwner>,
        val bargeInEnabled: Boolean,
    )

    private val owners = linkedSetOf<AudioOwner>()

    @Synchronized
    fun setBargeInEnabled(enabled: Boolean) {
        bargeInEnabled = enabled
        if (!enabled && AudioOwner.TTS in owners) {
            owners.remove(AudioOwner.HOTWORD_MONITOR)
        }
    }

    @Synchronized
    fun tryAcquire(owner: AudioOwner): Boolean {
        if (!isCompatible(owner)) return false
        owners += owner
        return true
    }

    @Synchronized
    fun release(owner: AudioOwner) {
        owners -= owner
    }

    @Synchronized
    fun handoffToStt(): Boolean {
        owners.remove(AudioOwner.TTS)
        owners.remove(AudioOwner.HOTWORD_MONITOR)
        if (owners.isNotEmpty()) return false
        owners += AudioOwner.STT
        return true
    }

    @Synchronized
    fun handoffFromSttToHotword(): Boolean {
        owners.remove(AudioOwner.STT)
        return tryAcquire(AudioOwner.HOTWORD_MONITOR)
    }

    @Synchronized
    fun snapshot(): Snapshot = Snapshot(owners.toSet(), bargeInEnabled)

    @Synchronized
    private fun isCompatible(owner: AudioOwner): Boolean = when (owner) {
        AudioOwner.STT -> owners.isEmpty() || owners == setOf(AudioOwner.STT)
        AudioOwner.TTS ->
            AudioOwner.STT !in owners &&
                (AudioOwner.HOTWORD_MONITOR !in owners || bargeInEnabled)
        AudioOwner.HOTWORD_MONITOR ->
            AudioOwner.STT !in owners &&
                (AudioOwner.TTS !in owners || bargeInEnabled)
    }
}
