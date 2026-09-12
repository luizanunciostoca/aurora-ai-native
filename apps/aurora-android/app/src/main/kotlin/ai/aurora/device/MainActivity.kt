package ai.aurora.device

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import ai.aurora.device.bootstrap.GatewayBootstrapSetupActivity
import ai.aurora.device.config.AuroraEnvironment
import ai.aurora.device.ui.AuroraAssistantStage
import ai.aurora.device.ui.AuroraAssistantSurface
import ai.aurora.device.ui.AuroraDeveloperModePreferences
import ai.aurora.device.ui.AuroraOnboardingInput
import ai.aurora.device.ui.AuroraOnboardingPolicy
import ai.aurora.device.ui.AuroraOnboardingStep
import ai.aurora.device.wake.AuroraAssistantRoleCoordinator
import ai.aurora.device.wake.AuroraAssistantSelectionLaunch
import ai.aurora.device.wake.AuroraWakeModelStore
import ai.aurora.device.wake.MicrophonePermissionAction
import ai.aurora.device.wake.MicrophonePermissionFlow
import ai.aurora.device.wake.MicrophonePermissionRequestHistory
import ai.aurora.device.wake.WakeRuntimePreferences
import ai.aurora.device.wake.WakeRuntimeStatusStore
import ai.aurora.device.wake.WakeSetupActivity
import ai.aurora.device.wake.WakeSetupOnboardingAction
import ai.aurora.device.wake.WakeSetupOnboardingActionCodec
import ai.aurora.device.wake.WakeSetupUiPolicy
import ai.aurora.device.wake.WakeVoiceActivity

class MainActivity : Activity() {
    private lateinit var aurora: AuroraApplication
    private lateinit var surface: AuroraAssistantSurface
    private lateinit var developerMode: AuroraDeveloperModePreferences
    private lateinit var microphonePermissionHistory: MicrophonePermissionRequestHistory
    private var assistantFeedback: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        aurora = application as AuroraApplication
        developerMode = AuroraDeveloperModePreferences(this)
        microphonePermissionHistory = MicrophonePermissionRequestHistory(this)
        surface = AuroraAssistantSurface.create(this)
        setContentView(surface.root)
        renderStatus()
        renderInvocation(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (::surface.isInitialized) {
            renderStatus()
            renderInvocation(intent)
        }
    }

