package ai.aurora.device.bootstrap

import android.app.Activity
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import ai.aurora.device.AuroraApplication
import ai.aurora.device.config.AuroraEnvironment
import ai.aurora.device.ui.AuroraActivityUi
import ai.aurora.device.voice.GatewayVoiceRuntimeCompositionError
import ai.aurora.device.voice.GatewayVoiceRuntimeCompositionResult

/**
 * LOCAL physical-acceptance helper only. The reference is copied directly into process memory and
 * the text field is cleared immediately. It is never written to preferences, files, logs, evidence
 * or BuildConfig and carries no tenant/actor/action authority.
 */
class GatewayBootstrapSetupActivity : Activity() {
    private var referenceView: EditText? = null
    private var actionButton: Button? = null
    private var compositionInProgress = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // The bootstrap reference is transient credential material. Prevent task/screenshot capture
        // and do not let the EditText participate in instance-state or autofill persistence.
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)

        val app = application as AuroraApplication
        val screen = AuroraActivityUi.createScrollableScreen(this, maxContentWidthDp = 640)
        val layout = screen.content
        layout.addView(AuroraActivityUi.heading(this, "Bootstrap LOCAL"))
        val status = AuroraActivityUi.body(this)
        layout.addView(status)

        if (
            app.environmentConfig.environment != AuroraEnvironment.LOCAL ||
            !app.environmentConfig.allowCleartextTraffic
        ) {
            status.text = "Bootstrap local indisponível fora do ambiente LOCAL controlado."
            setContentView(screen.root)
            return
        }

        status.text =
            "Cole a referência temporária entregue pelo host LOCAL. Ela será consumida somente em memória e removida do campo imediatamente."
        val reference =
            EditText(this).apply {
                hint = "Referência bootstrap temporária"
                inputType =
                    InputType.TYPE_CLASS_TEXT or
                        InputType.TYPE_TEXT_VARIATION_PASSWORD or
                        InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
                isSingleLine = true
                isSaveEnabled = false
                importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
            }
        referenceView = reference
        layout.addView(reference)

        val action =
            AuroraActivityUi.actionButton(this, "Conectar runtime governado") {
                if (compositionInProgress) return@actionButton
                val candidate = reference.text?.toString().orEmpty()
                reference.text?.clear()
                val installed = app.localGatewayBootstrapRuntime().installReference(candidate)
                if (!installed) {
                    status.text =
                        "Referência inválida; nenhum bootstrap foi carregado. Solicite uma referência nova ao host LOCAL."
                    return@actionButton
                }

                // Socket/bootstrap exchange must never run on Android's main thread. The credential
                // and reference remain process-local; only a sanitized disposition returns to UI.
                compositionInProgress = true
                actionButton?.isEnabled = false
                status.text = "Compondo canal W14 autenticado e ingress W07 governado…"
                Thread(
                    {
                        val result = app.composeLocalVoiceIngressFromPendingBootstrap()
                        runOnUiThread {
                            compositionInProgress = false
                            if (!isFinishing && !isDestroyed) {
                                actionButton?.isEnabled = !reference.text.isNullOrBlank()
                                status.text = result.toOperatorMessage()
                            }
                        }
                    },
                    "aurora-w14-bootstrap-compose",
                ).start()
            }.apply {
                isEnabled = false
                filterTouchesWhenObscured = true
            }
        actionButton = action
        layout.addView(action)
        reference.addTextChangedListener(
            object : TextWatcher {
                override fun beforeTextChanged(
                    s: CharSequence?,
                    start: Int,
                    count: Int,
                    after: Int,
                ) = Unit

                override fun onTextChanged(
                    s: CharSequence?,
                    start: Int,
                    before: Int,
                    count: Int,
                ) {
                    actionButton?.isEnabled = !compositionInProgress && !s.isNullOrBlank()
                }

                override fun afterTextChanged(s: Editable?) = Unit
            },
        )
        setContentView(screen.root)
    }

    override fun onStop() {
        // If the operator leaves before submitting, do not retain credential text in a stopped
        // Activity instance or task snapshot.
        referenceView?.text?.clear()
        super.onStop()
    }

    override fun onDestroy() {
        referenceView?.text?.clear()
        referenceView = null
        actionButton = null
        super.onDestroy()
    }
}

private fun GatewayVoiceRuntimeCompositionResult.toOperatorMessage(): String =
    when (this) {
        GatewayVoiceRuntimeCompositionResult.Composed ->
            "Canal W14 autenticado pronto; comandos de voz seguem para avaliação W07 governada."
        is GatewayVoiceRuntimeCompositionResult.Rejected ->
            when (error) {
                GatewayVoiceRuntimeCompositionError.LOCAL_RUNTIME_UNAVAILABLE ->
                    "Runtime local indisponível; composição bloqueada."
                GatewayVoiceRuntimeCompositionError.LOCAL_BINDING_INVALID ->
                    "Binding local inconsistente; composição bloqueada."
                GatewayVoiceRuntimeCompositionError.BOOTSTRAP_REJECTED ->
                    "Bootstrap rejeitado; obtenha uma nova referência temporária."
                GatewayVoiceRuntimeCompositionError.TENANT_BINDING_MISMATCH ->
                    "Binding autenticado divergente; composição bloqueada."
                GatewayVoiceRuntimeCompositionError.CONNECTION_REJECTED ->
                    "Canal autenticado indisponível; composição bloqueada."
            }
    }
