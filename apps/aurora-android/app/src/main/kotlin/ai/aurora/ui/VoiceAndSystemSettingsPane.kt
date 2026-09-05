package ai.aurora.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Debug
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ai.aurora.device.AuroraApplication
import ai.aurora.device.voice.GovernedVoiceCatalogResult
import ai.aurora.device.voice.GovernedVoiceCommandCatalog
import ai.aurora.device.wake.AuroraVoiceInteractionService
import ai.aurora.device.wake.AuroraWakeForegroundService
import ai.aurora.device.wake.AuroraWakeModelStore
import ai.aurora.device.wake.WakeRuntimeStatusStore
import ai.aurora.device.wake.WakeSensitivityPolicy
import ai.aurora.device.wake.WakeSetupActivity
import ai.aurora.ui.model.AuroraUiIntent
import ai.aurora.ui.model.AuroraUiState
import ai.aurora.ui.model.SemanticTone
import ai.aurora.ui.model.VoiceEngineAvailability
import ai.aurora.ui.model.VoiceOutputState

@Composable
internal fun VoiceAndSystemSettingsPane(
    state: AuroraUiState,
    deviceKeyState: DeviceKeyUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
    onStopVoiceOutput: () -> Unit,
    onPrepareDeviceKey: () -> Unit,
) {
    val context = LocalContext.current
    val microphoneGranted = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    val onboardingReplayController = OnboardingReplayController(context)
    val uiPreferences = remember(context) { context.getSharedPreferences(UI_PREFERENCES_NAME, Context.MODE_PRIVATE) }
    var wakeSensitivity by remember {
        mutableFloatStateOf(
            uiPreferences.getFloat(AuroraWakeForegroundService.KEY_WAKE_SENSITIVITY, WakeSensitivityPolicy.DEFAULT_SENSITIVITY),
        )
    }
    var wakeRefresh by remember { mutableIntStateOf(0) }
    @Suppress("UNUSED_EXPRESSION")
    wakeRefresh
    val wakeRuntime = WakeRuntimeStatusStore(context).snapshot()
    val wakeModelValid = AuroraWakeModelStore(context).hasValidModel()
    val assistantConfigured = AuroraVoiceInteractionService.isConfiguredAsAssistant(context)
    val powerManager = context.getSystemService(PowerManager::class.java)
    val batteryOptimizationExempt = powerManager?.isIgnoringBatteryOptimizations(context.packageName) == true
    val processPssMb = Debug.getPss().toDouble() / 1024.0
    val processCpuMs = android.os.Process.getElapsedCpuTime()
    val auroraApplication = context.applicationContext as? AuroraApplication
    val governedVoiceCatalogResult =
        auroraApplication?.let { app ->
            GovernedVoiceCommandCatalog(
                projectionProvider = { app.voiceProjectionStore().current() },
            ).snapshot()
        }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(26.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Heading(
            "Voice, Audio & Settings",
            "Configuração local do assistente multimodal. Speech/TTS/Wake não criam permission, authority ou execution truth.",
        )

        SettingsCard("Voice runtime") {
            KeyValue("Reconhecimento", state.voice.inputEngineLabel)
            KeyValue("Síntese", state.voice.outputEngineLabel)
            KeyValue("Rota de áudio", state.voice.audioRouteLabel)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SmallBadge("STT ${state.voice.inputAvailability.name}", engineTone(state.voice.inputAvailability))
                SmallBadge("TTS ${state.voice.outputAvailability.name}", engineTone(state.voice.outputAvailability))
                SmallBadge(
                    state.voice.outputState.name,
                    if (state.voice.outputState == VoiceOutputState.ERROR) SemanticTone.CRITICAL else SemanticTone.INFO,
                )
            }
            state.voice.lastError?.let { LuminousCallout("VOICE STATUS", it, SemanticTone.CRITICAL) }
        }

        SettingsCard("Entrada de voz / STT") {
            SettingToggleV2(
                "Preferir reconhecimento on-device/offline",
                "Usa o recognizer local quando o Android oferece suporte; faz fallback explícito para o serviço padrão.",
                state.settings.preferOfflineRecognition,
            ) { onIntent(AuroraUiIntent.SetPreferOfflineRecognition(it)) }
            LanguageSelector(state, onIntent)
            OutlinedButton(onClick = onVoice, enabled = !state.settings.privacyMode) {
                Text(if (state.voice.listening) "Ouvindo…" else "Testar microfone")
            }
            if (state.voice.lastTranscript.isNotBlank()) KeyValue("Último transcript", state.voice.lastTranscript)
        }

        SettingsCard("Saída de voz / TTS") {
            SettingToggleV2(
                "Saída de voz",
                "Permite que a Aurora fale respostas já produzidas pelo sistema.",
                state.settings.voiceOutputEnabled,
            ) { onIntent(AuroraUiIntent.SetVoiceOutputEnabled(it)) }
            SettingToggleV2(
                "Falar respostas automaticamente",
                "Quando ligado, respostas locais/recebidas podem ser apresentadas por TTS. Não altera o conteúdo nem sua authority.",
                state.settings.autoSpeakResponses,
            ) { onIntent(AuroraUiIntent.SetAutoSpeakResponses(it)) }
            SettingToggleV2(
                "Barge-in",
                "Permite interromper TTS e iniciar uma nova interação; self-wake da própria fala “Aurora” é suprimido localmente.",
                state.settings.bargeInEnabled,
            ) { onIntent(AuroraUiIntent.SetBargeIn(it)) }
            VoiceSlider("Velocidade", state.settings.voiceSpeechRate, 0.5f..1.5f, "${"%.2f".format(state.settings.voiceSpeechRate)}×") {
                onIntent(AuroraUiIntent.SetVoiceSpeechRate(it))
            }
            VoiceSlider("Tom", state.settings.voicePitch, 0.5f..2.0f, "${"%.2f".format(state.settings.voicePitch)}×") {
                onIntent(AuroraUiIntent.SetVoicePitch(it))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = { onIntent(AuroraUiIntent.TestVoiceOutput) },
                    enabled = state.settings.voiceOutputEnabled && !state.settings.privacyMode,
                ) { Text("Testar voz") }
                OutlinedButton(
                    onClick = onStopVoiceOutput,
                    enabled = state.voice.outputState == VoiceOutputState.SPEAKING,
                ) { Text("Parar fala") }
            }
        }

        SettingsCard("Wake Word · Aurora") {
            SettingToggleV2(
                "Ativar “Aurora”",
                "Detector dedicado on-device. Nenhum áudio contínuo é enviado ao backend e o wake nunca autoriza uma ação.",
                state.settings.wakePreferenceEnabled,
            ) { enabled ->
                onIntent(AuroraUiIntent.SetWakePreference(enabled))
                if (!enabled) AuroraWakeForegroundService.disarm(context)
            }
            KeyValue("Estado", wakeRuntime.state)
            KeyValue("Engine", wakeRuntime.engine)
            KeyValue("Modelo", wakeRuntime.modelVersion)
            KeyValue("Modelo íntegro/local", if (wakeModelValid) "YES" else "NO / SETUP REQUIRED")
            KeyValue("Default Assistant", if (assistantConfigured) "AURORA ACTIVE" else "NOT SELECTED")
            KeyValue("Microfone", if (microphoneGranted) "GRANTED" else "DENIED / NOT GRANTED")
            KeyValue("Battery optimization exemption", if (batteryOptimizationExempt) "EXEMPT" else "NOT EXEMPT")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SmallBadge("CONFIRMED ${wakeRuntime.confirmedWakes}", SemanticTone.VERIFIED)
                SmallBadge("REJECTED ${wakeRuntime.rejectedOrIgnoredCandidates}", SemanticTone.INFO)
            }
            wakeRuntime.lastError?.let { LuminousCallout("WAKE STATUS", it, SemanticTone.CRITICAL) }

            VoiceSlider(
                title = "Sensibilidade",
                value = wakeSensitivity,
                range = 0.0f..1.0f,
                label = "${(wakeSensitivity * 100).toInt()}%",
            ) { value ->
                wakeSensitivity = value.coerceIn(0.0f, 1.0f)
                uiPreferences.edit()
                    .putFloat(AuroraWakeForegroundService.KEY_WAKE_SENSITIVITY, wakeSensitivity)
                    .apply()
            }
            Text(
                "Sensibilidade altera apenas o threshold acústico local (${String.format("%.2f", WakeSensitivityPolicy.confidenceThreshold(wakeSensitivity))}); não altera policy, approval ou execution authority.",
                color = TextSecondary,
                fontSize = 12.sp,
            )

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = { context.startActivity(Intent(context, WakeSetupActivity::class.java)) },
                    enabled = !state.settings.privacyMode,
                ) { Text(if (wakeModelValid) "Recalibrar wake word" else "Configurar wake word") }
                OutlinedButton(
                    onClick = {
                        runCatching { AuroraWakeForegroundService.armFromVisibleContext(context) }
                        wakeRefresh += 1
                    },
                    enabled = state.settings.wakePreferenceEnabled && wakeModelValid && microphoneGranted && !state.settings.privacyMode,
                ) { Text("Rearmar agora") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = { wakeRefresh += 1 }) { Text("Atualizar diagnóstico") }
                OutlinedButton(
                    onClick = {
                        runCatching {
                            context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                        }
                    },
                ) { Text("Battery settings") }
            }
            LuminousCallout(
                "LOCAL + FAIL CLOSED",
                "O hotword usa AudioRecord 16 kHz + VAD + modelo derivado do enrollment local. Raw PCM não é persistido. Privacy Mode e revogação do microfone desarmam o caminho.",
                SemanticTone.VERIFIED,
            )
            LuminousCallout(
                if (assistantConfigured) "ASSISTANT TRACK A" else "FALLBACK TRACK B",
                if (assistantConfigured) {
                    "Como assistente Android ativo, o VoiceInteractionService pode restaurar o listener configurado pelo lifecycle oficial."
                } else {
                    "Sem Aurora como Default Assistant, o microphone FGS precisa ser armado por contexto visível e pode exigir rearm após reboot/restrições da plataforma."
                },
                if (assistantConfigured) SemanticTone.VERIFIED else SemanticTone.APPROVAL,
            )
            KeyValue("Process PSS snapshot", "${"%.1f".format(processPssMb)} MiB")
            KeyValue("Process CPU elapsed", "$processCpuMs ms")
            Text(
                "Wake latency, battery delta/hour, thermal e false-activation rate exigem coleta física representativa; esta UI não fabrica esses números.",
                color = TextSecondary,
                fontSize = 12.sp,
            )
        }

        SettingsCard("Governed Voice Fast Path") {
            when (val result = governedVoiceCatalogResult) {
                is GovernedVoiceCatalogResult.Ready -> {
                    val snapshot = result.snapshot
                    KeyValue("Estado", "PROJECTION READY / NON-AUTHORITATIVE")
                    KeyValue("W04 registry", snapshot.registryVersion)
                    KeyValue("W04 source", "BOUND / ${snapshot.registrySourceRef.length} chars")
                    KeyValue("W04 SHA-256", compactProjectionHash(snapshot.registryContentSha256))
                    KeyValue("W15-G vocabulary", snapshot.vocabularyVersion)
                    KeyValue("W15-G source", "BOUND / ${snapshot.vocabularySourceRef.length} chars")
                    KeyValue("W15-G SHA-256", compactProjectionHash(snapshot.vocabularyContentSha256))
                    KeyValue("DEVICE capabilities atuais", snapshot.availableCapabilityIds.size.toString())
                    SmallBadge("PROJECTION CURRENT", SemanticTone.VERIFIED)
                }
                is GovernedVoiceCatalogResult.Rejected -> {
                    KeyValue("Estado", "FAIL CLOSED")
                    KeyValue("Motivo", result.reason.name)
                    SmallBadge("CONVERSATION FALLBACK", SemanticTone.APPROVAL)
                }
                null -> {
                    KeyValue("Estado", "FAIL CLOSED")
                    KeyValue("Motivo", "APPLICATION PROJECTION STORE UNAVAILABLE")
                    SmallBadge("CONVERSATION FALLBACK", SemanticTone.CRITICAL)
                }
            }
            KeyValue("W07 mobile ingress", "UNCOMPOSED / FAIL CLOSED")
            LuminousCallout(
                "W04 + W15-C + W15-G ≠ AUTHORITY",
                "Registry/vocabulary provenance e capability availability apenas habilitam avaliação determinística. SourceRef/hash são integridade auditável, não assinatura nem authority. Sem ingress móvel W07 owner-published, qualquer candidate retorna para Conversation e nenhum side effect é executado.",
                SemanticTone.INFO,
            )
        }

        SettingsCard("Privacy & Accessibility") {
            SettingToggleV2(
                "Privacy mode",
                "Bloqueia wake, captura e saída de voz enquanto estiver ativo.",
                state.settings.privacyMode,
            ) { onIntent(AuroraUiIntent.SetPrivacyMode(it)) }
            SettingToggleV2(
                "Captions",
                "Mantém transcript e feedback textual disponíveis.",
                state.settings.captionsEnabled,
            ) { onIntent(AuroraUiIntent.SetCaptions(it)) }
            SettingToggleV2(
                "Haptics",
                "Feedback tátil curto para listening, acknowledgement e warnings; nunca representa autorização.",
                state.settings.hapticsEnabled,
            ) { onIntent(AuroraUiIntent.SetHaptics(it)) }
            SettingToggleV2(
                "Reduced motion",
                "Mesma semântica sem depender de animação espacial.",
                state.settings.reducedMotion,
            ) { onIntent(AuroraUiIntent.SetReducedMotion(it)) }
            SettingToggleV2(
                "High contrast",
                "Aumenta contraste de surfaces e labels.",
                state.settings.highContrast,
            ) { onIntent(AuroraUiIntent.SetHighContrast(it)) }
        }

        SettingsCard("Runtime & Permissions") {
            KeyValue("Microfone", if (microphoneGranted) "GRANTED" else "DENIED / NOT GRANTED")
            KeyValue("STT", state.voice.inputAvailability.name)
            KeyValue("TTS", state.voice.outputAvailability.name)
            KeyValue("Network", state.connectivity.label)
            KeyValue("Session", state.device.registrationStatus)
            LuminousCallout(
                "PRECONDITION ONLY",
                "Permissões Android, biometria, network e device session são preconditions. Nenhuma delas concede business authority.",
                SemanticTone.INFO,
            )
            OutlinedButton(
                onClick = {
                    val intent = Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:${context.packageName}"),
                    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    runCatching { context.startActivity(intent) }
                },
            ) { Text("Abrir permissões do Android") }
        }

        SettingsCard("Device Trust / Keystore") {
            KeyValue("Estado da chave", deviceKeyState.status.name)
            KeyValue("Algoritmo", deviceKeyState.algorithm)
            KeyValue("Fingerprint SHA-256", deviceKeyState.fingerprintSha256)
            Text(deviceKeyState.detail, color = TextSecondary, fontSize = 12.sp)
            LuminousCallout(
                "LOCAL KEY ≠ REMOTE TRUST",
                "Preparar a chave cria/verifica somente a identidade criptográfica local W15-B. Registration, trust, policy e execution authority permanecem remotos e governados.",
                SemanticTone.VERIFIED,
            )
            Button(onClick = onPrepareDeviceKey) {
                Text(if (deviceKeyState.status == DeviceKeyUiStatus.READY) "Verificar novamente" else "Preparar / validar chave local")
            }
        }

        SettingsCard("Offline behavior") {
            LuminousCallout(
                "LOCAL_ONLY",
                "Presence, navegação local, settings e TTS permanecem disponíveis. STT também pode permanecer local quando o recognizer on-device estiver disponível.",
                SemanticTone.VERIFIED,
            )
            LuminousCallout(
                "QUEUE_SAFE",
                "A UI não cria fila de side effects por conta própria. Queueing só será habilitado quando o owner declarar replay/idempotency seguros.",
                SemanticTone.APPROVAL,
            )
            LuminousCallout(
                "UNAVAILABLE",
                "Workspaces remotos, approvals, providers e writes ficam indisponíveis sem projections/bindings atuais. Nenhuma authority é inferida offline.",
                SemanticTone.CRITICAL,
            )
        }

        SettingsCard("Device & Session") {
            KeyValue("Environment", state.device.environment)
            KeyValue("Presence", state.device.visibility)
            KeyValue("Process generation", state.device.processGeneration.toString())
            KeyValue("Local service", state.device.localServicePhase)
            KeyValue("Session", state.device.registrationStatus)
            KeyValue("Network", state.connectivity.label)
            LuminousCallout(
                "DP5",
                "O adapter W15-J está presente, mas a sessão remota ainda depende de provisioning e evidence física. Voice continua sendo apenas uma interface para o mesmo pipeline governado.",
                SemanticTone.INFO,
            )
        }

        SettingsCard("Prototype test controls") {
            LuminousCallout(
                "NON-DESTRUCTIVE",
                "Reexecutar onboarding altera somente o flag local de first-run. Chave W15-B, session metadata e preferências de voz não são apagadas.",
                SemanticTone.INFO,
            )
            OutlinedButton(
                onClick = { onboardingReplayController.replayWithoutResettingDeviceTrust() },
            ) { Text("Reexecutar onboarding") }
        }

        SettingsCard("About / Environment") {
            KeyValue("Version", ai.aurora.device.BuildConfig.VERSION_NAME)
            KeyValue("Build SHA", ai.aurora.device.BuildConfig.AURORA_BUILD_SHA)
            KeyValue("UI profile", ai.aurora.device.BuildConfig.AURORA_UI_PROFILE)
            KeyValue("Application", ai.aurora.device.BuildConfig.APPLICATION_ID)
            Text(
                "Sem secrets, credentials, tenant topology ou private chain-of-thought nesta superfície.",
                color = TextSecondary,
                fontSize = 12.sp,
            )
        }
    }
}

