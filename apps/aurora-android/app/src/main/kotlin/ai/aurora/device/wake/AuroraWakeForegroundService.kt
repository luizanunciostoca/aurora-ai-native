package ai.aurora.device.wake

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import ai.aurora.device.AuroraApplication
import ai.aurora.device.lifecycle.AppVisibility

/** Microphone foreground service for the explicitly enabled local always-listening wake detector. */
class AuroraWakeForegroundService : Service() {
    private lateinit var preferences: WakeRuntimePreferences
    private lateinit var statusStore: WakeRuntimeStatusStore
    private lateinit var modelStore: AuroraWakeModelStore
    private var engine: AudioRecordAuroraWakeEngine? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onCreate() {
        super.onCreate()
        preferences = WakeRuntimePreferences(this)
        statusStore = WakeRuntimeStatusStore(this)
        modelStore = AuroraWakeModelStore(this)
        ensureNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action ?: ACTION_ARM) {
            ACTION_DISARM -> disarm()
            ACTION_ARM -> arm()
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        engine?.close()
        engine = null
        super.onDestroy()
    }

    private fun arm() {
        engine?.close()
        engine = null
        if (!preferences.wakeEnabled()) return stopWithState("DISABLED")
        if (preferences.privacyModeEnabled()) return stopWithState("WAKE_PRIVACY_BLOCKED")
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            return stopWithState("WAKE_PERMISSION_BLOCKED")
        }
        val model = modelStore.load() ?: return stopWithState("USER_SETUP_REQUIRED")

        startForeground(NOTIFICATION_ID, buildNotification("Aurora escutando localmente"))
        val config =
            WakeConfig(
                confidenceThreshold = WakeSensitivityPolicy.confidenceThreshold(preferences.sensitivity()),
            )
        val localEngine =
            AudioRecordAuroraWakeEngine(
                context = this,
                model = model,
                config = config,
                privacyBlocked = preferences::privacyModeEnabled,
                playbackState = WakePlaybackAwareness::snapshot,
                onState = { state -> statusStore.update(state.name, model.modelVersion) },
                onConfirmed = { candidate -> onWakeConfirmed(candidate) },
                onRejectedOrIgnored = statusStore::incrementRejectedOrIgnored,
                onError = { message ->
                    statusStore.update("WAKE_ENGINE_ERROR", model.modelVersion, message)
                    mainHandler.post { stopSelf() }
                },
            )
        engine = localEngine
        if (!localEngine.start()) stopSelf()
    }

    private fun onWakeConfirmed(candidate: WakeCandidate) {
        statusStore.incrementConfirmed()
        statusStore.update("HOTWORD_CONFIRMED")
        engine = null // engine stops itself after confirmation and releases the microphone lease.
        mainHandler.post {
            stopForeground(STOP_FOREGROUND_REMOVE)
            val assistantHandoff = AuroraVoiceInteractionService.requestWakeSession(candidate)
            if (assistantHandoff) {
                statusStore.update("WAKE_ASSISTANT_HANDOFF")
                stopSelf()
                return@post
            }

            val app = application as AuroraApplication
            if (app.presenceSnapshot().visibility == AppVisibility.FOREGROUND) {
                runCatching {
                    startActivity(
                        Intent(this, WakeVoiceActivity::class.java).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                            putExtra(WakeVoiceActivity.EXTRA_WAKE_ID, candidate.candidateId)
                            putExtra(WakeVoiceActivity.EXTRA_WAKE_CONFIDENCE, candidate.confidence)
                        },
                    )
                }.onSuccess {
                    statusStore.update("WAKE_FOREGROUND_HANDOFF")
                    stopSelf()
                }.onFailure { failure ->
                    recoverAfterBlockedHandoff(failure.javaClass.simpleName)
                }
            } else {
                statusStore.update(
                    "ASSISTANT_ROLE_REQUIRED",
                    lastError = "background wake requires Aurora to be configured as assistant",
                )
                mainHandler.postDelayed(::arm, HANDOFF_RECOVERY_MS)
            }
        }
    }

    private fun recoverAfterBlockedHandoff(reason: String) {
        statusStore.update(
            "WAKE_PLATFORM_BLOCKED",
            lastError = "wake handoff failed: $reason",
        )
        mainHandler.postDelayed(::arm, HANDOFF_RECOVERY_MS)
    }

    private fun disarm() {
        preferences.setWakeEnabled(false)
        engine?.close()
        engine = null
        stopWithState("DISABLED")
    }

    private fun stopWithState(state: String) {
        statusStore.update(state)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun ensureNotificationChannel() {
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Aurora wake word",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Indicador do detector local de wake word"
                setShowBadge(false)
            },
        )
    }

    private fun buildNotification(text: String): Notification =
        Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("Aurora")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()

    companion object {
        const val ACTION_ARM = "ai.aurora.action.ARM_WAKE"
        const val ACTION_DISARM = "ai.aurora.action.DISARM_WAKE"
        private const val CHANNEL_ID = "aurora-wake-v1"
        private const val NOTIFICATION_ID = 15001
        private const val HANDOFF_RECOVERY_MS = 1_800L
    }
}
