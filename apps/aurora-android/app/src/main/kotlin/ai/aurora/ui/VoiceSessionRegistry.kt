package ai.aurora.ui

/**
 * Process-local registry for bounded voice resources.
 *
 * This registry owns no conversation, permission, business authority, or execution truth. It only
 * provides fail-closed stop points for STT/TTS when the Activity leaves foreground or Privacy Mode
 * becomes active. Privacy may additionally purge presentation-only voice content.
 */
object VoiceSessionRegistry {
    private data class Hooks(
        val background: () -> Unit,
        val privacy: () -> Unit,
    )

    private val lock = Any()
    private var sequence = 0L
    private val hooks = LinkedHashMap<Long, Hooks>()

    fun register(
        onBackground: () -> Unit,
        onPrivacy: () -> Unit = onBackground,
    ): AutoCloseable {
        val token = synchronized(lock) {
            sequence += 1
            sequence.also { hooks[it] = Hooks(onBackground, onPrivacy) }
        }
        return AutoCloseable {
            synchronized(lock) { hooks.remove(token) }
        }
    }

    fun stopAllForBackground() = dispatch { it.background }

    fun stopAllForPrivacy() = dispatch { it.privacy }

    internal fun registeredCountForTest(): Int = synchronized(lock) { hooks.size }

    internal fun clearForTest() {
        synchronized(lock) { hooks.clear() }
    }

    private fun dispatch(selector: (Hooks) -> () -> Unit) {
        val snapshot = synchronized(lock) { hooks.values.map(selector) }
        snapshot.forEach { stopper -> runCatching { stopper() } }
    }
}
