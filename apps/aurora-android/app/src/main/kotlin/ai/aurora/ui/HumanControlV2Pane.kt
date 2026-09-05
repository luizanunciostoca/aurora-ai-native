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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import ai.aurora.ui.model.AuroraUiIntent
import ai.aurora.ui.model.AuroraUiState
import ai.aurora.ui.model.SemanticTone

@Composable
internal fun HumanControlV2Pane(
    state: AuroraUiState,
    stepUp: StepUpUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onStepUp: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(26.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Heading(
            "Human Control",
            "Approval, modify, deny e step-up ficam em superfície própria. A decisão continua request-only até W16-D conectar o owner canônico.",
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SmallBadge("REQUEST ONLY", SemanticTone.APPROVAL)
            SmallBadge("STEP-UP ${stepUp.status.name}", stepUpTone(stepUp.status))
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.9f)),
            border = androidx.compose.foundation.BorderStroke(1.dp, Approval.copy(alpha = 0.55f)),
            shape = RoundedCornerShape(22.dp),
        ) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(state.humanControl.title, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                KeyValue("Impact", state.humanControl.impact)
                KeyValue("Expiry", state.humanControl.expiry)
                LuminousCallout(
                    "SEM AUTHORITY LOCAL",
                    "A tela apresenta uma proposta. Nenhum botão cria OwnerDecision, PolicyToken ou execution permission.",
                    SemanticTone.APPROVAL,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = { onIntent(AuroraUiIntent.SubmitHumanDecision("DENY")) }) { Text("Negar") }
                    OutlinedButton(onClick = { onIntent(AuroraUiIntent.SubmitHumanDecision("MODIFY")) }) { Text("Modificar") }
                    Button(onClick = { onIntent(AuroraUiIntent.SubmitHumanDecision("APPROVE")) }) { Text("Aprovar request") }
                }
            }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.9f)),
            border = androidx.compose.foundation.BorderStroke(1.dp, toneColor(stepUpTone(stepUp.status)).copy(alpha = 0.55f)),
            shape = RoundedCornerShape(22.dp),
        ) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Step-up Authentication", fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                KeyValue("Status", stepUp.status.name)
                KeyValue("Método", stepUp.method ?: "—")
                Text(stepUp.detail, color = TextSecondary, fontSize = 13.sp, lineHeight = 19.sp)
                Button(
                    onClick = onStepUp,
                    enabled = stepUp.status in setOf(
                        StepUpStatus.AVAILABLE,
                        StepUpStatus.SUCCEEDED,
                        StepUpStatus.FAILED,
                    ),
                ) {
                    Text(if (stepUp.status == StepUpStatus.SUCCEEDED) "Confirmar novamente" else "Testar step-up local")
                }
                LuminousCallout(
                    "LOCAL PROOF ONLY",
                    "Biometria/credencial confirma interação no tablet. Mesmo após SUCCESS, o backend deve revalidar identity/session, policy, authority, target e expiry atuais antes de qualquer execução.",
                    SemanticTone.VERIFIED,
                )
            }
        }

        LuminousCallout(
            "RACE / STALE SAFETY",
            "Uma confirmação local bem-sucedida não congela approval nem torna a tela atual. Approval expirado, revogado ou alterado deve ser novamente projetado pelo owner antes da decisão.",
            SemanticTone.INFO,
        )
    }
}

private fun stepUpTone(status: StepUpStatus): SemanticTone = when (status) {
    StepUpStatus.AVAILABLE -> SemanticTone.INFO
    StepUpStatus.AUTHENTICATING -> SemanticTone.APPROVAL
    StepUpStatus.SUCCEEDED -> SemanticTone.VERIFIED
    StepUpStatus.FAILED,
    StepUpStatus.UNAVAILABLE,
    -> SemanticTone.CRITICAL
    StepUpStatus.CHECKING -> SemanticTone.NEUTRAL
}
