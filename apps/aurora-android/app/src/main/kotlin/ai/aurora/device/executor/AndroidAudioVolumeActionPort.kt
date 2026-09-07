package ai.aurora.device.executor

import android.content.Context
import android.media.AudioManager

const val W15J_AUDIO_VOLUME_STEP_UP_ACTION = "AUDIO_VOLUME_STEP_UP"

/**
 * Minimal DP5-safe W15 native action implementation.
 *
 * Only one deterministic media-volume step is allowlisted. Arbitrary intents, shell commands,
 * settings writes and raw stream indices from model/voice input are intentionally unsupported.
 * The action performs a local readback after dispatch. A thrown exception after setStreamVolume may
 * represent a post-dispatch ambiguity and is therefore allowed to propagate to DeviceExecutorRuntime,
 * which converts it to EXECUTION_UNCERTAIN without retry permission.
 */
class AndroidAudioVolumeActionPort(context: Context) : DeviceActionPort {
    private val audioManager = checkNotNull(context.getSystemService(AudioManager::class.java))

    override fun execute(command: DeviceActionCommand, context: DeviceActionContext): DeviceActionResult {
        if (command.actionId != W15J_AUDIO_VOLUME_STEP_UP_ACTION || command.arguments.isNotEmpty()) {
            return DeviceActionResult.VerifiedFailure("native action is not allowlisted")
        }
        if (context.capabilityId != "audio.volume.set") {
            return DeviceActionResult.VerifiedFailure("capability/action binding mismatch")
        }

        val before = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
        val maximum = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        if (maximum <= 0 || before !in 0..maximum) {
            return DeviceActionResult.VerifiedFailure(
                reason = "media volume state is invalid",
                readback = "media-volume:$before/$maximum",
            )
        }
        if (before >= maximum) {
            return DeviceActionResult.VerifiedFailure(
                reason = "media volume is already at maximum",
                readback = "media-volume:$before/$maximum",
            )
        }

        val expected = before + 1
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, expected, 0)
        val after = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
        return if (after == expected) {
            DeviceActionResult.VerifiedSuccess("media-volume:$before->$after/$maximum")
        } else {
            DeviceActionResult.VerifiedFailure(
                reason = "media volume readback mismatch",
                readback = "media-volume:$before->$after/$maximum",
            )
        }
    }
}
