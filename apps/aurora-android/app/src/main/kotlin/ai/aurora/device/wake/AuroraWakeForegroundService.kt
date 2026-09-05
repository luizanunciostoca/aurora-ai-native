package ai.aurora.device.wake

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import ai.aurora.device.MainActivity

class AuroraWakeForegroundService : Service(), SharedPreferences.OnSharedPreferenceChangeListener {
    private lateinit var uiPreferences: SharedPreferences
    private lateinit var statusStore: WakeRuntimeStatusStore
    private lateinit var modelStore: AuroraWakeModelStore
    private var engine: AudioRecordAuroraWakeEngine? = null
    private var lastWakeCandidate: WakeCandidate? = null

    override fun onCreate() {
        super.onCreate()
        uiPreferences = getSharedPreferences(UI_PREFERENCES, Context.MODE_PRIVATE)
        statusStore = WakeRuntimeStatusStore(this)
        modelStore = AuroraWakeModelStore(this)
        uiPreferences.registerOnSharedPreferenceChangeListener(this)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action ?: ACTION_ARM) {
            ACTION_ARM, ACTION_REARM -> armIfAllowed()
            ACTION_DISARM -> disarmAndStop("DISABLED")
            ACTION_START_BOUNDED_FOLLOWUP -> {
                val candidate = lastWakeCandidate
                if (candidate != null && WakeInteractionBridge.dispatch(candidate)) {
                    statusStore.update("AWAKEN")
                }
            }
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onSharedPreferenceChanged(sharedPreferences: SharedPreferences?, key: String?) {
        when {
            key == KEY_PRIVACY_MODE && uiPreferences.getBoolean(KEY_PRIVACY_MODE, false) ->
                disarmAndStop("WAKE_PRIVACY_BLOCKED")
            key == KEY_WAKE_PREFERENCE && !uiPreferences.getBoolean(KEY_WAKE_PREFERENCE, false) ->
                disarmAndStop("DISABLED")
            key == KEY_WAKE_SENSITIVITY && engine != null -> {
                engine?.close()
                engine = null
                armIfAllowed()
            }
        }
    }

    override fun onDestroy() {
        uiPreferences.unregisterOnSharedPreferenceChangeListener(this)
        engine?.close()
        engine = null
        super.onDestroy()
    }

    private fun armIfAllowed() {
        if (!uiPreferences.getBoolean(KEY_WAKE_PREFERENCE, false)) {
            disarmAndStop("DISABLED")
            return
        }
        if (uiPreferences.getBoolean(KEY_PRIVACY_MODE, false)) {
            disarmAndStop("WAKE_PRIVACY_BLOCKED")
            return
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            disarmAndStop("WAKE_PERMISSION_BLOCKED")
            return
        }
        val model = modelStore.load()
        if (model == null) {
            disarmAndStop("USER_SETUP_REQUIRED")
            return
        }
        if (engine != null) return

        val sensitivity = uiPreferences
            .getFloat(KEY_WAKE_SENSITIVITY, WakeSensitivityPolicy.DEFAULT_SENSITIVITY)
            .coerceIn(0.0f, 1.0f)
        val wakeConfig = WakeConfig(
            confidenceThreshold = WakeSensitivityPolicy.confidenceThreshold(sensitivity),
        )

        statusStore.update(
            state = "INITIALIZING",
            modelVersion = model.modelVersion,
            lastError = null,
        )
        startForegroundCompat(buildListeningNotification("Aurora está pronta para ouvir “Aurora”."))
        val newEngine = AudioRecordAuroraWakeEngine(
            context = this,
            model = model,
            config = wakeConfig,
            privacyBlocked = { uiPreferences.getBoolean(KEY_PRIVACY_MODE, false) },
            playbackState = WakePlaybackAwareness::snapshot,
            onState = { state ->
                statusStore.update(state.name, modelVersion = model.modelVersion)
            },
            onConfirmed = { candidate -> handleConfirmedWake(candidate, model.modelVersion) },
            onRejectedOrIgnored = statusStore::incrementRejectedOrIgnored,
            onError = { message ->
                statusStore.update("WAKE_ERROR", modelVersion = model.modelVersion, lastError = message)
                updateNotification("Wake word indisponível. Abra a Aurora para diagnóstico.", null)
            },
        )
        engine = newEngine
        if (!newEngine.start()) {
            engine = null
            updateNotification("Wake word requer atenção. Abra a Aurora.", null)
        } else {
            statusStore.update("WAKE_LISTENING", modelVersion = model.modelVersion)
        }
    }

    private fun handleConfirmedWake(candidate: WakeCandidate, modelVersion: String) {
        engine?.close()
        engine = null
        lastWakeCandidate = candidate
        statusStore.incrementConfirmed()
        statusStore.update("HOTWORD_CONFIRMED", modelVersion = modelVersion)

        val handedToAssistant = AuroraVoiceInteractionService.isConfiguredAsAssistant(this) &&
            AuroraVoiceInteractionService.requestWakeSession(candidate)
        if (handedToAssistant) {
            statusStore.update("AWAKEN", modelVersion = modelVersion)
            updateNotification("Aurora despertou. Ouvindo sua próxima frase…", null)
            return
        }

        if (WakeInteractionBridge.dispatch(candidate)) {
            statusStore.update("AWAKEN", modelVersion = modelVersion)
            updateNotification("Aurora despertou. Ouvindo sua próxima frase…", null)
            return
        }

        statusStore.update("WAKE_PLATFORM_BLOCKED", modelVersion = modelVersion)
        updateNotification(
            "Ouvi “Aurora”. Toque para continuar — o assistente Android ainda não está ativo.",
            candidate,
        )
    }

    private fun disarmAndStop(state: String) {
        engine?.close()
        engine = null
        lastWakeCandidate = null
        statusStore.update(state)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun createNotificationChannel() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Aurora Wake Word",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Mostra quando o detector local de “Aurora” está armado."
                setSound(null, null)
                enableVibration(false)
            },
        )
    }

    private fun startForegroundCompat(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            @Suppress("DEPRECATION")
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotification(text: String, candidate: WakeCandidate?) {
        getSystemService(NotificationManager::class.java)
            .notify(NOTIFICATION_ID, buildListeningNotification(text, candidate))
    }

    private fun buildListeningNotification(text: String, candidate: WakeCandidate? = null): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            if (candidate != null) {
                putExtra(MainActivity.EXTRA_WAKE_SESSION_ID, candidate.candidateId)
                putExtra(MainActivity.EXTRA_WAKE_CONFIDENCE, candidate.confidence)
            }
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            candidate?.candidateId?.hashCode() ?: 0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("Aurora · Wake Word")
            .setContentText(text)
            .setOngoing(candidate == null)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setContentIntent(pendingIntent)
            .build()
    }

    companion object {
        private const val UI_PREFERENCES = "aurora.ui.v1"
        private const val KEY_WAKE_PREFERENCE = "wake_preference"
        private const val KEY_PRIVACY_MODE = "privacy_mode"
        const val KEY_WAKE_SENSITIVITY = "wake_sensitivity"
        private const val CHANNEL_ID = "aurora_wake_word"
        private const val NOTIFICATION_ID = 16021

        const val ACTION_ARM = "ai.aurora.action.WAKE_ARM"
        const val ACTION_REARM = "ai.aurora.action.WAKE_REARM"
        const val ACTION_DISARM = "ai.aurora.action.WAKE_DISARM"
        const val ACTION_START_BOUNDED_FOLLOWUP = "ai.aurora.action.WAKE_FOLLOWUP"

        /** Must only be called from a user-visible or otherwise platform-allowed context. */
        fun armFromVisibleContext(context: Context) {
            context.startForegroundService(
                Intent(context, AuroraWakeForegroundService::class.java).setAction(ACTION_ARM),
            )
        }

        fun rearm(context: Context) {
            context.startService(
                Intent(context, AuroraWakeForegroundService::class.java).setAction(ACTION_REARM),
            )
        }

        fun disarm(context: Context) {
            context.stopService(Intent(context, AuroraWakeForegroundService::class.java))
            WakeRuntimeStatusStore(context).update("DISABLED")
        }
    }
}
