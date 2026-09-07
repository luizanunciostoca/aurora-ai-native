package ai.aurora.device.wake

import android.Manifest
import android.app.Activity
import android.app.role.RoleManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import ai.aurora.device.ui.AuroraActivityUi

/**
 * Explicit user-driven setup surface for microphone permission, local enrollment, privacy and the
 * Android assistant role. None of these controls grant Aurora business/action authority.
 */
class WakeSetupActivity : Activity() {
    private lateinit var preferences: WakeRuntimePreferences
    private lateinit var modelStore: AuroraWakeModelStore
    private lateinit var statusStore: WakeRuntimeStatusStore
    private lateinit var statusView: TextView
    private lateinit var guidanceView: TextView
    private lateinit var microphoneButton: Button
    private lateinit var enrollmentButton: Button
    private lateinit var assistantButton: Button
    private lateinit var enableButton: Button
    private lateinit var disableButton: Button
    private lateinit var privacyButton: Button
    private var enrollment: AuroraWakeEnrollmentRecorder? = null
    private val enrollmentSamples = mutableListOf<WakeFeatureVector>()
    private var enrollmentRetryPending = false
    private var enrollmentStartAttempts = 0
    private var wakeRearmAttempts = 0
    private val enrollmentStartRunnable = Runnable(::startEnrollmentWhenAudioIdle)
    private val wakeRearmRunnable = Runnable(::rearmWakeWhenAudioIdle)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        preferences = WakeRuntimePreferences(this)
        modelStore = AuroraWakeModelStore(this)
        statusStore = WakeRuntimeStatusStore(this)

        val screen = AuroraActivityUi.createScrollableScreen(this)
        val layout = screen.content
        layout.addView(AuroraActivityUi.heading(this, "Voz e wake word"))
        layout.addView(
            AuroraActivityUi.body(
                this,
                "Configure o detector local “Aurora”. O wake inicia uma interação; ele nunca concede autoridade de ação.",
                centered = true,
            ),
        )
        statusView = AuroraActivityUi.body(this)
        guidanceView = AuroraActivityUi.body(this)
        layout.addView(statusView)
        layout.addView(guidanceView)

        microphoneButton =
            AuroraActivityUi.actionButton(this, "Conceder permissão do microfone") {
                requestMicrophonePermissionOrSettings()
            }
        enrollmentButton =
            AuroraActivityUi.actionButton(this, "Treinar “Aurora” (3 amostras)") {
                beginOrResumeEnrollment()
            }
        assistantButton =
            AuroraActivityUi.actionButton(this, "Definir Aurora como assistente padrão") {
                requestAssistantRole()
            }
        enableButton =
            AuroraActivityUi.actionButton(this, "Ativar wake word") {
                enableWake()
            }
        disableButton =
            AuroraActivityUi.actionButton(this, "Desativar wake word") {
                disableWake()
            }
        privacyButton =
            AuroraActivityUi.actionButton(this, "Ativar modo de privacidade") {
                togglePrivacyMode()
            }

