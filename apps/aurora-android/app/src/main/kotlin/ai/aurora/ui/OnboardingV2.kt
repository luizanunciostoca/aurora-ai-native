package ai.aurora.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
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
import ai.aurora.ui.model.AuroraPresenceMode
import ai.aurora.ui.model.AuroraUiIntent
import ai.aurora.ui.model.AuroraUiState
import ai.aurora.ui.model.OnboardingStep
import ai.aurora.ui.model.SemanticTone

@Composable
internal fun OnboardingV2Flow(
    state: AuroraUiState,
    deviceKeyState: DeviceKeyUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
    onPrepareDeviceKey: () -> Unit,
) {
    val context = LocalContext.current
    val microphoneGranted = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    Row(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalArrangement = Arrangement.spacedBy(28.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier.weight(0.38f),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            AuroraCore(
                mode = if (state.onboardingStep == OnboardingStep.READY) AuroraPresenceMode.PRESENT else AuroraPresenceMode.AWAKEN,
                reducedMotion = state.settings.reducedMotion,
                size = 220.dp,
            )
            Spacer(Modifier.height(20.dp))
            Text("AURORA", fontSize = 32.sp, fontWeight = FontWeight.Light, letterSpacing = 6.sp)
            Text(
                "Presence → Conversation → Dynamic Workspace → Action → Evidence",
                color = TextSecondary,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp),
            )
        }

        Card(
            modifier = Modifier
                .weight(0.62f)
                .widthIn(max = 760.dp),
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
                            KeyValue("Fingerprint", deviceKeyState.fingerprintSha256)
                        }
                        Text(deviceKeyState.detail, color = TextSecondary, fontSize = 12.sp)
                        Button(onClick = onPrepareDeviceKey) {
                            Text(if (deviceKeyState.status == DeviceKeyUiStatus.READY) "Verificar chave novamente" else "Preparar chave local")
                        }
                        LuminousCallout(
                            "LOCAL KEY ≠ REMOTE TRUST",
                            "A chave W15-B é não exportável e não autoriza execução. O gateway ainda precisa registrar e aceitar o dispositivo.",
                            SemanticTone.VERIFIED,
                        )
                    }

                    OnboardingStep.VOICE_AUDIO -> {
                        Heading(
                            "Voice & Audio",
                            "Teste STT e verifique o engine local. TTS, idioma, velocidade, pitch e outras opções ficam disponíveis em Settings.",
                        )
                        KeyValue("STT", state.voice.inputEngineLabel)
                        KeyValue("TTS", state.voice.outputEngineLabel)
                        KeyValue("Idioma", state.settings.voiceLanguageTag)
                        Button(onClick = onVoice, enabled = !state.settings.privacyMode) {
                            Text(if (state.voice.listening) "Ouvindo…" else "Testar microfone")
                        }
                        if (state.voice.lastTranscript.isNotBlank() && state.settings.captionsEnabled) {
                            LuminousCallout("TRANSCRIPT", state.voice.lastTranscript, SemanticTone.INFO)
                        }
                        LuminousCallout(
                            "WAKE",
                            "Wake contínuo permanece preference-only até existir hotword engine dedicado + foreground/privacy policy.",
                            SemanticTone.APPROVAL,
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
                        OutlinedButton(
                            onClick = {
                                val intent = Intent(
                                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                    Uri.parse("package:${context.packageName}"),
                                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                runCatching { context.startActivity(intent) }
                            },
                        ) { Text("Abrir permissões do Android") }
                        LuminousCallout(
                            "FAIL CLOSED",
                            "Se uma capability exigir permissão negada, ela fica indisponível; a UI não amplia scopes silenciosamente.",
                            SemanticTone.APPROVAL,
                        )
                    }

                    OnboardingStep.READY -> {
                        Heading(
                            "Pronta para os primeiros testes",
                            "Presence, conversa, voz, accessibility, settings e runtime local estão disponíveis. Recursos remotos continuam claramente marcados até seus bindings canônicos.",
                        )
                        KeyValue("Build", state.device.buildSha)
                        KeyValue("Environment", state.device.environment)
                        KeyValue("Session", state.device.registrationStatus)
                        KeyValue("Key", deviceKeyState.status.name)
                        LuminousCallout(
                            "PRIMEIRO TESTE",
                            "Fale ou digite uma intenção. A Aurora pode navegar pelas superfícies locais e manter previews remotos sem fabricar dados.",
                            SemanticTone.VERIFIED,
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
                        Button(onClick = { onIntent(AuroraUiIntent.CompleteOnboarding) }) {
                            Text("Entrar na Aurora")
                        }
                    } else {
                        Button(onClick = { onIntent(AuroraUiIntent.NextOnboarding) }) {
                            Text("Continuar")
                        }
                    }
                }
            }
        }
    }
}