    override fun onResume() {
        super.onResume()
        if (::surface.isInitialized) {
            surface.root.post {
                renderStatus()
                renderInvocation(intent)
            }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_MICROPHONE) return
        assistantFeedback =
            if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
                "Microfone autorizado. Podemos continuar a configuração."
            } else {
                "O microfone ainda não está autorizado."
            }
        renderStatus()
    }

    @Deprecated("RoleManager still returns its user-consent result through the Activity result API")
    override fun onActivityResult(
        requestCode: Int,
        resultCode: Int,
        data: Intent?,
    ) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_ASSISTANT_ROLE) return
        val selected = AuroraAssistantRoleCoordinator.snapshot(this).selected
        assistantFeedback =
            if (selected) {
                "Aurora foi selecionada como assistente padrão."
            } else {
                "Aurora ainda não foi selecionada como assistente padrão."
            }
        renderStatus()
    }

    private fun renderInvocation(currentIntent: Intent?) {
        val transcript = currentIntent?.getStringExtra(EXTRA_LAST_TRANSCRIPT)?.takeIf { it.isNotBlank() }
        val response = currentIntent?.getStringExtra(EXTRA_LAST_RESPONSE)?.takeIf { it.isNotBlank() }
        val fromVoice = currentIntent?.getBooleanExtra(EXTRA_OPENED_FROM_VOICE, false) == true
        val fromSystemAssist = currentIntent?.action == Intent.ACTION_ASSIST

        when {
            transcript != null || response != null -> surface.showConversation(transcript, response)
            fromVoice -> surface.showConversation(null, "Sessão de voz concluída. Estou pronta para continuar.")
            fromSystemAssist -> surface.showConversation(null, "Aurora aberta pelo atalho de assistente do Android.")
            else -> surface.showConversation(null, null)
        }
    }

    private fun renderStatus() {
        val presence = aurora.presenceSnapshot()
        val runtime = WakeRuntimeStatusStore(this).snapshot()
        val preferences = WakeRuntimePreferences(this)
        val wakeEnabled = preferences.wakeEnabled()
        val privacyEnabled = preferences.privacyModeEnabled()
        val modelReady = AuroraWakeModelStore(this).hasValidModel()
        val microphoneGranted =
            checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val assistant = AuroraAssistantRoleCoordinator.snapshot(this)
        val onboarding =
            AuroraOnboardingPolicy.present(
                AuroraOnboardingInput(
                    microphoneGranted = microphoneGranted,
                    assistantSelected = assistant.selected,
                    wakeModelReady = modelReady,
                    wakeEnabled = wakeEnabled,
                    privacyModeEnabled = privacyEnabled,
                    wakeRuntimeReady = AuroraOnboardingPolicy.isWakeRuntimeReady(runtime.state),
                ),
            )
        val runtimeLabel =
            WakeSetupUiPolicy.runtimeLabel(
                state = runtime.state,
                modelReady = modelReady,
                wakeEnabled = wakeEnabled,
            )
        val errorLabel = WakeSetupUiPolicy.userFacingError(runtime.lastError)
        val ready = onboarding.step == AuroraOnboardingStep.READY

        surface.render(
            stage =
                when {
                    ready -> AuroraAssistantStage.READY
                    privacyEnabled -> AuroraAssistantStage.BLOCKED
                    else -> AuroraAssistantStage.DEGRADED
                },
            titleOverride = onboarding.title,
            detailOverride = onboarding.detail,
        )

        surface.setStatusLine(
            buildString {
                append(onboarding.progressLabel)
                append("  •  Microfone ")
                append(if (microphoneGranted) "autorizado" else "pendente")
                append("  •  Wake ")
                append(if (wakeEnabled && modelReady && !privacyEnabled && AuroraOnboardingPolicy.isWakeRuntimeReady(runtime.state)) "ativo" else "inativo")
                append("  •  Privacidade ")
                append(if (privacyEnabled) "ativa" else "normal")
                assistantFeedback?.let { append("\n$it") }
                if (!developerMode.enabled()) errorLabel?.let { append("\n$it") }
            },
        )

        surface.setDiagnostics(
            buildString {
                appendLine("DEVELOPER MODE")
                appendLine("App ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
                appendLine("Android SHA: ${BuildConfig.AURORA_ANDROID_SHA}")
                appendLine("Host SHA: ${BuildConfig.AURORA_HOST_SHA}")
                appendLine("Release tuple: ${BuildConfig.AURORA_RELEASE_TUPLE_ID}")
                appendLine("Environment: ${aurora.environmentConfig.environment.name}")
                appendLine("Gateway: ${aurora.environmentConfig.gatewayOrigin}")
                appendLine("Presence: ${presence.visibility.name}")
                appendLine("Assistant role: ${if (assistant.selected) "selected" else "not-selected"}")
                appendLine("Wake: ${if (wakeEnabled) "enabled" else "disabled"}")
                appendLine("Wake model: ${if (modelReady) "ready" else "missing"}")
                appendLine("Wake runtime: $runtimeLabel")
                appendLine("Confirmed wakes: ${runtime.confirmedWakeCount}")
                append("Rejected/ignored: ${runtime.rejectedOrIgnoredCount}")
                errorLabel?.let { append("\nLast sanitized error: $it") }
            },
        )
        surface.setDiagnosticsVisible(developerMode.enabled())

        rebuildActions(
            step = onboarding.step,
            primaryLabel = onboarding.primaryActionLabel,
            assistantSelected = assistant.selected,
            microphoneGranted = microphoneGranted,
            privacyEnabled = privacyEnabled,
        )
    }

    private fun rebuildActions(
        step: AuroraOnboardingStep,
        primaryLabel: String,
        assistantSelected: Boolean,
        microphoneGranted: Boolean,
        privacyEnabled: Boolean,
    ) {
        surface.clearActions()
        surface.addPrimaryAction(primaryLabel) {
            when (step) {
                AuroraOnboardingStep.READY -> openVoiceSession()
                AuroraOnboardingStep.MICROPHONE -> requestMicrophonePermissionOrSettings()
                AuroraOnboardingStep.ASSISTANT_ROLE ->
                    handleAssistantLaunch(
                        AuroraAssistantRoleCoordinator.requestSelection(this, REQUEST_ASSISTANT_ROLE),
                    )
                AuroraOnboardingStep.WAKE_MODEL ->
                    openWakeSetup(WakeSetupOnboardingAction.TRAIN_WAKE)
                AuroraOnboardingStep.WAKE_ENABLE,
                AuroraOnboardingStep.WAKE_RUNTIME,
                -> openWakeSetup(WakeSetupOnboardingAction.ENABLE_WAKE)
                AuroraOnboardingStep.PRIVACY_BLOCKED ->
                    openWakeSetup(WakeSetupOnboardingAction.REVIEW_PRIVACY)
            }
        }

        if (step != AuroraOnboardingStep.READY && microphoneGranted && !privacyEnabled) {
            surface.addSecondaryAction("Falar sem wake word") { openVoiceSession() }
        }

        if (!assistantSelected && step != AuroraOnboardingStep.ASSISTANT_ROLE) {
            surface.addSecondaryAction("Definir Aurora como assistente") {
                handleAssistantLaunch(
                    AuroraAssistantRoleCoordinator.requestSelection(this, REQUEST_ASSISTANT_ROLE),
                )
            }
        }

        surface.addSecondaryAction("Voz, wake word e privacidade") {
            openWakeSetup()
        }

        if (
            developerMode.enabled() &&
            aurora.environmentConfig.environment == AuroraEnvironment.LOCAL &&
            aurora.environmentConfig.allowCleartextTraffic
        ) {
            surface.addSecondaryAction("Conectar runtime LOCAL") {
                startActivity(Intent(this, GatewayBootstrapSetupActivity::class.java))
            }
        }

        if (aurora.environmentConfig.environment == AuroraEnvironment.LOCAL) {
            surface.addSecondaryAction(
                if (developerMode.enabled()) "Ocultar modo desenvolvedor" else "Modo desenvolvedor",
            ) {
                developerMode.setEnabled(!developerMode.enabled())
                renderStatus()
            }
        }
    }

    private fun openWakeSetup(action: WakeSetupOnboardingAction? = null) {
        val intent = Intent(this, WakeSetupActivity::class.java)
        action?.let {
            intent.putExtra(
                WakeSetupOnboardingActionCodec.EXTRA_ONBOARDING_ACTION,
                WakeSetupOnboardingActionCodec.encode(it),
            )
        }
        startActivity(intent)
    }

    private fun requestMicrophonePermissionOrSettings() {
        val granted =
            checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val rationale =
            !granted && shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO)
        when (
            MicrophonePermissionFlow.nextAction(
                granted = granted,
                requestAttempted = microphonePermissionHistory.attempted(),
                shouldShowRationale = rationale,
            )
        ) {
            MicrophonePermissionAction.NONE -> renderStatus()
            MicrophonePermissionAction.REQUEST -> {
                microphonePermissionHistory.markAttempted()
                requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_MICROPHONE)
            }
            MicrophonePermissionAction.OPEN_SETTINGS ->
                runCatching {
                    startActivity(
                        Intent(
                            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.parse("package:$packageName"),
                        ),
                    )
                }.onFailure {
                    assistantFeedback = "Abra as configurações do aplicativo para autorizar o microfone."
                    renderStatus()
                }
        }
    }

    private fun openVoiceSession() {
        startActivity(
            Intent(this, WakeVoiceActivity::class.java).apply {
                putExtra(WakeVoiceActivity.EXTRA_SYSTEM_ASSIST_INVOCATION, true)
            },
        )
    }

    private fun handleAssistantLaunch(result: AuroraAssistantSelectionLaunch) {
        assistantFeedback =
            when (result) {
                AuroraAssistantSelectionLaunch.ALREADY_SELECTED ->
                    "Aurora já é o assistente padrão deste dispositivo."
                AuroraAssistantSelectionLaunch.ROLE_REQUEST ->
                    "Confirme Aurora na tela de seleção do Android."
                AuroraAssistantSelectionLaunch.DEFAULT_APPS_SETTINGS,
                AuroraAssistantSelectionLaunch.VOICE_INPUT_SETTINGS,
                AuroraAssistantSelectionLaunch.GENERAL_SETTINGS,
                -> "Selecione Aurora como assistente digital nas configurações do Android."
                AuroraAssistantSelectionLaunch.FAILED ->
                    "O Android não expôs a seleção automaticamente. Abra Apps padrão e escolha Aurora."
            }
        renderStatus()
    }

    companion object {
        const val EXTRA_OPENED_FROM_VOICE = "ai.aurora.extra.OPENED_FROM_VOICE"
        const val EXTRA_LAST_TRANSCRIPT = "ai.aurora.extra.LAST_TRANSCRIPT"
        const val EXTRA_LAST_RESPONSE = "ai.aurora.extra.LAST_RESPONSE"
        private const val REQUEST_ASSISTANT_ROLE = 1401
        private const val REQUEST_MICROPHONE = 1402
    }
}
