package ai.aurora.device.bootstrap

import android.app.Activity
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.View
import android.view.WindowManager
import android.widget.EditText
import android.widget.TextView
import ai.aurora.device.AuroraApplication
import ai.aurora.device.config.AuroraEnvironment
import ai.aurora.device.ui.AuroraActivityUi

/**
 * LOCAL physical-acceptance helper only. The reference is copied directly into process memory and
 * the text field is cleared immediately. It is never written to preferences, files, logs, evidence
 * or BuildConfig and carries no tenant/actor/action authority.
 */
class GatewayBootstrapSetupActivity : Activity() {
    private var referenceView: EditText? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // A bootstrap reference is transient credential material. Prevent recents/screenshot capture
        // and do not let the EditText participate in instance-state/autofill persistence.
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

        val loadButton =
            AuroraActivityUi.actionButton(this, "Carregar bootstrap temporário") {
                val candidate = reference.text?.toString().orEmpty()
                reference.text?.clear()
                val installed = app.localGatewayBootstrapRuntime().installReference(candidate)
                status.text =
                    if (installed) {
                        "Bootstrap temporário carregado somente em memória. Agora retorne ao fluxo de teste físico."
                    } else {
                        "Referência inválida; nenhum bootstrap foi carregado. Solicite uma referência nova ao host LOCAL."
                    }
            }.apply {
                isEnabled = false
                filterTouchesWhenObscured = true
            }
        layout.addView(loadButton)
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
                    loadButton.isEnabled = !s.isNullOrBlank()
                }

                override fun afterTextChanged(s: Editable?) = Unit
            },
        )
        setContentView(screen.root)
    }

    override fun onStop() {
        // If the operator leaves this screen before submitting, do not retain credential text in a
        // stopped Activity instance or task snapshot.
        referenceView?.text?.clear()
        super.onStop()
    }

    override fun onDestroy() {
        referenceView?.text?.clear()
        referenceView = null
        super.onDestroy()
    }
}
