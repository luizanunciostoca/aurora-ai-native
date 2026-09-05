package ai.aurora.device.bootstrap

import android.app.Activity
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import ai.aurora.device.AuroraApplication
import ai.aurora.device.config.AuroraEnvironment

/**
 * LOCAL physical-acceptance helper only. The reference is copied directly into process memory and
 * the text field is cleared immediately. It is never written to preferences, files, logs, evidence
 * or BuildConfig and carries no tenant/actor/action authority.
 */
class GatewayBootstrapSetupActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as AuroraApplication
        val layout =
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(48, 48, 48, 48)
                layoutParams =
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
            }
        val status =
            TextView(this).apply {
                gravity = Gravity.CENTER
                textSize = 18f
            }
        layout.addView(status)

        if (
            app.environmentConfig.environment != AuroraEnvironment.LOCAL ||
            !app.environmentConfig.allowCleartextTraffic
        ) {
            status.text = "Bootstrap local indisponível fora do ambiente LOCAL controlado."
            setContentView(layout)
            return
        }

        val reference =
            EditText(this).apply {
                hint = "Referência bootstrap temporária"
                inputType =
                    InputType.TYPE_CLASS_TEXT or
                        InputType.TYPE_TEXT_VARIATION_PASSWORD or
                        InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
                isSingleLine = true
                importantForAutofill = IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
            }
        layout.addView(reference)
        layout.addView(
            Button(this).apply {
                text = "Carregar bootstrap temporário"
                setOnClickListener {
                    val candidate = reference.text?.toString().orEmpty()
                    reference.text?.clear()
                    val installed = app.localGatewayBootstrapRuntime().installReference(candidate)
                    status.text =
                        if (installed) {
                            "Bootstrap temporário carregado somente em memória."
                        } else {
                            "Referência inválida; nenhum bootstrap foi carregado."
                        }
                }
            },
        )
        setContentView(layout)
    }
}
