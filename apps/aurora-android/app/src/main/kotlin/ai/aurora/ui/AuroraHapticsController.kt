package ai.aurora.ui

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

class AuroraHapticsController(context: Context) {
    private val appContext = context.applicationContext

    fun listening(enabled: Boolean) {
        if (enabled) vibrate(28L, 72)
    }

    fun acknowledged(enabled: Boolean) {
        if (enabled) vibrate(18L, 54)
    }

    fun warning(enabled: Boolean) {
        if (enabled) {
            vibrateWaveform(longArrayOf(0L, 34L, 45L, 34L), intArrayOf(0, 92, 0, 92))
        }
    }

    private fun vibrate(durationMs: Long, amplitude: Int) {
        val vibrator = vibrator() ?: return
        if (!vibrator.hasVibrator()) return
        runCatching {
            vibrator.vibrate(VibrationEffect.createOneShot(durationMs, amplitude.coerceIn(1, 255)))
        }
    }

    private fun vibrateWaveform(timings: LongArray, amplitudes: IntArray) {
        val vibrator = vibrator() ?: return
        if (!vibrator.hasVibrator()) return
        runCatching {
            vibrator.vibrate(VibrationEffect.createWaveform(timings, amplitudes, -1))
        }
    }

    private fun vibrator(): Vibrator? =
        if (Build.VERSION.SDK_INT >= 31) {
            appContext.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            appContext.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
}
