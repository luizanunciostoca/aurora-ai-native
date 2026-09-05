package ai.aurora.device.wake

/**
 * Coordinates audio ownership without granting Aurora business/action authority.
 * HOTWORD_MONITOR may coexist with TTS only when barge-in is explicitly enabled; STT and
 * ENROLLMENT are exclusive capture owners.
 *
 * The arbiter never releases another component's lease on its behalf. A physical audio owner must
 * release its own lease before an exclusive successor may acquire the resource.
 */
class AuroraAudioArbiter(
    private var bargeInEnabled: Boolean = true,
) {
    enum class AudioOwner {
        HOTWORD_MONITOR,
        STT,
        ENROLLMENT,
        TTS,
    }

    data class Snapshot(
        val owners: Set<AudioOwner>,
        val bargeInEnabled: Boolean,
    )

    private val owners = linkedSetOf<AudioOwner>()

    @Synchronized
    fun setBargeInEnabled(enabled: Boolean) {
        // Do not erase a live HOTWORD lease if TTS is already active. The microphone engine owns
        // that lease and must release it after its physical AudioRecord has actually stopped.
        bargeInEnabled = enabled
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

    /**
     * Acquires exclusive STT ownership only after prior physical owners have released themselves.
     * It intentionally does not drop HOTWORD or TTS leases to manufacture a logical handoff.
     */
    @Synchronized
    fun handoffToStt(): Boolean {
        if (owners.isNotEmpty()) return false
        owners += AudioOwner.STT
        return true
    }

    @Synchronized
    fun handoffFromSttToHotword(): Boolean {
        if (owners != setOf(AudioOwner.STT)) return false
        owners.remove(AudioOwner.STT)
        owners += AudioOwner.HOTWORD_MONITOR
        return true
    }

    @Synchronized
    fun snapshot(): Snapshot = Snapshot(owners.toSet(), bargeInEnabled)

    @Synchronized
    private fun isCompatible(owner: AudioOwner): Boolean =
        when (owner) {
            AudioOwner.STT -> owners.isEmpty() || owners == setOf(AudioOwner.STT)
            AudioOwner.ENROLLMENT -> owners.isEmpty() || owners == setOf(AudioOwner.ENROLLMENT)
            AudioOwner.TTS ->
                AudioOwner.STT !in owners &&
                    AudioOwner.ENROLLMENT !in owners &&
                    (AudioOwner.HOTWORD_MONITOR !in owners || bargeInEnabled)
            AudioOwner.HOTWORD_MONITOR ->
                AudioOwner.STT !in owners &&
                    AudioOwner.ENROLLMENT !in owners &&
                    (AudioOwner.TTS !in owners || bargeInEnabled)
        }
}

/**
 * Single process-local arbitration point for Aurora microphone/STT/TTS/enrollment ownership.
 * This is resource coordination only: it cannot authorize commands, execution, outcomes or retries.
 */
object AuroraAudioRuntime {
    val arbiter = AuroraAudioArbiter()
}
