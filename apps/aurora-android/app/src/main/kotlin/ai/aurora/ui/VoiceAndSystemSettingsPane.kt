package ai.aurora.ui

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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ai.aurora.ui.model.AuroraUiIntent
import ai.aurora.ui.model.AuroraUiState
import ai.aurora.ui.model.SemanticTone
import ai.aurora.ui.model.VoiceEngineAvailability
import ai.aurora.ui.model.VoiceOutputState

@Composable
internal fun VoiceAndSystemSettingsPane(
    state: AuroraUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
    onStopVoiceOutput: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(26.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Heading(
            "Voice, Audio & Settings",
            "Configuração local do assistente multimodal. Speech/TTS não criam permission, authority ou execution truth.",
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
                "Ao tocar para falar durante TTS, interrompe a fala atual antes de iniciar STT.",
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

        SettingsCard("Wake & Presence") {
            SettingToggleV2(
                "Wake preference",
                "Preferência armazenada, mas o hotword contínuo ainda não está ativo. A implementação final requer engine dedicado + foreground/privacy policy.",
                state.settings.wakePreferenceEnabled,
            ) { onIntent(AuroraUiIntent.SetWakePreference(it)) }
            LuminousCallout(
                "PREFERENCE ONLY",
                "A APK não mantém SpeechRecognizer aberto em loop. Isso evita uma falsa implementação de always-listening e preserva bateria/privacidade.",
                SemanticTone.APPROVAL,
            )
        }

        SettingsCard("Privacy & Accessibility") {
            SettingToggleV2(
                "Privacy mode",
                "Bloqueia captura e saída de voz enquanto estiver ativo.",
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
            KeyValue("Local service", state.device.localServicePhase)
            KeyValue("Session", state.device.registrationStatus)
            KeyValue("Network", state.connectivity.label)
            LuminousCallout(
                "DP5",
                "O adapter W15-J está presente, mas a sessão remota ainda depende de provisioning e evidence física. Voice continua sendo apenas uma interface para o mesmo pipeline governado.",
                SemanticTone.INFO,
            )
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
            "O mesmo locale é aplicado ao reconhecimento e ao TTS quando suportado pelo dispositivo.",
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
