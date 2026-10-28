package ai.aurora.device.voice

import android.content.Context
import android.media.AudioManager
import android.os.BatteryManager
import java.text.Normalizer
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

enum class LocalDeviceReadIntent {
    TIME,
    DATE,
    BATTERY,
    MEDIA_VOLUME,
}

data class LocalDeviceReadResult(
    val intent: LocalDeviceReadIntent,
    val display: String,
    val authorizesExecution: Boolean = false,
    val provesExecutionSuccess: Boolean = false,
    val retryAuthorized: Boolean = false,
) {
    init {
        require(display.isNotBlank())
        require(!authorizesExecution)
        require(!provesExecutionSuccess)
        require(!retryAuthorized)
    }
}

/**
 * Deterministic read-only recognizer for device facts that never need execution authority.
 * Imperative phrases intentionally do not match this policy.
 */
object LocalDeviceReadPolicy {
    private val timePhrases =
        setOf(
            "que horas sao",
            "qual a hora",
            "qual e a hora",
            "me diga a hora",
            "me fale a hora",
        )
    private val datePhrases =
        setOf(
            "que dia e hoje",
            "qual a data de hoje",
            "qual e a data de hoje",
            "qual a data",
        )
    private val batteryPhrases =
        setOf(
            "qual a bateria",
            "qual e a bateria",
            "quanto de bateria",
            "quanto tem de bateria",
            "quanto esta a bateria",
            "nivel da bateria",
        )
    private val volumePhrases =
        setOf(
            "qual o volume",
            "qual e o volume",
            "quanto esta o volume",
            "nivel do volume",
            "volume atual",
        )

    fun resolve(transcript: String): LocalDeviceReadIntent? =
        when (normalize(transcript)) {
            in timePhrases -> LocalDeviceReadIntent.TIME
            in datePhrases -> LocalDeviceReadIntent.DATE
            in batteryPhrases -> LocalDeviceReadIntent.BATTERY
            in volumePhrases -> LocalDeviceReadIntent.MEDIA_VOLUME
            else -> null
        }

    internal fun normalize(value: String): String =
        Normalizer.normalize(value.lowercase(Locale.forLanguageTag("pt-BR")), Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
            .replace(Regex("[^a-z0-9 ]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
}

class AndroidLocalDeviceReadProvider(
    context: Context,
    private val now: () -> ZonedDateTime = { ZonedDateTime.now() },
) {
    private val appContext = context.applicationContext

    fun read(intent: LocalDeviceReadIntent): LocalDeviceReadResult =
        when (intent) {
            LocalDeviceReadIntent.TIME -> {
                val formatted = now().format(DateTimeFormatter.ofPattern("HH:mm", PT_BR))
                LocalDeviceReadResult(intent, "Agora são $formatted.")
            }
            LocalDeviceReadIntent.DATE -> {
                val formatted = now().format(DateTimeFormatter.ofPattern("d 'de' MMMM 'de' yyyy", PT_BR))
                LocalDeviceReadResult(intent, "Hoje é $formatted.")
            }
            LocalDeviceReadIntent.BATTERY -> readBattery()
            LocalDeviceReadIntent.MEDIA_VOLUME -> readMediaVolume()
        }

    private fun readBattery(): LocalDeviceReadResult {
        val manager = appContext.getSystemService(BatteryManager::class.java)
        val level = manager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: Int.MIN_VALUE
        return if (level in 0..100) {
            LocalDeviceReadResult(LocalDeviceReadIntent.BATTERY, "A bateria está em $level%.")
        } else {
            LocalDeviceReadResult(
                LocalDeviceReadIntent.BATTERY,
                "Não consegui ler o nível da bateria neste dispositivo.",
            )
        }
    }

    private fun readMediaVolume(): LocalDeviceReadResult {
        val manager = appContext.getSystemService(AudioManager::class.java)
        if (manager == null) {
            return LocalDeviceReadResult(
                LocalDeviceReadIntent.MEDIA_VOLUME,
                "Não consegui ler o volume de mídia neste dispositivo.",
            )
        }
        val maximum = manager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val current = manager.getStreamVolume(AudioManager.STREAM_MUSIC)
        if (maximum <= 0 || current !in 0..maximum) {
            return LocalDeviceReadResult(
                LocalDeviceReadIntent.MEDIA_VOLUME,
                "Não consegui ler o volume de mídia neste dispositivo.",
            )
        }
        val percentage = ((current.toDouble() / maximum.toDouble()) * 100.0).roundToInt().coerceIn(0, 100)
        return LocalDeviceReadResult(
            LocalDeviceReadIntent.MEDIA_VOLUME,
            "O volume de mídia está em aproximadamente $percentage%.",
        )
    }

    companion object {
        private val PT_BR = Locale.forLanguageTag("pt-BR")
    }
}
