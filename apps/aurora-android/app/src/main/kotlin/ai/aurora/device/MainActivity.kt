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
import ai.aurora.device.ui.AuroraActionRefreshPolicy
import ai.aurora.device.ui.AuroraActionSetKey
import ai.aurora.device.ui.AuroraAssistantStage
import ai.aurora.device.ui.AuroraAssistantSurface
import ai.aurora.device.ui.AuroraDeveloperModePreferences
import ai.aurora.device.ui.AuroraOnboardingInput
import ai.aurora.device.ui.AuroraOnboardingPolicy
import ai.aurora.device.ui.AuroraOnboardingProgressPolicy
import ai.aurora.device.ui.AuroraOnboardingStep
import ai.aurora.device.ui.AuroraSystemStatusInput
import ai.aurora.device.ui.AuroraSystemStatusPolicy
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
    private var wakeRuntimeRefreshAttempts = 0
    private var lastActionSetKey: AuroraActionSetKey? = null
    private val wakeRuntimeRefreshRunnable =
        Runnable {
            if (::surface.isInitialized && !isFinishing && !isDestroyed) {
                wakeRuntimeRefreshAttempts += 1
                renderStatus()
            }
        }

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
            wakeRuntimeRefreshAttempts = 0
            renderStatus()
            renderInvocation(intent)
        }
    }

    override fun onResume() {
        super.onResume()
        wakeRuntimeRefreshAttempts = 0
        if (::surface.isInitialized) {
            surface.root.removeCallbacks(wakeRuntimeRefreshRunnable)
            surface.root.post {
                renderStatus()
                renderInvocation(intent)
            }
        }
    }

    override fun onPause() {
        if (::surface.isInitialized) {
            surface.root.removeCallbacks(wakeRuntimeRefreshRunnable)
        }
        super.onPause()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_MICROPHONE) return
        val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
        if (granted) microphonePermissionHistory.clear()
        assistantFeedback =
            if (granted) {
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
        // Some OEM role sheets return without changing the role or may immediately cancel. The
        // user's original tap was an explicit request to configure the assistant, so continue to a
        // public Android settings surface instead of leaving the button looking unresponsive.
        handleAssistantLaunch(
            AuroraAssistantRoleCoordinator.continueSelectionAfterRoleResult(this),
        )
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
        if (microphoneGranted && ::microphonePermissionHistory.isInitialized) {
            // A previous denial must not permanently suppress Android's permission dialog after a
            // later grant (including one-time grants that may subsequently expire).
            microphonePermissionHistory.clear()
        }
        val assistant = AuroraAssistantRoleCoordinator.snapshot(this)
        val wakeRuntimeReady = AuroraOnboardingPolicy.isWakeRuntimeReady(runtime.state)
        val onboarding =
            AuroraOnboardingPolicy.present(
                AuroraOnboardingInput(
                    microphoneGranted = microphoneGranted,
                    assistantSelected = assistant.selected,
                    wakeModelReady = modelReady,
                    wakeEnabled = wakeEnabled,
                    privacyModeEnabled = privacyEnabled,
                    wakeRuntimeReady = wakeRuntimeReady,
                ),
            )
        val setupProgress = AuroraOnboardingProgressPolicy.resolve(onboarding.step)
        val runtimeLabel =
            WakeSetupUiPolicy.runtimeLabel(
                state = runtime.state,
                modelReady = modelReady,
                wakeEnabled = wakeEnabled,
            )
        val errorLabel = WakeSetupUiPolicy.userFacingError(runtime.lastError)
        val ready = onboarding.step == AuroraOnboardingStep.READY
        val wakeOperational = wakeEnabled && modelReady && !privacyEnabled && wakeRuntimeReady

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

        surface.setSystemStatus(
            AuroraSystemStatusPolicy.items(
                AuroraSystemStatusInput(
                    setupProgress = setupProgress,
                    microphoneGranted = microphoneGranted,
                    assistantSelected = assistant.selected,
                    wakeOperational = wakeOperational,
                    privacyEnabled = privacyEnabled,
                ),
            ),
        )
        surface.setStatusLine(
            buildString {
                if (!setupProgress.showTrack) append(onboarding.progressLabel)
                assistantFeedback?.let {
                    if (isNotEmpty()) append('\n')
                    append(it)
                }
                if (!developerMode.enabled()) {
                    errorLabel?.let {
                        if (isNotEmpty()) append('\n')
                        append(it)
                    }
                }
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
        scheduleWakeRuntimeRefresh(onboarding.step)
    }

    private fun scheduleWakeRuntimeRefresh(step: AuroraOnboardingStep) {
        surface.root.removeCallbacks(wakeRuntimeRefreshRunnable)
        if (
            step == AuroraOnboardingStep.WAKE_RUNTIME &&
            wakeRuntimeRefreshAttempts < MAX_WAKE_RUNTIME_REFRESH_ATTEMPTS
        ) {
            surface.root.postDelayed(wakeRuntimeRefreshRunnable, WAKE_RUNTIME_REFRESH_MS)
        } else if (step != AuroraOnboardingStep.WAKE_RUNTIME) {
            wakeRuntimeRefreshAttempts = 0
        }
    }

    private fun rebuildActions(
        step: AuroraOnboardingStep,
        primaryLabel: String,
        assistantSelected: Boolean,
        microphoneGranted: Boolean,
        privacyEnabled: Boolean,
    ) {
        val developerModeEnabled = developerMode.enabled()
        val showDeveloperToggle = aurora.environmentConfig.environment == AuroraEnvironment.LOCAL
        val showLocalRuntime =
            developerModeEnabled &&
                showDeveloperToggle &&
                aurora.environmentConfig.allowCleartextTraffic
        val nextActionSetKey =
            AuroraActionSetKey(
                step = step,
                primaryLabel = primaryLabel,
                assistantSelected = assistantSelected,
                microphoneGranted = microphoneGranted,
                privacyEnabled = privacyEnabled,
                developerModeEnabled = developerModeEnabled,
                showLocalRuntime = showLocalRuntime,
                showDeveloperToggle = showDeveloperToggle,
            )
        if (!AuroraActionRefreshPolicy.shouldRebuild(lastActionSetKey, nextActionSetKey)) return

        val focusSnapshot = surface.captureActionFocus()
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
            surface.addSecondaryAction("Falar sem wake word", ACTION_VOICE_WITHOUT_WAKE) { openVoiceSession() }
        }

        if (!assistantSelected && step != AuroraOnboardingStep.ASSISTANT_ROLE) {
            surface.addSecondaryAction("Definir Aurora como assistente", ACTION_ASSISTANT_ROLE) {
                handleAssistantLaunch(
                    AuroraAssistantRoleCoordinator.requestSelection(this, REQUEST_ASSISTANT_ROLE),
                )
            }
        }

        surface.addSecondaryAction("Voz, wake word e privacidade", ACTION_WAKE_SETTINGS) {
            openWakeSetup()
        }

        if (showLocalRuntime) {
            surface.addSecondaryAction("Conectar runtime LOCAL", ACTION_LOCAL_RUNTIME) {
                startActivity(Intent(this, GatewayBootstrapSetupActivity::class.java))
            }
        }

        if (showDeveloperToggle) {
            surface.addSecondaryAction(
                if (developerModeEnabled) "Ocultar modo desenvolvedor" else "Modo desenvolvedor",
                ACTION_DEVELOPER_MODE,
            ) {
                developerMode.setEnabled(!developerMode.enabled())
                renderStatus()
            }
        }

        lastActionSetKey = nextActionSetKey
        surface.restoreActionFocus(focusSnapshot)
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
        // This is an explicit in-app user action, not a system-assistant invocation. Wake/system
        // entry points add their own provenance when they create WakeVoiceActivity.
        startActivity(Intent(this, WakeVoiceActivity::class.java))
    }

    private fun handleAssistantLaunch(result: AuroraAssistantSelectionLaunch) {
        assistantFeedback = AuroraAssistantRoleCoordinator.userGuidance(result)
        renderStatus()
    }

    companion object {
        const val EXTRA_OPENED_FROM_VOICE = "ai.aurora.extra.OPENED_FROM_VOICE"
        const val EXTRA_LAST_TRANSCRIPT = "ai.aurora.extra.LAST_TRANSCRIPT"
        const val EXTRA_LAST_RESPONSE = "ai.aurora.extra.LAST_RESPONSE"
        private const val REQUEST_ASSISTANT_ROLE = 1401
        private const val REQUEST_MICROPHONE = 1402
        private const val WAKE_RUNTIME_REFRESH_MS = 500L
        private const val MAX_WAKE_RUNTIME_REFRESH_ATTEMPTS = 12
        private const val ACTION_VOICE_WITHOUT_WAKE = "voice-without-wake"
        private const val ACTION_ASSISTANT_ROLE = "assistant-role"
        private const val ACTION_WAKE_SETTINGS = "wake-settings"
        private const val ACTION_LOCAL_RUNTIME = "local-runtime"
        private const val ACTION_DEVELOPER_MODE = "developer-mode"
    }
}