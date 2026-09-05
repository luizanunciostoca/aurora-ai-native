package ai.aurora.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ai.aurora.ui.model.AuroraPresenceMode
import ai.aurora.ui.model.AuroraUiIntent
import ai.aurora.ui.model.AuroraUiState
import ai.aurora.ui.model.ConversationRole
import ai.aurora.ui.model.ConversationTurn
import ai.aurora.ui.model.SemanticTone

@Composable
internal fun AccessibleConversationPane(
    state: AuroraUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()
    LaunchedEffect(state.conversation.size) {
        if (state.conversation.isNotEmpty()) {
            if (state.settings.reducedMotion) {
                listState.scrollToItem(state.conversation.lastIndex)
            } else {
                listState.animateScrollToItem(state.conversation.lastIndex)
            }
        }
    }

    Column(
        modifier = modifier
            .background(SurfaceDark.copy(alpha = 0.72f))
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            AuroraCore(state.presence, state.settings.reducedMotion, 68.dp)
            Column(modifier = Modifier.weight(1f)) {
                Text(presenceHeadline(state.presence), fontWeight = FontWeight.SemiBold, fontSize = 17.sp)
                Text(accessiblePresenceSubhead(state), color = TextSecondary, fontSize = 12.sp)
            }
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            item { SmallBadge("LIVE runtime", SemanticTone.VERIFIED) }
            item { SmallBadge(state.device.environment, SemanticTone.INFO) }
            if (state.settings.captionsEnabled) item { SmallBadge("CAPTIONS ON", SemanticTone.INFO) }
            if (state.workspaceOpen) item { SmallBadge(state.selectedView.displayTitle, SemanticTone.REASONING) }
        }
        HorizontalDivider(color = Outline)
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            contentPadding = PaddingValues(vertical = 6.dp),
        ) {
            items(state.conversation, key = { it.id }) { turn -> AccessibleConversationBubble(turn) }
            if (state.listening) {
                item {
                    val caption = if (state.settings.captionsEnabled) {
                        state.partialTranscript.ifBlank { "Estou ouvindo…" }
                    } else {
                        "Estou ouvindo. Captions estão desativadas."
                    }
                    Column(
                        modifier = Modifier.semantics {
                            liveRegion = LiveRegionMode.Polite
                            contentDescription = "Estado de voz: $caption"
                        },
                    ) {
                        LuminousCallout("LISTENING", caption, SemanticTone.INFO)
                    }
                }
            }
        }
        AccessibleCommandInput(state, onIntent, onVoice)
    }
}

private fun accessiblePresenceSubhead(state: AuroraUiState): String =
    when (state.presence) {
        AuroraPresenceMode.OFFLINE -> "Offline · local-only e queue-safe continuam distinguíveis."
        AuroraPresenceMode.LISTENING -> if (state.settings.captionsEnabled) {
            state.partialTranscript.ifBlank { "Captando voz com captions ativas." }
        } else {
            "Captando voz · captions desativadas."
        }
        AuroraPresenceMode.UNDERSTANDING -> "Interpretando a intenção sem conceder authority."
        AuroraPresenceMode.RETRIEVING_CONTEXT -> "Recuperando contexto com freshness/provenance visíveis."
        AuroraPresenceMode.REASONING -> "Preparando resposta sem expor private chain-of-thought."
        AuroraPresenceMode.WAITING_APPROVAL -> "Aguardando decisão humana governada."
        AuroraPresenceMode.EXECUTION_UNCERTAIN -> "Outcome inconclusivo · reconciliation antes de retry."
        AuroraPresenceMode.DEGRADED -> "Modo degradado · limites permanecem explícitos."
        else -> "Conversa primeiro. Workspace aparece somente quando ajuda."
    }

@Composable
private fun AccessibleConversationBubble(turn: ConversationTurn) {
    val user = turn.role == ConversationRole.USER
    val speaker = if (user) "Você" else if (turn.role == ConversationRole.AURORA) "Aurora" else "Sistema"
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "$speaker: ${turn.text}. Provenance ${turn.provenance.name}" },
        horizontalArrangement = if (user) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 520.dp)
                .background(if (user) ElectricBlue.copy(alpha = 0.20f) else SurfaceRaised, RoundedCornerShape(18.dp))
                .border(1.dp, if (user) ElectricBlue.copy(alpha = 0.38f) else Outline, RoundedCornerShape(18.dp))
                .padding(13.dp),
        ) {
            Text(
                speaker.uppercase(),
                color = if (user) ElectricBlue else AuroraCyan,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.4.sp,
            )
            Spacer(Modifier.height(5.dp))
            Text(turn.text, fontSize = 14.sp, lineHeight = 20.sp)
            Spacer(Modifier.height(7.dp))
            Text(turn.provenance.name.replace('_', ' '), color = TextSecondary, fontSize = 9.sp)
        }
    }
}

@Composable
private fun AccessibleCommandInput(
    state: AuroraUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
) {
    val submit = {
        if (state.inputDraft.isNotBlank()) onIntent(AuroraUiIntent.SubmitText(state.inputDraft))
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = state.inputDraft,
            onValueChange = { onIntent(AuroraUiIntent.UpdateDraft(it)) },
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = "Campo de conversa com a Aurora" },
            placeholder = { Text("Pergunte, peça para mostrar, comparar ou explicar…") },
            minLines = 1,
            maxLines = 4,
            singleLine = false,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { submit() }),
            shape = RoundedCornerShape(18.dp),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = submit,
                enabled = state.inputDraft.isNotBlank(),
                modifier = Modifier
                    .weight(1f)
                    .height(52.dp)
                    .semantics { contentDescription = "Enviar mensagem para Aurora" },
            ) { Text("Enviar") }
            OutlinedButton(
                onClick = onVoice,
                modifier = Modifier
                    .height(52.dp)
                    .semantics {
                        contentDescription = if (state.listening) "Aurora está ouvindo" else "Falar com a Aurora"
                    },
            ) { Text(if (state.listening) "Ouvindo…" else "Falar") }
        }
    }
}
