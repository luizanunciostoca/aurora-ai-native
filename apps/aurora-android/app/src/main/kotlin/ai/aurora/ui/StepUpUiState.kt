package ai.aurora.ui

enum class StepUpStatus {
    CHECKING,
    AVAILABLE,
    AUTHENTICATING,
    SUCCEEDED,
    FAILED,
    UNAVAILABLE,
}

data class StepUpUiState(
    val status: StepUpStatus = StepUpStatus.CHECKING,
    val detail: String = "Verificando step-up local",
    val method: String? = null,
    val successSequence: Long = 0,
) {
    val provesBusinessAuthority: Boolean = false
    val authorizesExecution: Boolean = false
}
