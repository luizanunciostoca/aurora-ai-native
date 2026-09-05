package ai.aurora.ui

enum class VoiceDiagnosticStatus {
    IDLE,
    LISTENING,
    SUCCEEDED,
    ERROR,
}

data class VoiceDiagnosticUiState(
    val status: VoiceDiagnosticStatus = VoiceDiagnosticStatus.IDLE,
    val partialTranscript: String = "",
    val transcript: String = "",
    val detail: String = "Nenhum teste de microfone executado nesta sessão.",
) {
    val createsConversationIntent: Boolean
        get() = false

    val authorizesExecution: Boolean
        get() = false
}
