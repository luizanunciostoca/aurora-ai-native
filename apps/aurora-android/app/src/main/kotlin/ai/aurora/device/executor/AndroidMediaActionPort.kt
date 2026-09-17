package ai.aurora.device.executor

import android.content.ComponentName
import android.content.Context
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import ai.aurora.device.media.AuroraMediaSessionListenerService

const val W15_MEDIA_PLAY_ACTION = "MEDIA_PLAY"
const val W15_MEDIA_PAUSE_ACTION = "MEDIA_PAUSE"

/**
 * Governed active-media controller. Notification-listener special access is a local precondition,
 * never authority. Play/pause return verified success only after bounded PlaybackState readback.
 */
class AndroidMediaActionPort(context: Context) : DeviceActionPort {
    private val appContext = context.applicationContext
    private val mediaSessionManager = checkNotNull(appContext.getSystemService(MediaSessionManager::class.java))
    private val listenerComponent = ComponentName(appContext, AuroraMediaSessionListenerService::class.java)

    override fun execute(command: DeviceActionCommand, context: DeviceActionContext): DeviceActionResult {
        val expectedCapability =
            when (command.actionId) {
                W15_MEDIA_PLAY_ACTION -> PLAY_CAPABILITY_ID
                W15_MEDIA_PAUSE_ACTION -> PAUSE_CAPABILITY_ID
                else -> return DeviceActionResult.VerifiedFailure("native action is not allowlisted")
            }
        if (context.capabilityId != expectedCapability) {
            return DeviceActionResult.VerifiedFailure("capability/action binding mismatch")
        }
        if (command.arguments.isNotEmpty()) {
            return DeviceActionResult.VerifiedFailure("media play/pause does not accept arguments")
        }

        val controller =
            try {
                selectController(mediaSessionManager.getActiveSessions(listenerComponent))
            } catch (_: SecurityException) {
                return DeviceActionResult.VerifiedFailure("media-session special access is required")
            }
                ?: return DeviceActionResult.VerifiedFailure("no active media session is available")

        val before = controller.playbackState?.state
        try {
            when (command.actionId) {
                W15_MEDIA_PLAY_ACTION -> controller.transportControls.play()
                W15_MEDIA_PAUSE_ACTION -> controller.transportControls.pause()
            }
        } catch (failure: RuntimeException) {
            return DeviceActionResult.Ambiguous(
                "media transport raised after dispatch: ${failure.javaClass.simpleName}",
            )
        }

        val desired =
            if (command.actionId == W15_MEDIA_PLAY_ACTION) {
                setOf(PlaybackState.STATE_PLAYING, PlaybackState.STATE_BUFFERING, PlaybackState.STATE_CONNECTING)
            } else {
                setOf(PlaybackState.STATE_PAUSED, PlaybackState.STATE_STOPPED)
            }
        val after = awaitState(controller, desired)
        return if (after in desired) {
            DeviceActionResult.VerifiedSuccess("media-playback:$before->$after")
        } else {
            DeviceActionResult.Ambiguous("media transport dispatched without matching playback readback")
        }
    }

    private fun selectController(controllers: List<MediaController>): MediaController? =
        controllers.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING }
            ?: controllers.firstOrNull()

    private fun awaitState(controller: MediaController, desired: Set<Int>): Int? {
        repeat(MAX_READBACK_ATTEMPTS) { attempt ->
            val state = controller.playbackState?.state
            if (state in desired) return state
            if (attempt + 1 < MAX_READBACK_ATTEMPTS) Thread.sleep(READBACK_DELAY_MS)
        }
        return controller.playbackState?.state
    }

    companion object {
        const val PLAY_CAPABILITY_ID = "media.play"
        const val PAUSE_CAPABILITY_ID = "media.pause"
        private const val MAX_READBACK_ATTEMPTS = 7
        private const val READBACK_DELAY_MS = 75L
    }
}
