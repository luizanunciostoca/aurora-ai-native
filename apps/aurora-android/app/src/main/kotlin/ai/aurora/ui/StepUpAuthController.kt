package ai.aurora.ui

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import java.util.concurrent.Executor

data class StepUpAvailability(
    val available: Boolean,
    val detail: String,
)

class StepUpAuthController(
    private val activity: FragmentActivity,
    private val onStarted: () -> Unit,
    private val onSucceeded: (String) -> Unit,
    private val onFailed: (String) -> Unit,
) {
    private val executor: Executor = activity.mainExecutor
    private val authenticators =
        BiometricManager.Authenticators.BIOMETRIC_STRONG or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL

    fun availability(): StepUpAvailability {
        val result = BiometricManager.from(activity).canAuthenticate(authenticators)
        return when (result) {
            BiometricManager.BIOMETRIC_SUCCESS -> StepUpAvailability(true, "Biometria forte ou credencial do dispositivo disponível")
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> StepUpAvailability(false, "Nenhuma biometria/credencial elegível cadastrada")
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> StepUpAvailability(false, "Hardware biométrico não disponível")
            BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> StepUpAvailability(false, "Hardware biométrico temporariamente indisponível")
            else -> StepUpAvailability(false, "Step-up indisponível neste dispositivo (código $result)")
        }
    }

    fun authenticate(reason: String) {
        val status = availability()
        if (!status.available) {
            onFailed(status.detail)
            return
        }
        onStarted()
        val prompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onSucceeded("BIOMETRIC_OR_DEVICE_CREDENTIAL")
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    onFailed("Step-up interrompido: ${errString.toString().take(160)}")
                }

                override fun onAuthenticationFailed() {
                    onFailed("Identidade não confirmada. Nenhuma decisão foi enviada.")
                }
            },
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Confirmar identidade")
            .setSubtitle(reason.take(160))
            .setDescription("Esta confirmação prova interação local; não cria authority de negócio.")
            .setAllowedAuthenticators(authenticators)
            .setConfirmationRequired(true)
            .build()
        prompt.authenticate(info)
    }
}
