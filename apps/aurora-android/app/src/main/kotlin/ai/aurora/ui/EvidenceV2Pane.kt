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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ai.aurora.ui.model.AuroraUiIntent
import ai.aurora.ui.model.AuroraUiState
import ai.aurora.ui.model.SemanticTone
import ai.aurora.ui.model.UiSurface

@Composable
internal fun EvidenceV2Pane(
    state: AuroraUiState,
    stepUpState: StepUpUiState,
    deviceKeyState: DeviceKeyUiState,
    onIntent: (AuroraUiIntent) -> Unit,
) {
    val runtime = state.device.runtimeIntegration
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(26.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Heading(
            "Evidence & Diagnostics",
            "Evidence canônica e diagnósticos locais permanecem separados. O tablet não fabrica evidenceId, verification ou provenance durável.",
        )

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SmallBadge("W17 CANONICAL EVIDENCE NOT CONNECTED", SemanticTone.APPROVAL)
            SmallBadge("LOCAL PRECONDITION DIAGNOSTICS", SemanticTone.INFO)
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.9f)),
            border = androidx.compose.foundation.BorderStroke(1.dp, Outline),
            shape = RoundedCornerShape(22.dp),
        ) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Canonical Evidence surface", fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                KeyValue("Correlation", state.evidence.correlationId)
                KeyValue("Receipt / ACK", state.evidence.receiptStatus)
                KeyValue("Readback", state.evidence.readbackStatus)
                state.evidence.events.forEach { event ->
                    KeyValue(event.label, event.detail)
                }
                LuminousCallout(
                    "NO SYNTHETIC EvidenceRecord",
                    "Quando W17 estiver conectado, esta zona consumirá Evidence com subject, evidenceType, capturedAt, source, correlation, verification, provenance e classification reais.",
                    SemanticTone.APPROVAL,
                )
            }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.9f)),
            border = androidx.compose.foundation.BorderStroke(1.dp, AuroraCyan.copy(alpha = 0.3f)),
            shape = RoundedCornerShape(22.dp),
        ) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Local precondition diagnostics", fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                KeyValue("Build", state.device.buildSha)
                KeyValue("UI profile", state.device.uiProfile)
                KeyValue("Environment", state.device.environment)
                KeyValue("Presence", state.device.visibility)
                KeyValue("Process generation", state.device.processGeneration.toString())
                KeyValue("Local service", state.device.localServicePhase)
                KeyValue("Network", state.connectivity.label)
                KeyValue("Device session", state.device.registrationStatus)
                HorizontalDivider(color = Outline)
                Text("Governed runtime projections", fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                KeyValue("Voice projection", runtime.governedVoiceStatus)
                KeyValue("W04 registry", runtime.w04RegistryVersion)
                KeyValue("W15-G vocabulary", runtime.w15gVocabularyVersion)
                KeyValue("Current DEVICE capabilities", runtime.currentDeviceCapabilities.toString())
                KeyValue("Deterministic voice commands", runtime.deterministicVoiceCommands.toString())
                KeyValue("W07 voice ingress", runtime.w07VoiceIngressStatus)
                KeyValue(
                    "Offline queue",
                    "${runtime.offlineQueueStatus} · total=${runtime.offlineQueueTotal} · deferred=${runtime.offlineQueueDeferred} · reconcile=${runtime.offlineQueueReconciliationRequired}",
                )
                LuminousCallout(
                    "RUNTIME PROJECTION ≠ CANONICAL EVIDENCE",
                    "W04/W15 read models exibidos aqui são diagnóstico de disponibilidade/frescor. Eles não são EvidenceRecord W17, não são authority, não provam side effect e não autorizam retry.",
                    if (runtime.offlineQueueReconciliationRequired > 0) SemanticTone.CRITICAL else SemanticTone.INFO,
                )
                HorizontalDivider(color = Outline)
                KeyValue("Device key", deviceKeyState.status.name)
                if (deviceKeyState.status == DeviceKeyUiStatus.READY) {
                    KeyValue("Key algorithm", deviceKeyState.algorithm)
                    KeyValue("Key fingerprint", deviceKeyState.fingerprintSha256)
                }
                KeyValue("Step-up", stepUpState.status.name)
                KeyValue("STT", state.voice.inputAvailability.name)
                KeyValue("TTS", state.voice.outputAvailability.name)
                LuminousCallout(
                    "DIAGNOSTICS ≠ AUTHORITY ≠ EVIDENCE",
                    "Esses sinais ajudam a diagnosticar o tablet, mas não provam outcome externo, não criam trust remoto e não autorizam execução.",
                    SemanticTone.INFO,
                )
            }
        }

        LuminousCallout(
            "EXECUTION_UNCERTAIN",
            "Se uma ação externa tiver sido enviada e o outcome não for conclusivo, a ação principal será readback/reconciliation. Blind retry permanece proibido.",
            SemanticTone.CRITICAL,
        )

        TextButton(onClick = { onIntent(AuroraUiIntent.OpenSurface(UiSurface.CONVERSATION)) }) {
            Text("Voltar à conversa")
        }
    }
}
