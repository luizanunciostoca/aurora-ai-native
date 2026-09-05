package ai.aurora.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ai.aurora.device.wake.AuroraVoiceInteractionService
import ai.aurora.device.wake.AuroraWakeModelStore
import ai.aurora.device.wake.WakeRuntimeStatusStore
import ai.aurora.device.wake.WakeSetupActivity
import ai.aurora.ui.model.AuroraPresenceMode
import ai.aurora.ui.model.AuroraUiIntent
import ai.aurora.ui.model.AuroraUiState
import ai.aurora.ui.model.OnboardingStep
import ai.aurora.ui.model.SemanticTone

@Composable
internal fun OnboardingV2Flow(
    state: AuroraUiState,
    deviceKeyState: DeviceKeyUiState,
    voiceDiagnosticState: VoiceDiagnosticUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoiceTest: () -> Unit,
    onPrepareDeviceKey: () -> Unit,
) {
    val context = LocalContext.current
    val microphoneGranted = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    val wakeModelValid = AuroraWakeModelStore(context).hasValidModel()
    val assistantConfigured = AuroraVoiceInteractionService.isConfiguredAsAssistant(context)
    val wakeRuntime = WakeRuntimeStatusStore(context).snapshot()
    val wakeReadiness = when {
        state.settings.privacyMode -> "PARTIAL"
        !state.settings.wakePreferenceEnabled -> "USER_SETUP_REQUIRED"
        !microphoneGranted || !wakeModelValid -> "USER_SETUP_REQUIRED"
        wakeRuntime.state in setOf("HOTWORD_LISTENING", "ARMED") && assistantConfigured -> "READY"
        wakeRuntime.state in setOf("HOTWORD_LISTENING", "ARMED") -> "PARTIAL"
        assistantConfigured -> "PARTIAL"
        else -> "PLATFORM_LIMITED"
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val wide = maxWidth >= 900.dp
        if (wide) {
            Row(
                modifier = Modifier.fillMaxSize().padding(32.dp),
                horizontalArrangement = Arrangement.spacedBy(28.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OnboardingHero(state, Modifier.weight(0.38f), coreSize = 220)
                OnboardingCard(
                    state = state,
                    deviceKeyState = deviceKeyState,
                    voiceDiagnosticState = voiceDiagnosticState,
                    microphoneGranted = microphoneGranted,
                    wakeModelValid = wakeModelValid,
                    assistantConfigured = assistantConfigured,
                    wakeRuntimeState = wakeRuntime.state,
                    wakeReadiness = wakeReadiness,
                    onIntent = onIntent,
                    onVoiceTest = onVoiceTest,
                    onPrepareDeviceKey = onPrepareDeviceKey,
                    onOpenAndroidSettings = { openAndroidAppSettings(context) },
                    onOpenWakeSetup = { context.startActivity(Intent(context, WakeSetupActivity::class.java)) },
                    modifier = Modifier.weight(0.62f).widthIn(max = 760.dp),
                )
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(22.dp),
            ) {
                OnboardingHero(state, Modifier.fillMaxWidth(), coreSize = 128)
                OnboardingCard(
                    state = state,
                    deviceKeyState = deviceKeyState,
                    voiceDiagnosticState = voiceDiagnosticState,
                    microphoneGranted = microphoneGranted,
                    wakeModelValid = wakeModelValid,
                    assistantConfigured = assistantConfigured,
                    wakeRuntimeState = wakeRuntime.state,
                    wakeReadiness = wakeReadiness,
                    onIntent = onIntent,
                    onVoiceTest = onVoiceTest,
                    onPrepareDeviceKey = onPrepareDeviceKey,
                    onOpenAndroidSettings = { openAndroidAppSettings(context) },
                    onOpenWakeSetup = { context.startActivity(Intent(context, WakeSetupActivity::class.java)) },
                    modifier = Modifier.fillMaxWidth().widthIn(max = 760.dp),
                )
                Spacer(Modifier.height(12.dp))
            }
        }
    }
}

@Composable
private fun OnboardingHero(state: AuroraUiState, modifier: Modifier, coreSize: Int) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        AuroraCore(
            mode = if (state.onboardingStep == OnboardingStep.READY) AuroraPresenceMode.PRESENT else AuroraPresenceMode.AWAKEN,
            reducedMotion = state.settings.reducedMotion,
            size = coreSize.dp,
        )
        Spacer(Modifier.height(if (coreSize > 160) 20.dp else 12.dp))
        Text(
            "AURORA",
            fontSize = if (coreSize > 160) 32.sp else 25.sp,
            fontWeight = FontWeight.Light,
            letterSpacing = if (coreSize > 160) 6.sp else 4.sp,
        )
        Text(
            "Presence → Conversation → Dynamic Workspace → Action → Evidence",
            color = TextSecondary,
            textAlign = TextAlign.Center,
            fontSize = if (coreSize > 160) 14.sp else 12.sp,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
private fun OnboardingCard(
    state: AuroraUiState,
    deviceKeyState: DeviceKeyUiState,
    voiceDiagnosticState: VoiceDiagnosticUiState,
    microphoneGranted: Boolean,
    wakeModelValid: Boolean,
    assistantConfigured: Boolean,
    wakeRuntimeState: String,
    wakeReadiness: String,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoiceTest: () -> Unit,
    onPrepareDeviceKey: () -> Unit,
    onOpenAndroidSettings: () -> Unit,
    onOpenWakeSetup: () -> Unit,
    modifier: Modifier,
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.94f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, Outline),
        shape = RoundedCornerShape(28.dp),
    ) {
        Column(
            modifier = Modifier.padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Text(
                "ETAPA ${OnboardingStep.entries.indexOf(state.onboardingStep) + 1} DE ${OnboardingStep.entries.size}",
                color = AuroraCyan,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.2.sp,
            )

            when (state.onboardingStep) {
                OnboardingStep.WELCOME -> {
                    Heading(
                        "A interface é a própria Aurora",
                        "Você conversa primeiro. Workspaces aparecem quando ajudam a compreender, decidir ou agir.",
                    )
                    LuminousCallout(
                        "PRIVACY-FIRST",
                        "A configuração começa localmente. Nenhuma permissão, sessão ou capability concede authority por si só.",
                        SemanticTone.INFO,
                    )
                }

                OnboardingStep.DEVICE_TRUST -> {
                    Heading(
                        "Device Trust & Registration",
                        "Prepare a identidade criptográfica local do tablet. Registration e trust remotos continuam separados até DP5.",
                    )
                    KeyValue("Ambiente", state.device.environment)
                    KeyValue("Presence", state.device.visibility)
                    KeyValue("Session", state.device.registrationStatus)
                    KeyValue("Chave local", deviceKeyState.status.name)
                    if (deviceKeyState.status == DeviceKeyUiStatus.READY) {
                        KeyValue("Algoritmo", deviceKeyState.algorithm)
                        KeyValue("Security level", deviceKeyState.securityLevel)
                        KeyValue(
                            "Hardware-backed",
                            when (deviceKeyState.secureHardwareBacked) {
                                true -> "YES"
                                false -> "NO"
                                null -> "UNKNOWN"
                            },
                        )
                        KeyValue("Fingerprint", deviceKeyState.fingerprintSha256)
                    }
                    Text(deviceKeyState.detail, color = TextSecondary, fontSize = 12.sp)
                    Button(onClick = onPrepareDeviceKey) {
                        Text(if (deviceKeyState.status == DeviceKeyUiStatus.READY) "Verificar chave novamente" else "Preparar chave local")
                    }
                    LuminousCallout(
                        "LOCAL KEY ≠ REMOTE TRUST",
                        "TEE/StrongBox melhoram a proteção local quando presentes, mas não registram o dispositivo e não autorizam execução. O gateway ainda precisa registrar e aceitar o DeviceRef.",
                        SemanticTone.VERIFIED,
                    )
                }

                OnboardingStep.VOICE_AUDIO -> {
                    Heading(
                        "Voice, Wake & Audio",
                        "Teste STT/TTS e configure o hotword local “Aurora”. O transcript de diagnóstico não entra na Conversation nem vira intenção.",
                    )
                    KeyValue("STT", state.voice.inputEngineLabel)
                    KeyValue("TTS", state.voice.outputEngineLabel)
                    KeyValue("Idioma STT/TTS", state.settings.voiceLanguageTag)
                    KeyValue("Wake model", if (wakeModelValid) "LOCAL / VALID" else "SETUP REQUIRED")
                    KeyValue("Wake runtime", wakeRuntimeState)
                    KeyValue("Default Assistant", if (assistantConfigured) "AURORA ACTIVE" else "NOT SELECTED")
                    KeyValue("Wake readiness", wakeReadiness)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(onClick = onVoiceTest, enabled = !state.settings.privacyMode) {
                            Text(if (voiceDiagnosticState.status == VoiceDiagnosticStatus.LISTENING) "Ouvindo teste…" else "Testar microfone")
                        }
                        OutlinedButton(onClick = onOpenWakeSetup, enabled = !state.settings.privacyMode) {
                            Text(if (wakeModelValid) "Recalibrar “Aurora”" else "Ativar “Aurora”")
                        }
                    }
                    if (state.settings.captionsEnabled) {
                        val transcript = voiceDiagnosticState.transcript.ifBlank { voiceDiagnosticState.partialTranscript }
                        if (transcript.isNotBlank()) {
                            LuminousCallout("TRANSCRIPT DE TESTE", transcript, SemanticTone.INFO)
                        }
                    }
                    Text(voiceDiagnosticState.detail, color = TextSecondary, fontSize = 12.sp)
                    LuminousCallout(
                        "LOCAL HOTWORD",
                        "O detector de “Aurora” é separado do SpeechRecognizer: AudioRecord/VAD/model local detectam apenas o wake; depois do wake, STT bounded produz um candidate para o pipeline governado.",
                        SemanticTone.VERIFIED,
                    )
                    LuminousCallout(
                        "WAKE ≠ AUTHORITY",
                        "Acordar a Aurora nunca concede permission, approval, business authority, execution truth ou retry eligibility.",
                        SemanticTone.INFO,
                    )
                }

                OnboardingStep.PERMISSIONS -> {
                    Heading(
                        "Permissões just-in-time",
                        "A Aurora pede apenas a permissão exigida pela capability atual. Permissão Android continua sendo precondition, nunca business authority.",
                    )
                    KeyValue("Internet", "AVAILABLE")
                    KeyValue("Network state", "AVAILABLE")
                    KeyValue("Microfone", if (microphoneGranted) "GRANTED" else "NOT GRANTED")
                    OutlinedButton(onClick = onOpenAndroidSettings) { Text("Abrir permissões do Android") }
                    LuminousCallout(
                        "FAIL CLOSED",
                        "Se uma capability exigir permissão negada, ela fica indisponível; a UI não amplia scopes silenciosamente.",
                        SemanticTone.APPROVAL,
                    )
                }

                OnboardingStep.READY -> {
                    Heading(
                        if (wakeReadiness == "READY") "Pronta para interação por voz" else "Configuração parcial — sem falso READY",
                        if (wakeReadiness == "READY") {
                            "Presence, conversa, wake word, voz e runtime local estão disponíveis. Recursos remotos continuam marcados até seus bindings canônicos."
                        } else {
                            "A interface pode ser usada, mas o wake word ainda tem setup ou limitação de plataforma. A Aurora não representa always-listening como pronto enquanto isso não for verdade."
                        },
                    )
                    KeyValue("Onboarding status", wakeReadiness)
                    KeyValue("Wake runtime", wakeRuntimeState)
                    KeyValue("Default Assistant", if (assistantConfigured) "AURORA ACTIVE" else "NOT SELECTED")
                    KeyValue("Build", state.device.buildSha)
                    KeyValue("Environment", state.device.environment)
                    KeyValue("Session", state.device.registrationStatus)
                    KeyValue("Key", deviceKeyState.status.name)
                    if (deviceKeyState.status == DeviceKeyUiStatus.READY) {
                        KeyValue("Key security", deviceKeyState.securityLevel)
                    }
                    KeyValue("Voice diagnostic", voiceDiagnosticState.status.name)
                    if (wakeReadiness != "READY") {
                        OutlinedButton(onClick = onOpenWakeSetup, enabled = !state.settings.privacyMode) {
                            Text("Concluir configuração de “Aurora”")
                        }
                    }
                    LuminousCallout(
                        "PRIMEIRO TESTE",
                        "Depois de entrar, use “Aurora” quando o wake estiver READY, ou Falar/Digitar na Conversation. Todos os caminhos convergem para o mesmo pipeline governado.",
                        if (wakeReadiness == "READY") SemanticTone.VERIFIED else SemanticTone.APPROVAL,
                    )
                }
            }

            Spacer(Modifier.height(4.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(
                    enabled = state.onboardingStep != OnboardingStep.WELCOME,
                    onClick = { onIntent(AuroraUiIntent.PreviousOnboarding) },
                ) { Text("Voltar") }

                if (state.onboardingStep == OnboardingStep.READY) {
                    Button(onClick = { onIntent(AuroraUiIntent.CompleteOnboarding) }) { Text("Entrar na Aurora") }
                } else {
                    Button(onClick = { onIntent(AuroraUiIntent.NextOnboarding) }) { Text("Continuar") }
                }
            }
        }
    }
}

private fun openAndroidAppSettings(context: android.content.Context) {
    val intent = Intent(
        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
        Uri.parse("package:${context.packageName}"),
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
}
