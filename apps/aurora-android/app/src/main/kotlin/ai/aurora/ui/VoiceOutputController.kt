package ai.aurora.ui

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import ai.aurora.ui.model.AuroraSettings
import java.util.Locale

class VoiceOutputController(
    context: Context,
    private val onAvailability: (Boolean, String, String) -> Unit,
    private val onStarted: (Long) -> Unit,
    private val onCompleted: (Long) -> Unit,
    private val onError: (Long?, String) -> Unit,
) : AutoCloseable {
    private val appContext = context.applicationContext
    private val audioManager = appContext.getSystemService(AudioManager::class.java)
    private var tts: TextToSpeech? = null
    private var initialized = false
    private var currentRequestId: Long? = null
    private var focusRequest: AudioFocusRequest? = null

    init {
        tts = TextToSpeech(appContext) { status ->
            initialized = status == TextToSpeech.SUCCESS
            val engine = if (initialized) {
                runCatching { tts?.defaultEngine }.getOrNull().orEmpty().ifBlank { "Android TTS" }
            } else {
                "TTS indisponível"
            }
            onAvailability(initialized, engine, currentAudioRouteLabel())
            if (!initialized) onError(null, "Síntese de voz não está disponível neste dispositivo.")
        }.also { engine ->
            engine.setOnUtteranceProgressListener(
                object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {
                        val id = utteranceId?.toLongOrNull() ?: return
                        currentRequestId = id
                        onStarted(id)
                    }

                    override fun onDone(utteranceId: String?) {
                        val id = utteranceId?.toLongOrNull() ?: return
                        currentRequestId = null
                        abandonAudioFocus()
                        onCompleted(id)
                    }

                    @Deprecated("Deprecated by Android; retained for API compatibility")
                    override fun onError(utteranceId: String?) {
                        failUtterance(utteranceId, "Falha ao sintetizar a resposta.")
                    }

                    override fun onError(utteranceId: String?, errorCode: Int) {
                        failUtterance(utteranceId, "Falha de síntese de voz (código $errorCode).")
                    }
                },
            )
        }
    }

    fun speak(text: String, settings: AuroraSettings, requestId: Long) {
        if (!settings.voiceOutputEnabled || settings.privacyMode) {
            onError(requestId, "Saída de voz está desativada pelas preferências atuais.")
            return
        }
        if (!initialized) {
            onError(requestId, "O mecanismo TTS ainda não está disponível.")
            return
        }
        val engine = tts ?: run {
            onError(requestId, "O mecanismo TTS foi encerrado.")
            return
        }
        val language = Locale.forLanguageTag(settings.voiceLanguageTag)
        if (language.language.isBlank()) {
            onError(requestId, "Idioma de voz inválido: ${settings.voiceLanguageTag}.")
            return
        }
        val languageResult = engine.setLanguage(language)
        if (languageResult == TextToSpeech.LANG_MISSING_DATA || languageResult == TextToSpeech.LANG_NOT_SUPPORTED) {
            onError(requestId, "O mecanismo TTS não suporta ${settings.voiceLanguageTag}.")
            return
        }
        engine.setSpeechRate(settings.voiceSpeechRate)
        engine.setPitch(settings.voicePitch)
        engine.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
        )
        currentRequestId = requestId
        if (!requestAudioFocus()) {
            currentRequestId = null
            onError(requestId, "Audio focus não foi concedido; a Aurora não iniciou a fala.")
            return
        }
        onAvailability(true, runCatching { engine.defaultEngine }.getOrNull().orEmpty().ifBlank { "Android TTS" }, currentAudioRouteLabel())
        val result = engine.speak(
            text.take(MAX_SPEAK_CHARS),
            TextToSpeech.QUEUE_FLUSH,
            Bundle(),
            requestId.toString(),
        )
        if (result == TextToSpeech.ERROR) {
            currentRequestId = null
            abandonAudioFocus()
            onError(requestId, "O mecanismo TTS recusou a solicitação de fala.")
        }
    }

    fun stop() {
        currentRequestId = null
        runCatching { tts?.stop() }
        abandonAudioFocus()
    }

    fun currentAudioRouteLabel(): String {
        val outputs = runCatching { audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList() }.getOrDefault(emptyList())
        val preferred = outputs.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || it.type == AudioDeviceInfo.TYPE_BLE_HEADSET }
            ?: outputs.firstOrNull { it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET || it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES }
            ?: outputs.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
        return when (preferred?.type) {
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
            AudioDeviceInfo.TYPE_BLE_HEADSET,
            -> "Bluetooth"
            AudioDeviceInfo.TYPE_WIRED_HEADSET,
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
            -> "Headset"
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "Alto-falante"
            else -> "Sistema"
        }
    }

    override fun close() {
        stop()
        initialized = false
        runCatching { tts?.shutdown() }
        tts = null
    }

    private fun requestAudioFocus(): Boolean {
        abandonAudioFocus()
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            .setOnAudioFocusChangeListener { change ->
                if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                    interruptForAudioFocus()
                }
            }
            .build()
        val result = audioManager.requestAudioFocus(request)
        if (result != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            focusRequest = null
            return false
        }
        focusRequest = request
        return true
    }

    private fun interruptForAudioFocus() {
        val interruptedId = currentRequestId ?: return
        currentRequestId = null
        runCatching { tts?.stop() }
        abandonAudioFocus()
        onError(interruptedId, "Saída de voz interrompida por perda de audio focus.")
    }

    private fun abandonAudioFocus() {
        val request = focusRequest ?: return
        focusRequest = null
        runCatching { audioManager.abandonAudioFocusRequest(request) }
    }

    private fun failUtterance(utteranceId: String?, message: String) {
        val id = utteranceId?.toLongOrNull()
        currentRequestId = null
        abandonAudioFocus()
        onError(id, message)
    }

    companion object {
        private const val MAX_SPEAK_CHARS = 4_000
    }
}