@Composable
private fun LanguageSelector(state: AuroraUiState, onIntent: (AuroraUiIntent) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Idioma", fontWeight = FontWeight.Medium)
        Text(
            "O mesmo locale é aplicado ao reconhecimento e ao TTS quando suportado pelo dispositivo. O modelo de wake deste prototype permanece especificamente pt-BR / “Aurora”.",
            color = TextSecondary,
            fontSize = 12.sp,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("pt-BR" to "Português (BR)", "en-US" to "English (US)", "es-ES" to "Español").forEach { (tag, label) ->
                if (state.settings.voiceLanguageTag == tag) {
                    Button(onClick = { onIntent(AuroraUiIntent.SetVoiceLanguage(tag)) }) { Text(label) }
                } else {
                    OutlinedButton(onClick = { onIntent(AuroraUiIntent.SetVoiceLanguage(tag)) }) { Text(label) }
                }
            }
        }
    }
}

@Composable
private fun VoiceSlider(
    title: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    label: String,
    onValueChange: (Float) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(title, fontWeight = FontWeight.Medium)
            Text(label, color = TextSecondary, fontSize = 12.sp)
        }
        Slider(value = value, onValueChange = onValueChange, valueRange = range)
    }
}

@Composable
private fun SettingsCard(title: String, content: @Composable () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.88f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, Outline),
        shape = RoundedCornerShape(22.dp),
    ) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
            content()
        }
    }
}

@Composable
private fun SettingToggleV2(
    title: String,
    detail: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.Medium)
            Text(detail, color = TextSecondary, fontSize = 12.sp)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

private fun engineTone(availability: VoiceEngineAvailability): SemanticTone = when (availability) {
    VoiceEngineAvailability.AVAILABLE -> SemanticTone.VERIFIED
    VoiceEngineAvailability.UNKNOWN -> SemanticTone.INFO
    VoiceEngineAvailability.UNAVAILABLE -> SemanticTone.CRITICAL
}

private fun compactProjectionHash(value: String): String =
    if (value.length <= 16) value else "${value.take(12)}…${value.takeLast(4)}"

private const val UI_PREFERENCES_NAME = "aurora.ui.v1"
