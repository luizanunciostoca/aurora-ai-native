package ai.aurora.ui

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

data class VoiceRecognitionConfig(
    val languageTag: String = "pt-BR",
    val preferOffline: Boolean = true,
    val partialResults: Boolean = true,
    val maxResults: Int = 3,
) {
    init {
        require(languageTag.isNotBlank() && languageTag.length <= 32)
        require(maxResults in 1..5)
    }
}

data class VoiceInputAvailability(
    val available: Boolean,
    val engineLabel: String,
)

private data class RecognizerSelection(
    val recognizer: SpeechRecognizer,
    val label: String,
)

class VoiceCaptureController(
    private val context: Context,
    private val onListening: () -> Unit,
    private val onPartial: (String) -> Unit,
    private val onResult: (String) -> Unit,
    private val onError: (String) -> Unit,
) : AutoCloseable {
    private var recognizer: SpeechRecognizer? = null
    private val registryRegistration = VoiceSessionRegistry.register(
        onBackground = { stopForLifecycle() },
        onPrivacy = { purgeForPrivacy() },
    )

    fun availability(preferOffline: Boolean): VoiceInputAvailability {
        val standard = SpeechRecognizer.isRecognitionAvailable(context)
        val onDevice = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
        return when {
            preferOffline && onDevice -> VoiceInputAvailability(true, "Android speech · preferência on-device")
            standard -> VoiceInputAvailability(true, if (onDevice) "Android speech · on-device disponível" else "Android speech")
            else -> VoiceInputAvailability(false, "Reconhecimento indisponível")
        }
    }

    fun start(config: VoiceRecognitionConfig): VoiceInputAvailability {
        closeRecognizer()
        val status = availability(config.preferOffline)
        if (!status.available) {
            onError("Reconhecimento de voz não está disponível neste dispositivo.")
            return status
        }

        val selection = createRecognizer(config)
        if (selection == null) {
            val unavailable = VoiceInputAvailability(false, "Reconhecimento indisponível")
            onError("Não foi possível iniciar nenhum mecanismo de reconhecimento de voz.")
            return unavailable
        }

        val instance = selection.recognizer
        recognizer = instance
        instance.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = onListening()
            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(rmsdB: Float) = Unit
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() = Unit

            override fun onError(error: Int) {
                onError(errorMessage(error))
                closeRecognizer()
            }

            override fun onResults(results: Bundle?) {
                val transcript = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                    .orEmpty()
                if (transcript.isBlank()) {
                    onError("Não consegui obter um transcript utilizável.")
                } else {
                    onResult(transcript)
                }
                closeRecognizer()
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val transcript = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                    .orEmpty()
                if (transcript.isNotBlank()) onPartial(transcript)
            }

            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, config.languageTag)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, config.languageTag)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, config.partialResults)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, config.maxResults)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, config.preferOffline)
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Fale com a Aurora")
        }
        val started = runCatching {
            instance.startListening(intent)
            true
        }.getOrElse {
            onError("O serviço de voz recusou a solicitação.")
            closeRecognizer()
            false
        }
        return if (started) {
            VoiceInputAvailability(true, selection.label)
        } else {
            VoiceInputAvailability(false, "Falha ao iniciar ${selection.label}")
        }
    }

    fun cancel() {
        runCatching { recognizer?.cancel() }
        closeRecognizer()
    }

    override fun close() {
        registryRegistration.close()
        closeRecognizer()
    }

    private fun createRecognizer(config: VoiceRecognitionConfig): RecognizerSelection? {
        val standardAvailable = SpeechRecognizer.isRecognitionAvailable(context)
        val onDeviceAvailable = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)

        if (config.preferOffline && onDeviceAvailable) {
            val onDevice = runCatching { SpeechRecognizer.createOnDeviceSpeechRecognizer(context) }.getOrNull()
            if (onDevice != null) return RecognizerSelection(onDevice, "Android on-device")
        }

        if (standardAvailable) {
            val standard = runCatching { SpeechRecognizer.createSpeechRecognizer(context) }.getOrNull()
            if (standard != null) {
                val label = if (config.preferOffline && onDeviceAvailable) {
                    "Android speech · fallback do on-device"
                } else {
                    "Android speech"
                }
                return RecognizerSelection(standard, label)
            }
        }
        return null
    }

    private fun stopForLifecycle() {
        if (recognizer == null) return
        runCatching { recognizer?.cancel() }
        closeRecognizer()
        onError("Captura de voz interrompida porque a Aurora saiu do primeiro plano.")
    }

    private fun purgeForPrivacy() {
        val wasActive = recognizer != null
        if (wasActive) {
            runCatching { recognizer?.cancel() }
            closeRecognizer()
        }
        // Empty result is intentionally presentation-only: conversational handling clears the last
        // transcript and submitText ignores blank input; diagnostic handling is replaced by error.
        onResult("")
        onError(
            if (wasActive) {
                "Captura de voz interrompida e transcript limpo pelo modo de privacidade."
            } else {
                "Conteúdo de voz local limpo pelo modo de privacidade."
            },
        )
    }

    private fun closeRecognizer() {
        val current = recognizer ?: return
        recognizer = null
        runCatching { current.destroy() }
    }

    private fun errorMessage(error: Int): String = when (error) {
        SpeechRecognizer.ERROR_AUDIO -> "Falha de áudio durante o reconhecimento."
        SpeechRecognizer.ERROR_CLIENT -> "A captura de voz foi interrompida pelo cliente."
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Permissão de microfone não está disponível."
        SpeechRecognizer.ERROR_NETWORK -> "Falha de rede no serviço de reconhecimento."
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Timeout de rede no reconhecimento de voz."
        SpeechRecognizer.ERROR_NO_MATCH -> "Não encontrei uma frase reconhecível."
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "O reconhecedor de voz está ocupado."
        SpeechRecognizer.ERROR_SERVER -> "O serviço de reconhecimento retornou erro."
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Nenhuma fala foi detectada."
        SpeechRecognizer.ERROR_SERVER_DISCONNECTED -> "O serviço de reconhecimento foi desconectado."
        SpeechRecognizer.ERROR_TOO_MANY_REQUESTS -> "O serviço de reconhecimento recebeu solicitações demais."
        SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED -> "O idioma configurado não é suportado pelo reconhecedor."
        SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "O idioma configurado está temporariamente indisponível."
        else -> "Falha de reconhecimento de voz (código $error)."
    }
}
