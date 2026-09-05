package ai.aurora.device

import android.Manifest
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.ViewModelProvider
import ai.aurora.device.wake.AuroraVoiceInteractionService
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
import ai.aurora.ui.VoiceSessionRegistry
import ai.aurora.ui.model.AuroraUiIntent

class MainActivity : FragmentActivity(), SharedPreferences.OnSharedPreferenceChangeListener, WakeInteractionBridge.Receiver {
    private lateinit var uiPreferences: SharedPreferences
    private lateinit var rootViewModel: AuroraRootViewModel
    private lateinit var wakeVoiceController: VoiceCaptureController
    private var lastHandledWakeId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        uiPreferences = getSharedPreferences(UI_PREFERENCES_NAME, MODE_PRIVATE)
        uiPreferences.registerOnSharedPreferenceChangeListener(this)
        rootViewModel = ViewModelProvider(this)[AuroraRootViewModel::class.java]
        wakeVoiceController = VoiceCaptureController(
            context = this,
            onListening = { rootViewModel.onIntent(AuroraUiIntent.VoiceListening) },
            onPartial = { rootViewModel.onIntent(AuroraUiIntent.VoicePartial(it)) },
            onResult = { transcript ->
                rootViewModel.onIntent(AuroraUiIntent.VoiceResult(transcript))
                scheduleWakeRearm()
            },
            onError = { message ->
                rootViewModel.onIntent(AuroraUiIntent.VoiceError(message))
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
        // Confidence is acoustic wake evidence only; deliberately unused for authority or action dispatch.
        @Suppress("UNUSED_VARIABLE")
        val nonAuthorityWakeConfidence = confidence
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

        private const val UI_PREFERENCES_NAME = "aurora.ui.v1"
        private const val KEY_PRIVACY_MODE = "privacy_mode"
        private const val KEY_WAKE_PREFERENCE = "wake_preference"
        private const val KEY_VOICE_LANGUAGE = "voice_language"
        private const val KEY_OFFLINE_RECOGNITION = "offline_recognition"
        private const val WAKE_REARM_DELAY_MS = 2_000L
    }
}
