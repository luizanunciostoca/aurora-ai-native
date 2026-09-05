package ai.aurora.ui

import ai.aurora.device.AuroraApplication

enum class DeviceKeyUiStatus {
    NOT_CHECKED,
    READY,
    ERROR,
}

data class DeviceKeyUiState(
    val status: DeviceKeyUiStatus = DeviceKeyUiStatus.NOT_CHECKED,
    val algorithm: String = "—",
    val fingerprintSha256: String = "—",
    val detail: String = "Chave local ainda não verificada nesta sessão da UI.",
) {
    val authorizesExecution: Boolean
        get() = false

    val establishesRemoteTrust: Boolean
        get() = false
}

class DeviceKeyProvisioningController(
    private val application: AuroraApplication,
) {
    fun prepareOrVerify(): DeviceKeyUiState =
        runCatching {
            val material = application.deviceSessionClient().prepareRegistrationKey()
            DeviceKeyUiState(
                status = DeviceKeyUiStatus.READY,
                algorithm = material.algorithm,
                fingerprintSha256 = material.fingerprintSha256,
                detail = "Chave não exportável pronta no Android Keystore. Registration/trust remoto ainda não foi criado.",
            )
        }.getOrElse { error ->
            DeviceKeyUiState(
                status = DeviceKeyUiStatus.ERROR,
                detail = "Falha ao preparar a chave local: ${error::class.java.simpleName}",
            )
        }
}
