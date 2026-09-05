package ai.aurora.device.bootstrap

import android.app.Activity
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import ai.aurora.device.AuroraApplication
import ai.aurora.device.config.AuroraEnvironment
import ai.aurora.device.voice.GatewayVoiceRuntimeCompositionError
import ai.aurora.device.voice.GatewayVoiceRuntimeCompositionResult

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
                importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
            }
        layout.addView(reference)

        val action =
            Button(this).apply {
                text = "Conectar runtime governado"
            }
        action.setOnClickListener {
            val candidate = reference.text?.toString().orEmpty()
            reference.text?.clear()
            val installed = app.localGatewayBootstrapRuntime().installReference(candidate)
            if (!installed) {
                status.text = "Referência inválida; nenhum bootstrap foi carregado."
                return@setOnClickListener
            }

            // Socket/bootstrap exchange must never run on Android's main thread. The credential and
            // reference remain process-local; only a sanitized disposition returns to the UI.
            action.isEnabled = false
            status.text = "Compondo canal W14 autenticado e ingress W07 governado..."
            Thread(
                {
                    val result = app.composeLocalVoiceIngressFromPendingBootstrap()
                    runOnUiThread {
                        action.isEnabled = true
                        status.text = result.toOperatorMessage()
                    }
                },
                "aurora-w14-bootstrap-compose",
            ).start()
        }
        layout.addView(action)
        setContentView(layout)
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
