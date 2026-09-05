package ai.aurora.device.wake

import android.Manifest
import android.app.Activity
import android.app.role.RoleManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Explicit user-driven setup surface for microphone permission, local enrollment, privacy and the
 * Android assistant role. None of these controls grant Aurora business/action authority.
 */
class WakeSetupActivity : Activity() {
    private lateinit var preferences: WakeRuntimePreferences
    private lateinit var modelStore: AuroraWakeModelStore
    private lateinit var statusStore: WakeRuntimeStatusStore
    private lateinit var statusView: TextView
    private var enrollment: AuroraWakeEnrollmentRecorder? = null
    private val enrollmentSamples = mutableListOf<WakeFeatureVector>()
    private var enrollmentStartAttempts = 0
    private var wakeRearmAttempts = 0
    private val enrollmentStartRunnable = Runnable(::startEnrollmentWhenAudioIdle)
    private val wakeRearmRunnable = Runnable(::rearmWakeWhenAudioIdle)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        preferences = WakeRuntimePreferences(this)
        modelStore = AuroraWakeModelStore(this)
        statusStore = WakeRuntimeStatusStore(this)

        val layout =
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(48, 48, 48, 48)
                layoutParams =
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
            }
        statusView = TextView(this).apply { textSize = 18f }
        layout.addView(statusView)
        layout.addView(button("Conceder permissão do microfone") { requestMicrophonePermission() })
        layout.addView(button("Treinar \"Aurora\" (3 amostras)") { beginEnrollment() })
        layout.addView(button("Definir Aurora como assistente") { requestAssistantRole() })
        layout.addView(button("Ativar wake word") { enableWake() })
        layout.addView(button("Desativar wake word") { disableWake() })
        layout.addView(
            button("Alternar modo de privacidade") {
                preferences.setPrivacyModeEnabled(!preferences.privacyModeEnabled())
                if (preferences.privacyModeEnabled()) {
                    stopService(Intent(this, AuroraWakeForegroundService::class.java))
                }
                refresh()
            },
        )
        setContentView(layout)
        refresh()
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    override fun onDestroy() {
        if (::statusView.isInitialized) {
            statusView.removeCallbacks(enrollmentStartRunnable)
            statusView.removeCallbacks(wakeRearmRunnable)
        }
        enrollment?.close()
        enrollment = null
        super.onDestroy()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_MICROPHONE) refresh()
    }

    private fun beginEnrollment() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestMicrophonePermission()
            return
        }
        disableWakeServiceOnly()
        enrollment?.close()
        enrollment = null
        enrollmentSamples.clear()
        enrollmentStartAttempts = 0
        startEnrollmentWhenAudioIdle()
    }

    private fun startEnrollmentWhenAudioIdle() {
        if (isFinishing || isDestroyed) return
        val owners = AuroraAudioRuntime.arbiter.snapshot().owners
        if (owners.isEmpty()) {
            enrollment = AuroraWakeEnrollmentRecorder(this)
            captureNextEnrollmentSample()
            return
        }
        if (enrollmentStartAttempts >= MAX_ENROLLMENT_START_ATTEMPTS) {
            statusStore.update(
                "ENROLLMENT_AUDIO_BUSY",
                lastError = "audio ownership did not release before bounded enrollment timeout",
            )
            scheduleWakeRearmIfEnabled()
            refresh()
            return
        }
        enrollmentStartAttempts += 1
        statusView.text = "Aguardando liberação segura do áudio para treinamento"
        statusView.postDelayed(enrollmentStartRunnable, AUDIO_TRANSITION_RETRY_MS)
    }

    private fun captureNextEnrollmentSample() {
        statusView.text = "Diga Aurora — amostra ${enrollmentSamples.size + 1} de $ENROLLMENT_SAMPLES"
        enrollment?.capture(
            onState = { state -> statusView.text = "$state — ${enrollmentSamples.size + 1}/$ENROLLMENT_SAMPLES" },
            onSuccess = { vector ->
                enrollmentSamples += vector
                if (enrollmentSamples.size >= ENROLLMENT_SAMPLES) {
                    val model =
                        AuroraWakeTemplateModel(
                            modelVersion = MODEL_VERSION,
                            templates = enrollmentSamples.toList(),
                        )
                    modelStore.save(model)
                    statusStore.update("ENROLLMENT_READY", model.modelVersion)
                    enrollment?.close()
                    enrollment = null
                    scheduleWakeRearmIfEnabled()
                    refresh()
                } else {
                    statusView.postDelayed(::captureNextEnrollmentSample, 600L)
                }
            },
            onError = { message ->
                statusStore.update("ENROLLMENT_FAILED", lastError = message)
                enrollment?.close()
                enrollment = null
                scheduleWakeRearmIfEnabled()
                refresh()
            },
        )
    }

    private fun enableWake() {
        if (preferences.privacyModeEnabled()) {
            statusStore.update("WAKE_PRIVACY_BLOCKED")
            refresh()
            return
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestMicrophonePermission()
            return
        }
        if (!modelStore.hasValidModel()) {
            statusStore.update("USER_SETUP_REQUIRED")
            refresh()
            return
        }
        preferences.setWakeEnabled(true)
        scheduleWakeRearmIfEnabled()
        refresh()
    }

    private fun disableWake() {
        preferences.setWakeEnabled(false)
        statusView.removeCallbacks(wakeRearmRunnable)
        wakeRearmAttempts = 0
        disableWakeServiceOnly()
        statusStore.update("DISABLED")
        refresh()
    }

    private fun disableWakeServiceOnly() {
        // The service/engine owns the HOTWORD lease. Stopping the service is asynchronous, so this
        // Activity must never erase that lease before AudioRecord has actually been released.
        stopService(Intent(this, AuroraWakeForegroundService::class.java))
    }

    private fun scheduleWakeRearmIfEnabled() {
        statusView.removeCallbacks(wakeRearmRunnable)
        wakeRearmAttempts = 0
        statusView.post(wakeRearmRunnable)
    }

    private fun rearmWakeWhenAudioIdle() {
        if (isFinishing || isDestroyed) return
        if (!preferences.wakeEnabled() || preferences.privacyModeEnabled()) return
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return
        if (!modelStore.hasValidModel()) return

        if (AuroraAudioRuntime.arbiter.snapshot().owners.isNotEmpty()) {
            if (wakeRearmAttempts >= MAX_WAKE_REARM_ATTEMPTS) {
                statusStore.update(
                    "WAKE_PLATFORM_BLOCKED",
                    lastError = "audio ownership did not release before bounded wake re-arm timeout",
                )
                refresh()
                return
            }
            wakeRearmAttempts += 1
            statusView.postDelayed(wakeRearmRunnable, AUDIO_TRANSITION_RETRY_MS)
            return
        }

        runCatching {
            startForegroundService(
                Intent(this, AuroraWakeForegroundService::class.java).setAction(
                    AuroraWakeForegroundService.ACTION_ARM,
                ),
            )
        }.onFailure { failure ->
            statusStore.update(
                "WAKE_PLATFORM_BLOCKED",
                lastError = "wake start failed: ${failure.javaClass.simpleName}",
            )
        }
    }

    private fun requestMicrophonePermission() {
        requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_MICROPHONE)
    }

    private fun requestAssistantRole() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roles = getSystemService(RoleManager::class.java)
            if (roles.isRoleAvailable(RoleManager.ROLE_ASSISTANT) && !roles.isRoleHeld(RoleManager.ROLE_ASSISTANT)) {
                startActivityForResult(
                    roles.createRequestRoleIntent(RoleManager.ROLE_ASSISTANT),
                    REQUEST_ASSISTANT_ROLE,
                )
            }
        } else {
            runCatching { startActivity(Intent(Settings.ACTION_VOICE_INPUT_SETTINGS)) }
        }
    }

    private fun refresh() {
        if (!::statusView.isInitialized) return
        val runtime = statusStore.snapshot()
        val permissionGranted =
            checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val assistant =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val roles = getSystemService(RoleManager::class.java)
                roles.isRoleAvailable(RoleManager.ROLE_ASSISTANT) && roles.isRoleHeld(RoleManager.ROLE_ASSISTANT)
            } else {
                false
            }
        statusView.text =
            buildString {
                appendLine("Wake: ${if (preferences.wakeEnabled()) "ATIVO" else "DESATIVADO"}")
                appendLine("Privacidade: ${if (preferences.privacyModeEnabled()) "BLOQUEANDO" else "normal"}")
                appendLine("Microfone: ${if (permissionGranted) "concedido" else "não concedido"}")
                appendLine("Modelo local: ${if (modelStore.hasValidModel()) "pronto" else "não treinado"}")
                appendLine("Assistente padrão: ${if (assistant) "Aurora" else "não"}")
                appendLine("Runtime: ${runtime.state}")
                appendLine("Wakes confirmados: ${runtime.confirmedWakeCount}")
                appendLine("Rejeitados/ignorados: ${runtime.rejectedOrIgnoredCount}")
                runtime.lastError?.let { appendLine("Último erro: $it") }
                append("Esses estados são precondições/evidência local, nunca autoridade de ação.")
            }
    }

    private fun button(label: String, action: () -> Unit): Button =
        Button(this).apply {
            text = label
            setOnClickListener { action() }
        }

    companion object {
        private const val REQUEST_MICROPHONE = 1501
        private const val REQUEST_ASSISTANT_ROLE = 1502
        private const val ENROLLMENT_SAMPLES = 3
        private const val MODEL_VERSION = "aurora-wake-local-v1"
        private const val AUDIO_TRANSITION_RETRY_MS = 100L
        private const val MAX_ENROLLMENT_START_ATTEMPTS = 15
        private const val MAX_WAKE_REARM_ATTEMPTS = 15
    }
}
