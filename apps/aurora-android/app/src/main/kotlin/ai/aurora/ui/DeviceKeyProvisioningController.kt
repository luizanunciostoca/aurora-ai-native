package ai.aurora.ui

import ai.aurora.device.AuroraApplication
import ai.aurora.device.security.AndroidKeystoreSigningKeyStore

enum class DeviceKeyUiStatus {
    NOT_CHECKED,
    READY,
    ERROR,
}

data class DeviceKeyUiState(
    val status: DeviceKeyUiStatus = DeviceKeyUiStatus.NOT_CHECKED,
    val algorithm: String = "—",
    val fingerprintSha256: String = "—",
    val securityLevel: String = "UNKNOWN",
    val secureHardwareBacked: Boolean? = null,
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
            val security = AndroidKeystoreSigningKeyStore().securityInfo(material.alias)
            DeviceKeyUiState(
                status = DeviceKeyUiStatus.READY,
                algorithm = material.algorithm,
                fingerprintSha256 = material.fingerprintSha256,
                securityLevel = security.level.name,
                secureHardwareBacked = security.secureHardwareBacked,
                detail = when (security.secureHardwareBacked) {
                    true -> "Chave não exportável pronta no Android Keystore e protegida por hardware seguro (${security.level.name}). Registration/trust remoto ainda não foi criado."
                    false -> "Chave não exportável pronta no Android Keystore, mas este dispositivo reporta proteção em software. Registration/trust remoto ainda não foi criado."
                    null -> "Chave não exportável pronta no Android Keystore; o nível de proteção não pôde ser determinado. Registration/trust remoto ainda não foi criado."
                },
            )
        }.getOrElse { error ->
            DeviceKeyUiState(
                status = DeviceKeyUiStatus.ERROR,
                detail = "Falha ao preparar a chave local: ${error::class.java.simpleName}",
            )
        }
}
