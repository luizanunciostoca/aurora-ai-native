package ai.aurora.device

import android.Manifest
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.ViewModelProvider
import ai.aurora.device.permission.AndroidRuntimePermissionProbe
import ai.aurora.device.permission.PermissionConsentBroker
import ai.aurora.device.permission.PermissionPromptLauncher
import ai.aurora.device.permission.RuntimePermissionRequirement
import ai.aurora.device.permission.SharedPreferencesPermissionHistoryStore
import ai.aurora.device.voice.GovernedVoiceCatalogResult
import ai.aurora.device.voice.GovernedVoiceCommandCatalog
import ai.aurora.device.voice.VoiceFastPathContext
import ai.aurora.device.voice.W07VoiceAuthorityIngress
import ai.aurora.device.voice.W07VoiceAuthorityIngressResult
import ai.aurora.device.voice.WakeVoiceFastPathInputs
import ai.aurora.device.voice.WakeVoiceFastPathRouter
import ai.aurora.device.voice.WakeVoiceRoute
import ai.aurora.device.wake.AuroraWakeForegroundService
import ai.aurora.device.wake.AuroraWakeModelStore
import ai.aurora.device.wake.WakeCandidate
import ai.aurora.device.wake.WakeInteractionBridge
import ai.aurora.device.wake.WakeSetupActivity
import ai.aurora.ui.AuroraRoot
import ai.aurora.ui.AuroraRootViewModel
import ai.aurora.ui.PrivacyCapturePolicy
import ai.aurora.ui.VoiceCaptureController
import ai.aurora.ui.VoiceRecognitionConfig
import ai.aurora.ui.VoiceRecognitionResult
import ai.aurora.ui.VoiceSessionRegistry
import ai.aurora.ui.model.AuroraUiIntent

class MainActivity : FragmentActivity(), SharedPreferences.OnSharedPreferenceChangeListener, WakeInteractionBridge.Receiver {
    private lateinit var uiPreferences: SharedPreferences
    private lateinit var rootViewModel: AuroraRootViewModel
    private lateinit var wakeVoiceController: VoiceCaptureController
    private lateinit var wakeFastPathRouter: WakeVoiceFastPathRouter
    private lateinit var governedVoiceCatalog: GovernedVoiceCommandCatalog
    private var lastHandledWakeId: String? = null

