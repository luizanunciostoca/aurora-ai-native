package ai.aurora.device

import android.content.SharedPreferences
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.fragment.app.FragmentActivity
import ai.aurora.ui.AuroraRoot
import ai.aurora.ui.PrivacyCapturePolicy
import ai.aurora.ui.VoiceSessionRegistry

class MainActivity : FragmentActivity(), SharedPreferences.OnSharedPreferenceChangeListener {
    private lateinit var uiPreferences: SharedPreferences

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        uiPreferences = getSharedPreferences(UI_PREFERENCES_NAME, MODE_PRIVATE)
        uiPreferences.registerOnSharedPreferenceChangeListener(this)
        applyPrivacyCapturePolicy()
        setContent {
            AuroraRoot()
        }
    }

    override fun onResume() {
        super.onResume()
        applyPrivacyCapturePolicy()
    }

    override fun onStop() {
        VoiceSessionRegistry.stopAllForBackground()
        super.onStop()
    }

    override fun onDestroy() {
        uiPreferences.unregisterOnSharedPreferenceChangeListener(this)
        super.onDestroy()
    }

    override fun onSharedPreferenceChanged(sharedPreferences: SharedPreferences?, key: String?) {
        if (key != KEY_PRIVACY_MODE) return
        applyPrivacyCapturePolicy()
        if (uiPreferences.getBoolean(KEY_PRIVACY_MODE, false)) {
            VoiceSessionRegistry.stopAllForPrivacy()
        }
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
        private const val UI_PREFERENCES_NAME = "aurora.ui.v1"
        private const val KEY_PRIVACY_MODE = "privacy_mode"
    }
}
