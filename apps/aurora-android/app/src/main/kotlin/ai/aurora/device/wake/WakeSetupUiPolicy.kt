package ai.aurora.device.wake

/**
 * Pure presentation/recovery policy for the visible wake setup surface.
 *
 * This policy may explain local preconditions and enrollment state. It cannot grant execution,
 * synthesize verified outcomes, or authorize retry of business/device actions.
 */
data class WakeSetupUiInput(
    val microphoneGranted: Boolean,
    val modelReady: Boolean,
    val assistantRoleAvailable: Boolean,
    val assistantSelected: Boolean,
    val wakeEnabled: Boolean,
    val privacyModeEnabled: Boolean,
    val runtimeState: String,
    val runtimeError: String?,
    val enrollmentRetryPending: Boolean,
    val acceptedEnrollmentSamples: Int,
)

data class WakeSetupUiPresentation(
    val runtimeLabel: String,
    val guidance: String,
    val errorLabel: String?,
    val microphoneButtonLabel: String,
    val enrollmentButtonLabel: String,
    val assistantButtonLabel: String,
    val privacyButtonLabel: String,
    val canRequestMicrophone: Boolean,
    val canTrain: Boolean,
    val canRequestAssistantRole: Boolean,
    val canEnableWake: Boolean,
    val canDisableWake: Boolean,
)

object WakeSetupUiPolicy {
    fun present(input: WakeSetupUiInput): WakeSetupUiPresentation {
        require(input.acceptedEnrollmentSamples in 0..3)
        val enrollmentActive = input.runtimeState in ENROLLMENT_ACTIVE_STATES
        val runtimeLabel =
            runtimeLabel(
                state = input.runtimeState,
                modelReady = input.modelReady,
                wakeEnabled = input.wakeEnabled,
            )
        val guidance =
            when {
                input.privacyModeEnabled ->
                    "O modo de privacidade está ativo. Desative-o para usar o microfone ou treinar a palavra Aurora."
                !input.microphoneGranted ->
                    "Conceda acesso ao microfone para treinar e detectar a palavra Aurora."
                enrollmentActive ->
                    "Treinamento em andamento. Mantenha esta tela visível e use o modo de privacidade para interromper com segurança."
                input.enrollmentRetryPending ->
                    "A amostra atual não foi aceita. O modelo anterior, se existir, foi preservado. Repita somente esta amostra em ambiente mais silencioso."
                input.runtimeState == "ENROLLMENT_INTERRUPTED" && input.modelReady ->
                    "O treinamento foi interrompido ao sair da tela. O modelo anterior foi preservado; inicie um novo treinamento quando estiver pronto."
                input.runtimeState == "ENROLLMENT_INTERRUPTED" ->
                    "O treinamento foi interrompido ao sair da tela. Inicie novamente e mantenha esta tela visível durante as três amostras."
                !input.modelReady ->
                    "Treine três amostras de Aurora antes de ativar a escuta local."
                input.wakeEnabled && input.assistantRoleAvailable && !input.assistantSelected ->
                    "O wake local está configurado. Para acordar a Aurora em segundo plano, defina Aurora como assistente padrão do Android."
                input.wakeEnabled ->
                    "Wake local configurado. Diga Aurora para iniciar uma interação; a detecção nunca concede autoridade de ação."
                else ->
                    "Pré-requisitos locais prontos. Ative o wake word quando quiser iniciar a escuta local."
            }

        val nextSample = (input.acceptedEnrollmentSamples + 1).coerceIn(1, 3)
        val enrollmentButtonLabel =
            when {
                enrollmentActive -> "Treinamento em andamento…"
                input.enrollmentRetryPending -> "Repetir amostra $nextSample de 3"
                input.modelReady -> "Treinar novamente “Aurora” (3 amostras)"
                else -> "Treinar “Aurora” (3 amostras)"
            }
        val assistantButtonLabel =
            when {
                !input.assistantRoleAvailable -> "Assistente padrão indisponível neste Android"
                input.assistantSelected -> "Aurora já é o assistente padrão"
                else -> "Definir Aurora como assistente padrão"
            }

        return WakeSetupUiPresentation(
            runtimeLabel = runtimeLabel,
            guidance = guidance,
            errorLabel = userFacingError(input.runtimeError),
            microphoneButtonLabel =
                if (input.microphoneGranted) "Microfone concedido" else "Conceder permissão do microfone",
            enrollmentButtonLabel = enrollmentButtonLabel,
            assistantButtonLabel = assistantButtonLabel,
            privacyButtonLabel =
                if (input.privacyModeEnabled) "Desativar modo de privacidade" else "Ativar modo de privacidade",
            canRequestMicrophone = !input.microphoneGranted && !enrollmentActive,
            canTrain = input.microphoneGranted && !input.privacyModeEnabled && !enrollmentActive,
            canRequestAssistantRole =
                input.assistantRoleAvailable && !input.assistantSelected && !enrollmentActive,
            canEnableWake =
                input.microphoneGranted &&
                    input.modelReady &&
                    !input.privacyModeEnabled &&
                    !input.wakeEnabled &&
                    !enrollmentActive,
            canDisableWake = input.wakeEnabled && !enrollmentActive,
        )
    }