        layout.addView(microphoneButton)
        layout.addView(enrollmentButton)
        layout.addView(assistantButton)
        layout.addView(enableButton)
        layout.addView(disableButton)
        layout.addView(privacyButton)
        setContentView(screen.root)
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
        enrollmentSamples.clear()
        enrollmentRetryPending = false
        super.onDestroy()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_MICROPHONE) return
        val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            statusStore.update(
                "WAKE_PERMISSION_BLOCKED",
                lastError = "microphone permission denied by user",
            )
        }
        refresh()
    }

    private fun beginOrResumeEnrollment() {
        if (preferences.privacyModeEnabled()) {
            statusStore.update(
                "ENROLLMENT_PRIVACY_BLOCKED",
                lastError = "privacy mode blocks microphone enrollment",
            )
            refresh()
            return
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestMicrophonePermissionOrSettings()
            return
        }

        disableWakeServiceOnly()
        enrollment?.close()
        enrollment = null
        if (!enrollmentRetryPending) enrollmentSamples.clear()
        enrollmentRetryPending = false
        enrollmentStartAttempts = 0
        statusStore.update("ENROLLMENT_STARTING", modelStore.load()?.modelVersion)
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
            enrollmentRetryPending = true
            statusStore.update(
                "ENROLLMENT_AUDIO_BUSY",
                modelStore.load()?.modelVersion,
                lastError = "audio ownership did not release before bounded enrollment timeout",
            )
            scheduleWakeRearmIfEnabled()
            refresh()
            return
        }
        enrollmentStartAttempts += 1
        statusView.text = "Aguardando o microfone ser liberado com segurança…"
        guidanceView.text = "O detector anterior está sendo encerrado antes do treinamento."
        statusView.postDelayed(enrollmentStartRunnable, AUDIO_TRANSITION_RETRY_MS)
    }

    private fun captureNextEnrollmentSample() {
        val sampleNumber = enrollmentSamples.size + 1
        statusView.text = "Treinamento — amostra $sampleNumber de $ENROLLMENT_SAMPLES"
        guidanceView.text = "Quando aparecer “Pode falar”, diga apenas “Aurora” em tom normal."
        enrollment?.capture(
            onState = { state ->
                if (state == "SAY_AURORA") {
                    statusView.text = "Pode falar — “Aurora” ($sampleNumber/$ENROLLMENT_SAMPLES)"
                } else {
                    statusView.text = "$state — $sampleNumber/$ENROLLMENT_SAMPLES"
                }
            },
            onSuccess = { vector ->
                enrollmentSamples += vector
                enrollmentRetryPending = false
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
                    statusStore.update("ENROLLMENT_CAPTURING", modelStore.load()?.modelVersion)
                    statusView.text = "Amostra ${enrollmentSamples.size} de $ENROLLMENT_SAMPLES aceita"
                    guidanceView.text = "Prepare-se para a próxima amostra."
                    statusView.postDelayed(::captureNextEnrollmentSample, NEXT_SAMPLE_DELAY_MS)
                }
            },
            onError = { message ->
                val recoverable = WakeSetupUiPolicy.isRecoverableEnrollmentError(message)
                enrollment?.close()
                enrollment = null
                enrollmentRetryPending = recoverable
                if (!recoverable) enrollmentSamples.clear()
                statusStore.update(
                    if (recoverable) "ENROLLMENT_RETRY_REQUIRED" else "ENROLLMENT_FAILED",
                    modelStore.load()?.modelVersion,
                    lastError = message,
                )
                // A failed re-training attempt must not delete or disable a previously valid model.
                // If wake was enabled before training, safely re-arm that previous model while the
                // user decides whether to repeat the rejected sample.
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
            requestMicrophonePermissionOrSettings()
            return
        }
        val model = modelStore.load()
        if (model == null) {
            statusStore.update("USER_SETUP_REQUIRED")
            refresh()
            return
        }
        preferences.setWakeEnabled(true)
        statusStore.update("INITIALIZING", model.modelVersion)
        scheduleWakeRearmIfEnabled()
        refresh()
    }

    private fun disableWake() {
        preferences.setWakeEnabled(false)
        statusView.removeCallbacks(wakeRearmRunnable)
        wakeRearmAttempts = 0
        disableWakeServiceOnly()
        statusStore.update("DISABLED", modelStore.load()?.modelVersion)
        refresh()
    }

    private fun togglePrivacyMode() {
        val enabled = !preferences.privacyModeEnabled()
        preferences.setPrivacyModeEnabled(enabled)
        if (enabled) {
            enrollment?.close()
            enrollment = null
            enrollmentSamples.clear()
            enrollmentRetryPending = false
            disableWakeServiceOnly()
            statusStore.update("WAKE_PRIVACY_BLOCKED", modelStore.load()?.modelVersion)
        } else if (preferences.wakeEnabled() && modelStore.hasValidModel()) {
            statusStore.update("INITIALIZING", modelStore.load()?.modelVersion)
            scheduleWakeRearmIfEnabled()
        } else {
            statusStore.update("DISABLED", modelStore.load()?.modelVersion)
        }
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
                    modelStore.load()?.modelVersion,
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
                modelStore.load()?.modelVersion,
                lastError = "wake start failed: ${failure.javaClass.simpleName}",
            )
            refresh()
        }
    }

    private fun requestMicrophonePermissionOrSettings() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            refresh()
            return
        }
        val previouslyDenied = statusStore.snapshot().state == "WAKE_PERMISSION_BLOCKED"
        if (previouslyDenied && !shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO)) {
            runCatching {
                startActivity(
                    Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:$packageName"),
                    ),
                )
            }
            return
        }
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
        val roleAvailable: Boolean
        val assistantSelected: Boolean
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roles = getSystemService(RoleManager::class.java)
            roleAvailable = roles.isRoleAvailable(RoleManager.ROLE_ASSISTANT)
            assistantSelected = roleAvailable && roles.isRoleHeld(RoleManager.ROLE_ASSISTANT)
        } else {
            roleAvailable = true
            assistantSelected = false
        }
        val modelReady = modelStore.hasValidModel()
        val ui =
            WakeSetupUiPolicy.present(
                WakeSetupUiInput(
                    microphoneGranted = permissionGranted,
                    modelReady = modelReady,
                    assistantRoleAvailable = roleAvailable,
                    assistantSelected = assistantSelected,
                    wakeEnabled = preferences.wakeEnabled(),
                    privacyModeEnabled = preferences.privacyModeEnabled(),
                    runtimeState = runtime.state,
                    runtimeError = runtime.lastError,
                    enrollmentRetryPending = enrollmentRetryPending,
                    acceptedEnrollmentSamples = enrollmentSamples.size,
                ),
            )

        statusView.text =
            buildString {
                appendLine("Wake word: ${if (preferences.wakeEnabled()) "ativado" else "desativado"}")
                appendLine("Privacidade: ${if (preferences.privacyModeEnabled()) "ativa" else "normal"}")
                appendLine("Microfone: ${if (permissionGranted) "concedido" else "não concedido"}")
                appendLine("Modelo local: ${if (modelReady) "pronto" else "não treinado"}")
                appendLine("Assistente padrão: ${if (assistantSelected) "Aurora" else "não"}")
                appendLine("Runtime: ${ui.runtimeLabel}")
                appendLine("Wakes confirmados: ${runtime.confirmedWakeCount}")
                append("Rejeitados/ignorados: ${runtime.rejectedOrIgnoredCount}")
                ui.errorLabel?.let { append("\nAtenção: $it") }
            }
        guidanceView.text = ui.guidance

        val permanentlyDenied =
            !permissionGranted &&
                runtime.state == "WAKE_PERMISSION_BLOCKED" &&
                !shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO)
        microphoneButton.text =
            if (permanentlyDenied) "Abrir configurações do microfone" else ui.microphoneButtonLabel
        microphoneButton.isEnabled = ui.canRequestMicrophone
        enrollmentButton.text = ui.enrollmentButtonLabel
        enrollmentButton.isEnabled = ui.canTrain
        assistantButton.text = ui.assistantButtonLabel
        assistantButton.isEnabled = ui.canRequestAssistantRole
        enableButton.text = if (preferences.wakeEnabled()) "Wake word já ativo" else "Ativar wake word"
        enableButton.isEnabled = ui.canEnableWake
        disableButton.isEnabled = ui.canDisableWake
        privacyButton.text = ui.privacyButtonLabel
    }

    companion object {
        private const val REQUEST_MICROPHONE = 1501
        private const val REQUEST_ASSISTANT_ROLE = 1502
        private const val ENROLLMENT_SAMPLES = 3
        private const val MODEL_VERSION = "aurora-wake-local-v1"
        private const val AUDIO_TRANSITION_RETRY_MS = 100L
        private const val NEXT_SAMPLE_DELAY_MS = 900L
        private const val MAX_ENROLLMENT_START_ATTEMPTS = 30
        private const val MAX_WAKE_REARM_ATTEMPTS = 30
    }
}