    private val microphonePermissionBroker by lazy {
        PermissionConsentBroker(
            probe = AndroidRuntimePermissionProbe(this),
            historyStore = SharedPreferencesPermissionHistoryStore(applicationContext),
            // This broker instance is observation-only. Wake setup owns user-visible prompting.
            promptLauncher = PermissionPromptLauncher { _ -> Unit },
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        uiPreferences = getSharedPreferences(UI_PREFERENCES_NAME, MODE_PRIVATE)
        uiPreferences.registerOnSharedPreferenceChangeListener(this)
        rootViewModel = ViewModelProvider(this)[AuroraRootViewModel::class.java]

        val aurora = application as AuroraApplication
        governedVoiceCatalog =
            GovernedVoiceCommandCatalog(
                projectionProvider = { aurora.voiceProjectionStore().current() },
            )
        wakeFastPathRouter =
            WakeVoiceFastPathRouter(
                inputProvider = { currentWakeFastPathInputs() },
                // No mobile W07 ingress is composed in this prototype yet. Candidate submission
                // therefore fails closed to Conversation instead of bypassing current authority.
                authorityIngress = W07VoiceAuthorityIngress {
                    W07VoiceAuthorityIngressResult.Unavailable("mobile W07 ingress not composed")
                },
            )

        wakeVoiceController = VoiceCaptureController(
            context = this,
            onListening = { rootViewModel.onIntent(AuroraUiIntent.VoiceListening) },
            onPartial = { rootViewModel.onIntent(AuroraUiIntent.VoicePartial(it)) },
            onResult = { transcript ->
                // Detailed results own normal wake follow-up routing. This callback remains for
                // lifecycle/privacy clearing and compatibility with VoiceCaptureController.
                if (transcript.isNotBlank()) {
                    rootViewModel.onIntent(AuroraUiIntent.VoiceResult(transcript))
                    scheduleWakeRearm()
                }
            },
            onError = { message ->
                rootViewModel.onIntent(AuroraUiIntent.VoiceError(message))
                scheduleWakeRearm()
            },
            onDetailedResult = { result ->
                handleWakeVoiceResult(result)
                scheduleWakeRearm()
            },
        )
        applyPrivacyCapturePolicy()
        setContent {
            AuroraRoot(viewModel = rootViewModel)
        }
        handleWakeIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleWakeIntent(intent)
    }

    override fun onStart() {
        super.onStart()
        WakeInteractionBridge.register(this)
    }

    override fun onResume() {
        super.onResume()
        applyPrivacyCapturePolicy()
        maybeArmConfiguredWakeWord()
    }

    override fun onStop() {
        WakeInteractionBridge.unregister(this)
        VoiceSessionRegistry.stopAllForBackground()
        super.onStop()
    }

    override fun onDestroy() {
        uiPreferences.unregisterOnSharedPreferenceChangeListener(this)
        wakeVoiceController.close()
        super.onDestroy()
    }

    override fun onWake(candidate: WakeCandidate) {
        runOnUiThread {
            startBoundedWakeFollowup(candidate.candidateId, candidate.confidence)
        }
    }

    override fun onSharedPreferenceChanged(sharedPreferences: SharedPreferences?, key: String?) {
        when (key) {
            KEY_PRIVACY_MODE -> {
                applyPrivacyCapturePolicy()
                if (uiPreferences.getBoolean(KEY_PRIVACY_MODE, false)) {
                    VoiceSessionRegistry.stopAllForPrivacy()
                    AuroraWakeForegroundService.disarm(this)
                } else {
                    maybeArmConfiguredWakeWord()
                }
            }
            KEY_WAKE_PREFERENCE -> {
                if (!uiPreferences.getBoolean(KEY_WAKE_PREFERENCE, false)) {
                    AuroraWakeForegroundService.disarm(this)
                } else if (AuroraWakeModelStore(this).hasValidModel()) {
                    maybeArmConfiguredWakeWord()
                } else {
                    startActivity(Intent(this, WakeSetupActivity::class.java))
                }
            }
        }
    }

    private fun handleWakeIntent(intent: Intent?) {
        val wakeId = intent?.getStringExtra(EXTRA_WAKE_SESSION_ID) ?: return
        val confidence = intent.getDoubleExtra(EXTRA_WAKE_CONFIDENCE, 0.0)
        startBoundedWakeFollowup(wakeId, confidence)
    }

    private fun startBoundedWakeFollowup(wakeId: String, confidence: Double) {
        if (wakeId == lastHandledWakeId) return
        lastHandledWakeId = wakeId
        if (uiPreferences.getBoolean(KEY_PRIVACY_MODE, false)) {
            rootViewModel.onIntent(AuroraUiIntent.VoiceError("Privacy Mode bloqueou a interação iniciada por wake word."))
            scheduleWakeRearm()
            return
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            rootViewModel.onIntent(AuroraUiIntent.VoiceError("A permissão de microfone foi revogada após o wake word."))
            AuroraWakeForegroundService.disarm(this)
            return
        }
        rootViewModel.onIntent(AuroraUiIntent.StartVoice)
        wakeVoiceController.start(
            VoiceRecognitionConfig(
                languageTag = uiPreferences.getString(KEY_VOICE_LANGUAGE, "pt-BR") ?: "pt-BR",
                preferOffline = uiPreferences.getBoolean(KEY_OFFLINE_RECOGNITION, true),
            ),
        )
        // Confidence is acoustic wake evidence only; deliberately unused for authority/action
        // dispatch. W15-G receives only recognizer transcript confidence from the bounded STT result.
        @Suppress("UNUSED_VARIABLE")
        val nonAuthorityWakeConfidence = confidence
    }

    private fun handleWakeVoiceResult(result: VoiceRecognitionResult) {
        when (val route = wakeFastPathRouter.route(result.transcript, result.confidence)) {
            is WakeVoiceRoute.ConversationFallback -> {
                Log.i(TAG, "wake_voice_fast_path=${route.reason.name}")
                rootViewModel.onIntent(AuroraUiIntent.VoiceResult(result.transcript))
            }
            is WakeVoiceRoute.AuthoritySubmitted -> {
                // This branch remains non-executable. Submission only hands a candidate to the
                // current-authority path; W07/W15-F still own every execution-time gate.
                Log.i(TAG, "wake_voice_fast_path=AUTHORITY_SUBMITTED")
                rootViewModel.onIntent(AuroraUiIntent.VoicePartial("Solicitação enviada para validação de autoridade."))
            }
        }
    }

    private fun currentWakeFastPathInputs(): WakeVoiceFastPathInputs {
        val catalogResult = governedVoiceCatalog.snapshot()
        return when (catalogResult) {
            is GovernedVoiceCatalogResult.Ready -> {
                val snapshot = catalogResult.snapshot
                WakeVoiceFastPathInputs(
                    commands = snapshot.commands,
                    context = currentWakeFastPathContext(snapshot.availableCapabilityIds),
                    registryVersion = snapshot.registryVersion,
                    vocabularyVersion = snapshot.vocabularyVersion,
                )
            }
            is GovernedVoiceCatalogResult.Rejected -> {
                Log.i(TAG, "wake_voice_catalog=${catalogResult.reason.name}")
                WakeVoiceFastPathInputs(
                    commands = emptyList(),
                    context = currentWakeFastPathContext(emptySet()),
                )
            }
        }
    }

    private fun currentWakeFastPathContext(
        availableCapabilityIds: Set<String>,
    ): VoiceFastPathContext {
        val aurora = application as AuroraApplication
        return VoiceFastPathContext(
            appVisibility = aurora.presenceSnapshot().visibility,
            microphonePermission = microphonePermissionBroker.observe(MICROPHONE_REQUIREMENT),
            availableCapabilityIds = availableCapabilityIds,
            privacyModeEnabled = uiPreferences.getBoolean(KEY_PRIVACY_MODE, false),
        )
    }

    private fun scheduleWakeRearm() {
        if (!uiPreferences.getBoolean(KEY_WAKE_PREFERENCE, false)) return
        if (uiPreferences.getBoolean(KEY_PRIVACY_MODE, false)) return
        window.decorView.postDelayed(
            { maybeArmConfiguredWakeWord() },
            WAKE_REARM_DELAY_MS,
        )
    }

    private fun maybeArmConfiguredWakeWord() {
        if (!uiPreferences.getBoolean(KEY_WAKE_PREFERENCE, false)) return
        if (uiPreferences.getBoolean(KEY_PRIVACY_MODE, false)) return
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return
        if (!AuroraWakeModelStore(this).hasValidModel()) return
        runCatching { AuroraWakeForegroundService.armFromVisibleContext(this) }
    }

    private fun applyPrivacyCapturePolicy() {
        val privacyMode = uiPreferences.getBoolean(KEY_PRIVACY_MODE, false)
        if (PrivacyCapturePolicy.shouldBlockScreenCapture(privacyMode)) {
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    companion object {
        const val EXTRA_WAKE_SESSION_ID = "ai.aurora.extra.WAKE_SESSION_ID"
        const val EXTRA_WAKE_CONFIDENCE = "ai.aurora.extra.WAKE_CONFIDENCE"

        private const val TAG = "AuroraWakeVoice"
        private const val UI_PREFERENCES_NAME = "aurora.ui.v1"
        private const val KEY_PRIVACY_MODE = "privacy_mode"
        private const val KEY_WAKE_PREFERENCE = "wake_preference"
        private const val KEY_VOICE_LANGUAGE = "voice_language"
        private const val KEY_OFFLINE_RECOGNITION = "offline_recognition"
        private const val WAKE_REARM_DELAY_MS = 2_000L
        private val MICROPHONE_REQUIREMENT = RuntimePermissionRequirement(Manifest.permission.RECORD_AUDIO)
    }
}