    fun runtimeLabel(
        state: String,
        modelReady: Boolean,
        wakeEnabled: Boolean,
    ): String =
        when {
            state in ENROLLMENT_FAILURE_STATES && modelReady && wakeEnabled ->
                "Wake configurado; novo treinamento incompleto, modelo anterior preservado"
            state in ENROLLMENT_FAILURE_STATES && modelReady ->
                "Novo treinamento incompleto; modelo anterior preservado"
            state == "ENROLLMENT_STARTING" -> "Preparando treinamento local"
            state == "ENROLLMENT_CAPTURING" -> "Treinamento local em andamento"
            state == "ENROLLMENT_INTERRUPTED" && modelReady ->
                "Treinamento interrompido; modelo anterior preservado"
            state == "ENROLLMENT_INTERRUPTED" -> "Treinamento interrompido"
            state == "DISABLED" -> "Desativado"
            state == "INITIALIZING" -> "Inicializando detector local"
            state == "ARMED" || state == "HOTWORD_LISTENING" -> "Escutando por “Aurora”"
            state == "HOTWORD_CANDIDATE" -> "Validando possível wake word"
            state == "HOTWORD_CONFIRMED" -> "“Aurora” detectada"
            state == "WAKE_ASSISTANT_HANDOFF" -> "Wake detectado; encaminhando ao assistente Android"
            state == "WAKE_FOREGROUND_HANDOFF" -> "Wake detectado; iniciando captura de voz"
            state == "STT_LISTENING" -> "Ouvindo comando"
            state == "W07_EVALUATION_SUBMITTED" -> "Comando enviado para avaliação governada"
            state == "ENROLLMENT_READY" -> "Treinamento concluído"
            state == "USER_SETUP_REQUIRED" -> "Treinamento da palavra Aurora necessário"
            state == "WAKE_PRIVACY_BLOCKED" || state == "PRIVACY_BLOCKED" ->
                "Bloqueado pelo modo de privacidade"
            state == "WAKE_PERMISSION_BLOCKED" || state == "PERMISSION_REQUIRED" ->
                "Permissão de microfone necessária"
            state == "ASSISTANT_ROLE_REQUIRED" ->
                "Assistente padrão necessário para wake em segundo plano"
            state == "WAKE_PLATFORM_BLOCKED" -> "Android bloqueou temporariamente o detector"
            state == "WAKE_ENGINE_ERROR" -> "Falha no detector local"
            state.startsWith("STT_") -> "Reconhecimento de voz: ${state.removePrefix("STT_").lowercase().replace('_', ' ')}"
            else -> state.lowercase().replace('_', ' ')
        }

    fun isRecoverableEnrollmentError(message: String): Boolean =
        message.contains("sample was not clear enough", ignoreCase = true)

    fun userFacingError(message: String?): String? {
        if (message.isNullOrBlank()) return null
        return when {
            message.contains("sample was not clear enough", ignoreCase = true) ->
                "A amostra não ficou clara. Fale “Aurora” em tom normal, a cerca de 30–60 cm do tablet e evite ruído próximo."
            message.contains("microphone permission", ignoreCase = true) ->
                "A permissão do microfone é necessária para este passo."
            message.contains("audio ownership", ignoreCase = true) ->
                "O microfone ainda está ocupado por outro fluxo. Aguarde alguns segundos e tente novamente."
            message.contains("background wake requires", ignoreCase = true) ->
                "Para acordar a Aurora em segundo plano, configure Aurora como assistente padrão."
            message.contains("wake start failed", ignoreCase = true) ->
                "O Android não conseguiu iniciar o detector local. Revise permissão, privacidade e tente ativar novamente."
            message.contains("left foreground", ignoreCase = true) ->
                "A interação de voz foi encerrada porque a tela saiu do primeiro plano."
            else -> "Diagnóstico local: ${message.take(180)}"
        }
    }

    private val ENROLLMENT_ACTIVE_STATES =
        setOf(
            "ENROLLMENT_STARTING",
            "ENROLLMENT_CAPTURING",
        )

    private val ENROLLMENT_FAILURE_STATES =
        setOf(
            "ENROLLMENT_FAILED",
            "ENROLLMENT_RETRY_REQUIRED",
            "ENROLLMENT_AUDIO_BUSY",
            "ENROLLMENT_PRIVACY_BLOCKED",
        )
}
