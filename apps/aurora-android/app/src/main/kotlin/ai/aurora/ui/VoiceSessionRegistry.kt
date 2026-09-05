package ai.aurora.ui

/**
 * Process-local registry for bounded voice resources.
 *
 * This registry owns no conversation, permission, business authority, or execution truth. It only
 * provides a single fail-closed stop point for STT/TTS when the Activity leaves foreground or
 * Privacy Mode becomes active.
 */
object VoiceSessionRegistry {
    private val lock = Any()
    private var sequence = 0L
    private val stoppers = LinkedHashMap<Long, () -> Unit>()

    fun register(stopper: () -> Unit): AutoCloseable {
        val token = synchronized(lock) {
            sequence += 1
            sequence.also { stoppers[it] = stopper }
        }
        return AutoCloseable {
            synchronized(lock) { stoppers.remove(token) }
        }
    }

    fun stopAllForBackground() = stopAll()

    fun stopAllForPrivacy() = stopAll()

    internal fun registeredCountForTest(): Int = synchronized(lock) { stoppers.size }

    internal fun clearForTest() {
        synchronized(lock) { stoppers.clear() }
    }

    private fun stopAll() {
        val snapshot = synchronized(lock) { stoppers.values.toList() }
        snapshot.forEach { stopper -> runCatching { stopper() } }
    }
}
