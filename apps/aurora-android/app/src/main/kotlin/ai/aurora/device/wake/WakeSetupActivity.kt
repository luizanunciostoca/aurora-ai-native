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

class WakeSetupActivity : FragmentActivity() {
    private lateinit var recorder: AuroraWakeEnrollmentRecorder
    private lateinit var modelStore: AuroraWakeModelStore
    private val templates = mutableListOf<WakeFeatureVector>()
    private var status by mutableStateOf("USER_SETUP_REQUIRED")
    private var detail by mutableStateOf("Treine o wake word local dizendo “Aurora” três vezes.")
    private var recording by mutableStateOf(false)
    private var sampleCount by mutableStateOf(0)
    private var assistantStatus by mutableStateOf("Verificando…")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        recorder = AuroraWakeEnrollmentRecorder(this)
        modelStore = AuroraWakeModelStore(this)
        refreshAssistantStatus()
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
        }
        val assistantRoleLauncher = rememberLauncherForActivityResult(
            ActivityResultContracts.StartActivityForResult(),
        ) {
            refreshAssistantStatus()
        }

        Column(
            modifier = Modifier.fillMaxSize().padding(28.dp),
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
            },
            onError = { message ->
                recording = false
                status = "DEGRADED"
                detail = message
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
        }.onFailure { throwable ->
            status = "WAKE_ERROR"
            detail = "Não foi possível armar o wake word: ${throwable.javaClass.simpleName}"
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

    companion object {
        private const val UI_PREFERENCES = "aurora.ui.v1"
        private const val KEY_WAKE_PREFERENCE = "wake_preference"
        private const val KEY_PRIVACY_MODE = "privacy_mode"
        private const val REQUIRED_SAMPLES = 3
        private const val MODEL_VERSION = "aurora-template-pt-BR-v1"
    }
}
