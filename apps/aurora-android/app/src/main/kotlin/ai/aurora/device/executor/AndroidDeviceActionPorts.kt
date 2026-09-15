package ai.aurora.device.executor

import android.content.Context

object AndroidDeviceActionPorts {
    fun create(context: Context): CompositeDeviceActionPort {
        val volume = AndroidAudioVolumeActionPort(context)
        val system = AndroidSystemActionPort(context)
        val app = AndroidAppLaunchActionPort(context)
        val media = AndroidMediaActionPort(context)
        return CompositeDeviceActionPort(
            listOf(
                DeviceActionBinding(
                    W15J_AUDIO_VOLUME_STEP_UP_ACTION,
                    AndroidAudioVolumeActionPort.CAPABILITY_ID,
                    volume,
                ),
                DeviceActionBinding(
                    W15_AUDIO_VOLUME_STEP_DOWN_ACTION,
                    AndroidAudioVolumeActionPort.CAPABILITY_ID,
                    volume,
                ),
                DeviceActionBinding(
                    W15_AUDIO_VOLUME_SET_PERCENT_ACTION,
                    AndroidAudioVolumeActionPort.CAPABILITY_ID,
                    volume,
                ),
                DeviceActionBinding(W15_OPEN_SETTINGS_ACTION, AndroidSystemActionPort.CAPABILITY_ID, system),
                DeviceActionBinding(W15_OPEN_HOME_ACTION, AndroidSystemActionPort.CAPABILITY_ID, system),
                DeviceActionBinding(W15_OPEN_CAMERA_ACTION, AndroidSystemActionPort.CAPABILITY_ID, system),
                DeviceActionBinding(
                    W15_OPEN_BROWSER_SEARCH_ACTION,
                    AndroidSystemActionPort.CAPABILITY_ID,
                    system,
                ),
                DeviceActionBinding(
                    W15_OPEN_VALIDATED_APP_ACTION,
                    AndroidAppLaunchActionPort.CAPABILITY_ID,
                    app,
                ),
                DeviceActionBinding(W15_MEDIA_PLAY_ACTION, AndroidMediaActionPort.PLAY_CAPABILITY_ID, media),
                DeviceActionBinding(W15_MEDIA_PAUSE_ACTION, AndroidMediaActionPort.PAUSE_CAPABILITY_ID, media),
            ),
        )
    }
}
