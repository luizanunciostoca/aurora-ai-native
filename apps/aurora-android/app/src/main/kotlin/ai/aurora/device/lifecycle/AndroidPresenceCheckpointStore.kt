package ai.aurora.device.lifecycle

import android.content.Context

class AndroidPresenceCheckpointStore(context: Context) : PresenceCheckpointStore {
    private val preferences =
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    override fun load(): PresenceCheckpoint? {
        if (!preferences.contains(KEY_PROCESS_GENERATION)) return null
        val visibility =
            runCatching {
                AppVisibility.valueOf(
                    preferences.getString(KEY_LAST_VISIBILITY, AppVisibility.BACKGROUND.name)
                        ?: AppVisibility.BACKGROUND.name,
                )
            }.getOrDefault(AppVisibility.BACKGROUND)
        return PresenceCheckpoint(
            processGeneration = preferences.getLong(KEY_PROCESS_GENERATION, 0),
            lastVisibility = visibility,
            transitionSequence = preferences.getLong(KEY_TRANSITION_SEQUENCE, 0),
        )
    }

    override fun save(checkpoint: PresenceCheckpoint) {
        preferences
            .edit()
            .putLong(KEY_PROCESS_GENERATION, checkpoint.processGeneration)
            .putString(KEY_LAST_VISIBILITY, checkpoint.lastVisibility.name)
            .putLong(KEY_TRANSITION_SEQUENCE, checkpoint.transitionSequence)
            .apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "aurora_presence_checkpoint"
        const val KEY_PROCESS_GENERATION = "process_generation"
        const val KEY_LAST_VISIBILITY = "last_visibility"
        const val KEY_TRANSITION_SEQUENCE = "transition_sequence"
    }
}
