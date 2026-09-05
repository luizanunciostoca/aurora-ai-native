package ai.aurora.device.wake

import android.Manifest
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import ai.aurora.device.AuroraApplication
import ai.aurora.device.BuildConfig
import ai.aurora.device.offline.AndroidOfflineExecutionQueueStore
import ai.aurora.device.offline.OfflineQueueState
import ai.aurora.device.session.AndroidDeviceSessionMetadataStore
import ai.aurora.device.voice.GovernedVoiceCatalogResult
import ai.aurora.device.voice.GovernedVoiceCommandCatalog
import ai.aurora.ui.DeviceTrustDiagnostics

class WakeSetupActivity : FragmentActivity() {
    private lateinit var recorder: AuroraWakeEnrollmentRecorder
    private lateinit var modelStore: AuroraWakeModelStore
    private val templates = mutableListOf<WakeFeatureVector>()
    private var status by mutableStateOf("USER_SETUP_REQUIRED")
    private var detail by mutableStateOf("Treine o wake word local dizendo “Aurora” três vezes.")
    private var recording by mutableStateOf(false)
    private var sampleCount by mutableStateOf(0)
    private var assistantStatus by mutableStateOf("Verificando…")
    private var voiceGovernanceStatus by mutableStateOf("Verificando…")
    private var voiceGovernanceDetail by mutableStateOf("Reconciliando W04/W15-C/W15-G…")
    private var runtimeDiagnostics by mutableStateOf<List<String>>(emptyList())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        recorder = AuroraWakeEnrollmentRecorder(this)
        modelStore = AuroraWakeModelStore(this)
        refreshAssistantStatus()
        refreshVoiceGovernanceStatus()
        refreshRuntimeDiagnostics()
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    WakeSetupScreen()
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        refreshAssistantStatus()
        refreshVoiceGovernanceStatus()
        refreshRuntimeDiagnostics()
    }

    override fun onDestroy() {
        recorder.close()
        templates.clear()
        super.onDestroy()
    }

    @Composable
    private fun WakeSetupScreen() {
        val micPermissionLauncher = rememberLauncherForActivityResult(
            ActivityResultContracts.RequestPermission(),
        ) { granted ->
            if (granted) captureSample() else {
                status = "WAKE_PERMISSION_BLOCKED"
                detail = "Sem permissão de microfone, a Aurora não pode treinar nem armar o wake word."
            }
            refreshRuntimeDiagnostics()
        }
        val assistantRoleLauncher = rememberLauncherForActivityResult(
            ActivityResultContracts.StartActivityForResult(),
        ) {
            refreshAssistantStatus()
            refreshVoiceGovernanceStatus()
            refreshRuntimeDiagnostics()
        }

        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Ativar Aurora por voz", style = MaterialTheme.typography.headlineMedium)
            Text(
                "Quando ativado, diga “Aurora” para iniciar uma interação. A detecção do nome fica local no tablet; áudio bruto não é salvo nem enviado continuamente para a nuvem.",
            )
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Status: $status")
                    Text(detail)
                    Text("Amostras locais: $sampleCount / 3")
                    Text("Assistente Android: $assistantStatus")
                    Text("Engine: AudioRecord local · 16 kHz · modelo pt-BR por enrollment")
                    Text("Fast path governado: $voiceGovernanceStatus")
                    Text(voiceGovernanceDetail)
                }
            }

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Runtime real integrado", style = MaterialTheme.typography.titleMedium)
                    runtimeDiagnostics.forEach { line -> Text(line) }
                    Text(
                        "Estes estados são projeções/readbacks locais. Presence, session, capability e queue não são authority e não provam sucesso de side effect.",
                    )
                    OutlinedButton(onClick = {
                        refreshVoiceGovernanceStatus()
                        refreshRuntimeDiagnostics()
                    }) {
                        Text("Atualizar runtime real")
                    }
                }
            }

            Button(
                enabled = !recording && sampleCount < REQUIRED_SAMPLES,
                onClick = {
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        captureSample()
                    } else {
                        micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (recording) "Ouvindo…" else "Gravar amostra ${sampleCount + 1}")
            }

            OutlinedButton(
                onClick = {
                    templates.clear()
                    sampleCount = 0
                    status = "USER_SETUP_REQUIRED"
                    detail = "Amostras descartadas da memória. Grave três novas amostras de “Aurora”."
                },
                enabled = !recording,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Recomeçar treinamento") }

            OutlinedButton(
                onClick = {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        val manager = getSystemService(RoleManager::class.java)
                        if (manager.isRoleAvailable(RoleManager.ROLE_ASSISTANT) && !manager.isRoleHeld(RoleManager.ROLE_ASSISTANT)) {
                            assistantRoleLauncher.launch(manager.createRequestRoleIntent(RoleManager.ROLE_ASSISTANT))
                        } else {
                            refreshAssistantStatus()
                            refreshVoiceGovernanceStatus()
                            refreshRuntimeDiagnostics()
                        }
                    } else {
                        detail = "Nesta versão do Android, selecione a Aurora como assistente pelas configurações do sistema quando disponível."
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Tornar Aurora assistente do Android") }

            Spacer(Modifier.height(4.dp))
            Button(
                enabled = !recording && sampleCount >= REQUIRED_SAMPLES,
                onClick = ::activateWakeWord,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Salvar modelo local e ativar") }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = { finish() }) { Text("Fechar") }
                if (modelStore.hasValidModel()) {
                    OutlinedButton(
                        onClick = {
                            getSharedPreferences(UI_PREFERENCES, Context.MODE_PRIVATE)
                                .edit().putBoolean(KEY_WAKE_PREFERENCE, false).commit()
                            AuroraWakeForegroundService.disarm(this@WakeSetupActivity)
                            modelStore.clear()
                            status = "DISABLED"
                            detail = "Wake word desativado e enrollment local removido."
                            refreshVoiceGovernanceStatus()
                            refreshRuntimeDiagnostics()
                        },
                    ) { Text("Desativar e apagar modelo") }
                }
            }
        }
    }

    private fun captureSample() {
        if (recording) return
        if (getSharedPreferences(UI_PREFERENCES, Context.MODE_PRIVATE).getBoolean(KEY_PRIVACY_MODE, false)) {
            status = "WAKE_PRIVACY_BLOCKED"
            detail = "Desative o Privacy Mode antes de treinar o wake word."
            return
        }
        recording = true
        status = "INITIALIZING"
        detail = "Preparando captura local e temporária…"
        recorder.capture(
            onState = { message ->
                status = "UTTERANCE_LISTENING"
                detail = message
            },
            onSuccess = { vector ->
                templates += vector
                sampleCount = templates.size
                recording = false
                status = if (sampleCount >= REQUIRED_SAMPLES) "READY_TO_ARM" else "USER_SETUP_REQUIRED"
                detail = if (sampleCount >= REQUIRED_SAMPLES) {
                    "Treinamento local concluído. Você já pode salvar e ativar."
                } else {
                    "Amostra aceita. Grave mais ${REQUIRED_SAMPLES - sampleCount}."
                }
                refreshRuntimeDiagnostics()
            },
            onError = { message ->
                recording = false
                status = "DEGRADED"
                detail = message
                refreshRuntimeDiagnostics()
            },
        )
    }

    private fun activateWakeWord() {
        if (templates.size < REQUIRED_SAMPLES) return
        val privacy = getSharedPreferences(UI_PREFERENCES, Context.MODE_PRIVATE).getBoolean(KEY_PRIVACY_MODE, false)
        if (privacy) {
            status = "WAKE_PRIVACY_BLOCKED"
            detail = "Privacy Mode está ativo; o wake word não será armado."
            return
        }
        val model = AuroraWakeTemplateModel(
            modelVersion = MODEL_VERSION,
            templates = templates.toList(),
        )
        runCatching {
            modelStore.save(model)
            check(
                getSharedPreferences(UI_PREFERENCES, Context.MODE_PRIVATE)
                    .edit().putBoolean(KEY_WAKE_PREFERENCE, true).commit(),
            )
            WakeRuntimeStatusStore(this).update("WAKE_CONFIGURED", modelVersion = MODEL_VERSION)
            AuroraWakeForegroundService.armFromVisibleContext(this)
        }.onSuccess {
            templates.clear()
            sampleCount = REQUIRED_SAMPLES
            status = "WAKE_ARMED"
            detail = if (AuroraVoiceInteractionService.isConfiguredAsAssistant(this)) {
                "Wake word armado. A Aurora também está selecionada como assistente Android."
            } else {
                "Wake word armado. Para handoff global sem toque, selecione também a Aurora como assistente Android."
            }
            refreshVoiceGovernanceStatus()
            refreshRuntimeDiagnostics()
        }.onFailure { throwable ->
            status = "WAKE_ERROR"
            detail = "Não foi possível armar o wake word: ${throwable.javaClass.simpleName}"
            refreshRuntimeDiagnostics()
        }
    }

    private fun refreshAssistantStatus() {
        assistantStatus = when {
            AuroraVoiceInteractionService.isConfiguredAsAssistant(this) -> "ATIVO"
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> {
                val manager = getSystemService(RoleManager::class.java)
                when {
                    !manager.isRoleAvailable(RoleManager.ROLE_ASSISTANT) -> "PLATFORM_LIMITED"
                    manager.isRoleHeld(RoleManager.ROLE_ASSISTANT) -> "ROLE_HELD / aguardando serviço"
                    else -> "USER_SETUP_REQUIRED"
                }
            }
            else -> "CONFIGURAÇÃO PELO SISTEMA"
        }
    }

    private fun refreshVoiceGovernanceStatus() {
        val aurora = application as AuroraApplication
        when (
            val result =
                GovernedVoiceCommandCatalog(
                    projectionProvider = { aurora.voiceProjectionStore().current() },
                ).snapshot()
        ) {
            is GovernedVoiceCatalogResult.Ready -> {
                val snapshot = result.snapshot
                voiceGovernanceStatus =
                    "READY · W04 ${snapshot.registryVersion} · W15-G ${snapshot.vocabularyVersion}"
                voiceGovernanceDetail =
                    "Capabilities DEVICE atuais: ${snapshot.availableCapabilityIds.size}; comandos determinísticos: ${snapshot.commands.size}. W07 mobile ingress: NOT_COMPOSED. Este READY é somente readiness de roteamento e não concede authority."
            }
            is GovernedVoiceCatalogResult.Rejected -> {
                voiceGovernanceStatus = "FAIL_CLOSED · ${result.reason.name}"
                voiceGovernanceDetail =
                    "Sem projeção governada atual, nenhuma fala usa o fast path; a interação segue para Conversation. W07 mobile ingress: NOT_COMPOSED."
            }
        }
    }

    private fun refreshRuntimeDiagnostics() {
        val aurora = application as AuroraApplication
        val now = System.currentTimeMillis()
        val presence = aurora.presenceSnapshot()
        val session = runCatching { aurora.deviceSessionClient().sessionAvailability(now).name }
            .getOrElse { "UNREADABLE_FAIL_CLOSED" }
        val trust = runCatching {
            DeviceTrustDiagnostics.sanitize(
                AndroidDeviceSessionMetadataStore(this).load(),
                now,
            )
        }.getOrNull()
        val trustLines = if (trust == null) {
            listOf("W15-B/W14 trust metadata: UNREADABLE_FAIL_CLOSED")
        } else {
            listOf(
                "W15-B key metadata: ${trust.keyState} · generation=${trust.keyGeneration ?: "—"} · boundRegistration=${trust.boundRegistrationVersion ?: "—"}",
                "W14 registration metadata: ${trust.registrationState} · version=${trust.registrationVersion ?: "—"}",
                "W14 session metadata: ${trust.sessionState} · remaining=${trust.sessionRemainingSeconds?.let { "${it}s" } ?: "—"}",
            )
        }
        val offlineRecords = runCatching { AndroidOfflineExecutionQueueStore(this).loadAll() }
        val offlineSummary = offlineRecords.fold(
            onSuccess = { records ->
                val deferred = records.count { it.state == OfflineQueueState.DEFERRED }
                val reconcile = records.count { it.state == OfflineQueueState.RECONCILIATION_REQUIRED }
                val terminal = records.size - deferred - reconcile
                "W15-H queue: ${records.size} total · $deferred deferred · $reconcile reconcile · $terminal terminal/stale"
            },
            onFailure = { "W15-H queue: UNREADABLE_FAIL_CLOSED" },
        )
        val governed = GovernedVoiceCommandCatalog(
            projectionProvider = { aurora.voiceProjectionStore().current() },
            nowMs = { now },
        ).snapshot()
        val governedLine = when (governed) {
            is GovernedVoiceCatalogResult.Ready ->
                "W04/W15-G: READY · registry=${governed.snapshot.registryVersion} · vocabulary=${governed.snapshot.vocabularyVersion} · deviceCaps=${governed.snapshot.availableCapabilityIds.size}"
            is GovernedVoiceCatalogResult.Rejected ->
                "W04/W15-G: FAIL_CLOSED · ${governed.reason.name}"
        }
        runtimeDiagnostics = buildList {
            add("Build: ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE}) · ${BuildConfig.AURORA_BUILD_SHA.take(12)}")
            add("Environment: ${aurora.environmentConfig.environment.name}")
            add("Presence: ${presence.visibility.name} · processGeneration=${presence.processGeneration} · localService=${presence.localServicePhase.name}")
            add("W14 session availability: $session")
            addAll(trustLines)
            add(governedLine)
            add("W07 voice ingress: NOT_COMPOSED")
            add(offlineSummary)
        }
    }

    companion object {
        private const val UI_PREFERENCES = "aurora.ui.v1"
        private const val KEY_WAKE_PREFERENCE = "wake_preference"
        private const val KEY_PRIVACY_MODE = "privacy_mode"
        private const val REQUIRED_SAMPLES = 3
        private const val MODEL_VERSION = "aurora-template-pt-BR-v1"
    }
}
