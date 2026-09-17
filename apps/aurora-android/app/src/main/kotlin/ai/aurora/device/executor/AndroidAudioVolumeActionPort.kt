package ai.aurora.device.executor

import android.content.Context
import android.media.AudioManager
import kotlin.math.roundToInt

const val W15J_AUDIO_VOLUME_STEP_UP_ACTION = "AUDIO_VOLUME_STEP_UP"
const val W15_AUDIO_VOLUME_STEP_DOWN_ACTION = "AUDIO_VOLUME_STEP_DOWN"
const val W15_AUDIO_VOLUME_SET_PERCENT_ACTION = "AUDIO_VOLUME_SET_PERCENT"

/**
 * Governed W15 native media-volume implementation.
 *
 * The port is invoked only after DeviceExecutorRuntime revalidates current W07/W14/capability and
 * permission preconditions. Every supported mutation is allowlisted and followed by local readback.
 */
class AndroidAudioVolumeActionPort(context: Context) : DeviceActionPort {
    private val audioManager = checkNotNull(context.getSystemService(AudioManager::class.java))

    override fun execute(command: DeviceActionCommand, context: DeviceActionContext): DeviceActionResult {
        if (context.capabilityId != CAPABILITY_ID) {
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

        val expected =
            when (command.actionId) {
                W15J_AUDIO_VOLUME_STEP_UP_ACTION -> {
                    if (command.arguments.isNotEmpty()) {
                        return DeviceActionResult.VerifiedFailure("volume step does not accept arguments")
                    }
                    if (before >= maximum) {
                        return DeviceActionResult.VerifiedFailure(
                            reason = "media volume is already at maximum",
                            readback = "media-volume:$before/$maximum",
                        )
                    }
                    before + 1
                }
                W15_AUDIO_VOLUME_STEP_DOWN_ACTION -> {
                    if (command.arguments.isNotEmpty()) {
                        return DeviceActionResult.VerifiedFailure("volume step does not accept arguments")
                    }
                    if (before <= 0) {
                        return DeviceActionResult.VerifiedFailure(
                            reason = "media volume is already at minimum",
                            readback = "media-volume:$before/$maximum",
                        )
                    }
                    before - 1
                }
                W15_AUDIO_VOLUME_SET_PERCENT_ACTION -> {
                    if (command.arguments.keys != setOf(ARG_PERCENT)) {
                        return DeviceActionResult.VerifiedFailure("volume percent requires exactly percent")
                    }
                    val percent = command.arguments[ARG_PERCENT]?.toIntOrNull()
                    if (percent == null || percent !in 0..100) {
                        return DeviceActionResult.VerifiedFailure("volume percent must be an integer from 0 to 100")
                    }
                    ((percent.toDouble() / 100.0) * maximum.toDouble()).roundToInt().coerceIn(0, maximum)
                }
                else -> return DeviceActionResult.VerifiedFailure("native action is not allowlisted")
            }

        if (expected == before) {
            return DeviceActionResult.VerifiedSuccess("media-volume:$before/$maximum")
        }

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

    companion object {
        const val CAPABILITY_ID = "audio.volume.set"
        private const val ARG_PERCENT = "percent"
    }
}
