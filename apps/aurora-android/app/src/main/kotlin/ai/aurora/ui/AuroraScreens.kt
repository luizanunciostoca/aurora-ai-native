package ai.aurora.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ai.aurora.ui.model.AuroraPresenceMode
import ai.aurora.ui.model.AuroraSettings
import ai.aurora.ui.model.AuroraUiComponent
import ai.aurora.ui.model.AuroraUiIntent
import ai.aurora.ui.model.AuroraUiState
import ai.aurora.ui.model.ConversationRole
import ai.aurora.ui.model.ConversationTurn
import ai.aurora.ui.model.DynamicViewManifest
import ai.aurora.ui.model.OnboardingStep
import ai.aurora.ui.model.SemanticTone
import ai.aurora.ui.model.UiSurface
import ai.aurora.ui.model.WorkspaceViewType

@Composable
internal fun OnboardingFlow(
    state: AuroraUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
) {
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val wideLayout = maxWidth >= 840.dp
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(if (wideLayout) 48.dp else 20.dp),
            horizontalArrangement = Arrangement.spacedBy(28.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (wideLayout) {
                Column(
                    modifier = Modifier.weight(0.42f),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    AuroraCore(
                        mode = if (state.onboardingStep == OnboardingStep.READY) {
                            AuroraPresenceMode.PRESENT
                        } else {
                            AuroraPresenceMode.AWAKEN
                        },
                        reducedMotion = state.settings.reducedMotion,
                        size = 260.dp,
                    )
                    Spacer(Modifier.height(22.dp))
                    Text("AURORA", fontSize = 34.sp, fontWeight = FontWeight.Light, letterSpacing = 6.sp)
                    Text(
                        "Presence → Conversation → Dynamic Workspace → Action → Evidence",
                        color = TextSecondary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                }
            }
            Card(
                modifier = Modifier
                    .weight(if (wideLayout) 0.58f else 1f)
                    .widthIn(max = 720.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.94f)),
                shape = RoundedCornerShape(28.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, Outline),
            ) {
                Column(
                    modifier = Modifier.padding(28.dp),
                    verticalArrangement = Arrangement.spacedBy(20.dp),
                ) {
                    OnboardingProgress(state.onboardingStep)
                    OnboardingStepContent(state, onVoice)
                    HorizontalDivider(color = Outline)
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
}

@Composable
private fun OnboardingProgress(step: OnboardingStep) {
    val steps = OnboardingStep.entries
    val current = steps.indexOf(step)
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(steps) { item ->
            val index = steps.indexOf(item)
            Box(
                modifier = Modifier
                    .height(5.dp)
                    .width(if (index == current) 42.dp else 22.dp)
                    .clip(CircleShape)
                    .background(if (index <= current) AuroraCyan else Outline),
            )
        }
    }
}

@Composable
private fun OnboardingStepContent(state: AuroraUiState, onVoice: () -> Unit) {
    when (state.onboardingStep) {
        OnboardingStep.WELCOME -> {
            Heading(
                "A interface é a própria Aurora",
                "Você não precisa aprender uma árvore de menus. Diga o que quer; a interface cresce apenas quando ajuda a compreender, decidir ou agir.",
            )
            LuminousCallout(
                "PRIVACY-FIRST",
                "A configuração começa localmente. Permissões são solicitadas just-in-time e nunca equivalem a authority.",
                SemanticTone.INFO,
            )
        }
        OnboardingStep.DEVICE_TRUST -> {
            Heading(
                "Device Trust & Registration",
                "O tablet já possui o runtime local W15. Registration/session remotas continuam fail-closed até provisioning do teste físico.",
            )
            KeyValue("Ambiente", state.device.environment)
            KeyValue("Presence", state.device.visibility)
            KeyValue("Session", state.device.registrationStatus)
            KeyValue("Build", state.device.buildSha)
            LuminousCallout(
                "BOUNDARY",
                "Device session/trust e Android permission são preconditions; não são business/action authority.",
                SemanticTone.VERIFIED,
            )
        }
        OnboardingStep.VOICE_AUDIO -> {
            Heading(
                "Voice & Audio",
                "Nesta V1, voz funciona por tap-to-talk. Wake contínuo permanece desativado até a camada final de runtime/privacidade.",
            )
            Button(
                onClick = onVoice,
                modifier = Modifier.semantics { contentDescription = "Testar microfone e reconhecimento de voz" },
            ) { Text("Testar microfone") }
            Text(
                "O transcript reconhecido entra na mesma conversa e nunca vira authority por causa de confiança de fala.",
                color = TextSecondary,
            )
        }
        OnboardingStep.PERMISSIONS -> {
            Heading(
                "Permissões just-in-time",
                "A primeira APK pede apenas o necessário para conectividade e tap-to-talk. Outras permissões surgem quando uma capability realmente depender delas.",
            )
            PermissionRow("Internet", "Conectividade do device-plane", granted = true)
            PermissionRow("Network state", "Mostrar online/offline/degraded", granted = true)
            PermissionRow(
                "Microfone",
                "Tap-to-talk",
                granted = LocalContext.current.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED,
            )
        }
        OnboardingStep.READY -> {
            Heading(
                "Pronta",
                "Pergunte algo à Aurora. A home começa em Presence, não em um dashboard obrigatório.",
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                AuroraCore(AuroraPresenceMode.PRESENT, state.settings.reducedMotion, 96.dp)
                Column {
                    Text("Pergunte algo à Aurora", fontSize = 21.sp, fontWeight = FontWeight.SemiBold)
                    Text("Texto ou voz · workspace sob demanda", color = TextSecondary)
                }
            }
        }
    }
}

@Composable
private fun PermissionRow(title: String, detail: String, granted: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(if (granted) Verified else Approval))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.Medium)
            Text(detail, color = TextSecondary, fontSize = 12.sp)
        }
        SmallBadge(
            if (granted) "AVAILABLE" else "JUST-IN-TIME",
            if (granted) SemanticTone.VERIFIED else SemanticTone.APPROVAL,
        )
    }
}

@Composable
internal fun TopBar(state: AuroraUiState, onIntent: (AuroraUiIntent) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(64.dp)
            .padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(20.dp)
                .clip(CircleShape)
                .background(presenceColor(state.presence).copy(alpha = 0.2f)),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(presenceColor(state.presence)))
        }
        Text("AURORA", fontSize = 17.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 4.sp)
        SmallBadge(state.presence.name.replace('_', ' '), presenceTone(state.presence))
        Spacer(Modifier.weight(1f))
        SmallBadge(state.device.environment, SemanticTone.INFO)
        SmallBadge(
            state.connectivity.label,
            if (state.connectivity.online) SemanticTone.VERIFIED else SemanticTone.CRITICAL,
        )
        TextButton(onClick = { onIntent(AuroraUiIntent.OpenSurface(UiSurface.SETTINGS)) }) {
            Text("Ajustes")
        }
    }
}

@Composable
internal fun ConversationPane(
    state: AuroraUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()
    LaunchedEffect(state.conversation.size) {
        if (state.conversation.isNotEmpty()) listState.animateScrollToItem(state.conversation.lastIndex)
    }
    Column(
        modifier = modifier
            .background(SurfaceDark.copy(alpha = 0.72f))
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            AuroraCore(state.presence, state.settings.reducedMotion, 68.dp)
            Column(modifier = Modifier.weight(1f)) {
                Text(presenceHeadline(state.presence), fontWeight = FontWeight.SemiBold, fontSize = 17.sp)
                Text(presenceSubhead(state), color = TextSecondary, fontSize = 12.sp)
            }
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            item { SmallBadge("LIVE runtime", SemanticTone.VERIFIED) }
            item { SmallBadge(state.device.environment, SemanticTone.INFO) }
            if (state.workspaceOpen) item { SmallBadge(state.selectedView.displayTitle, SemanticTone.REASONING) }
        }
        HorizontalDivider(color = Outline)
        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            contentPadding = PaddingValues(vertical = 6.dp),
        ) {
            items(state.conversation, key = { it.id }) { turn -> ConversationBubble(turn) }
            if (state.listening) {
                item {
                    LuminousCallout(
                        "LISTENING",
                        state.partialTranscript.ifBlank { "Estou ouvindo…" },
                        SemanticTone.INFO,
                    )
                }
            }
        }
        CommandInput(state, onIntent, onVoice)
    }
}

@Composable
private fun ConversationBubble(turn: ConversationTurn) {
    val user = turn.role == ConversationRole.USER
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (user) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 520.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(if (user) ElectricBlue.copy(alpha = 0.20f) else SurfaceRaised)
                .border(1.dp, if (user) ElectricBlue.copy(alpha = 0.38f) else Outline, RoundedCornerShape(18.dp))
                .padding(13.dp),
        ) {
            Text(
                if (user) "VOCÊ" else "AURORA",
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
private fun CommandInput(
    state: AuroraUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
) {
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
            shape = RoundedCornerShape(18.dp),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Button(
                onClick = { onIntent(AuroraUiIntent.SubmitText(state.inputDraft)) },
                enabled = state.inputDraft.isNotBlank(),
                modifier = Modifier.weight(1f),
            ) { Text("Enviar") }
            OutlinedButton(
                onClick = onVoice,
                modifier = Modifier.semantics {
                    contentDescription = if (state.listening) "Aurora está ouvindo" else "Falar com a Aurora"
                },
            ) { Text(if (state.listening) "Ouvindo…" else "Falar") }
        }
    }
}

@Composable
internal fun PresenceFocus(
    state: AuroraUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        AuroraCore(state.presence, state.settings.reducedMotion, 220.dp)
        Spacer(Modifier.height(24.dp))
        Text(
            presenceHeadline(state.presence),
            fontSize = 28.sp,
            fontWeight = FontWeight.Light,
            textAlign = TextAlign.Center,
        )
        Text(
            "Conversa primeiro. A visualização aparece apenas quando ajuda.",
            color = TextSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )
        Spacer(Modifier.height(26.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(onClick = onVoice) { Text("Falar") }
            OutlinedButton(onClick = { onIntent(AuroraUiIntent.OpenSurface(UiSurface.CONVERSATION)) }) {
                Text("Digitar")
            }
        }
        Spacer(Modifier.height(30.dp))
        Text("EXPERIMENTE", color = TextSecondary, fontSize = 12.sp, letterSpacing = 1.2.sp)
        Spacer(Modifier.height(10.dp))
        QuickPrompts(onIntent)
    }
}

@Composable
private fun QuickPrompts(onIntent: (AuroraUiIntent) -> Unit) {
    val prompts = listOf(
        "O que merece minha atenção hoje?",
        "Mostre o que a Aurora pode fazer",
        "Abra Devices e mostre o runtime",
        "Mostre Evidence e explique o que está verificado",
        "Compare Meta Ads e Google Ads",
        "Abra CRM / Revenue",
    )
    LazyRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        contentPadding = PaddingValues(horizontal = 4.dp),
    ) {
        items(prompts) { prompt ->
            Card(
                modifier = Modifier
                    .width(220.dp)
                    .clickable { onIntent(AuroraUiIntent.SubmitText(prompt)) },
                colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.86f)),
                border = androidx.compose.foundation.BorderStroke(1.dp, Outline),
                shape = RoundedCornerShape(18.dp),
            ) {
                Text(prompt, modifier = Modifier.padding(15.dp), fontSize = 13.sp, lineHeight = 18.sp)
            }
        }
    }
}

@Composable
internal fun WorkspacePane(state: AuroraUiState, onIntent: (AuroraUiIntent) -> Unit) {
    val manifest = state.manifest
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        WorkspaceSelector(state.selectedView, onIntent)
        if (manifest == null) {
            EmptyState(
                "Nenhum workspace aberto",
                "Peça pela conversa: “mostre capabilities”, “abra Devices”, “compare campanhas”…",
            )
        } else {
            WorkspaceHeader(manifest, onIntent)
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(bottom = 24.dp),
            ) {
                items(manifest.components.size) { index -> ComponentRenderer(manifest.components[index]) }
                if (manifest.safeActions.isNotEmpty()) {
                    item { ActionRow(manifest, onIntent) }
                }
            }
        }
    }
}

@Composable
private fun WorkspaceSelector(selected: WorkspaceViewType, onIntent: (AuroraUiIntent) -> Unit) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(7.dp), contentPadding = PaddingValues(vertical = 2.dp)) {
        items(WorkspaceViewType.entries) { type ->
            val active = type == selected
            Text(
                text = type.displayTitle,
                modifier = Modifier
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (active) Ultraviolet.copy(alpha = 0.24f) else SurfaceDark.copy(alpha = 0.72f))
                    .border(1.dp, if (active) Ultraviolet else Outline, RoundedCornerShape(14.dp))
                    .clickable { onIntent(AuroraUiIntent.OpenDynamicView(type)) }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                color = if (active) TextPrimary else TextSecondary,
                fontSize = 11.sp,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun WorkspaceHeader(manifest: DynamicViewManifest, onIntent: (AuroraUiIntent) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                item { SmallBadge(manifest.viewType.domain, SemanticTone.INFO) }
                item { SmallBadge(manifest.provenance.name.replace('_', ' '), provenanceTone(manifest.provenance)) }
                item { SmallBadge(manifest.freshness.name, freshnessTone(manifest.freshness)) }
            }
            Spacer(Modifier.height(8.dp))
            Text(manifest.title, fontSize = 26.sp, fontWeight = FontWeight.SemiBold)
            Text(manifest.subtitle, color = TextSecondary, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
        }
        TextButton(onClick = { onIntent(AuroraUiIntent.CloseWorkspace) }) { Text("Recolher") }
    }
}

@Composable
private fun ActionRow(manifest: DynamicViewManifest, onIntent: (AuroraUiIntent) -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.84f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, Outline),
        shape = RoundedCornerShape(20.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                "AÇÕES SEGURAS / REQUESTS",
                color = TextSecondary,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.2.sp,
            )
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(manifest.safeActions) { action ->
                    OutlinedButton(
                        onClick = {
                            when {
                                action.contains("evidence", ignoreCase = true) -> onIntent(AuroraUiIntent.OpenEvidence)
                                action.contains("approval", ignoreCase = true) -> onIntent(AuroraUiIntent.ReviewApproval())
                                action.contains("cancel", ignoreCase = true) -> onIntent(AuroraUiIntent.RequestCancellation(manifest.viewId))
                                else -> onIntent(AuroraUiIntent.SubmitText("$action em ${manifest.title}"))
                            }
                        },
                    ) { Text(action) }
                }
            }
        }
    }
}

@Composable
internal fun InspectorRail(
    manifest: DynamicViewManifest?,
    onIntent: (AuroraUiIntent) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (manifest == null) return
    Column(
        modifier = modifier
            .background(SurfaceDark.copy(alpha = 0.72f))
            .verticalScroll(rememberScrollState())
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text("INSPECTOR", color = TextSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp)
        Text(manifest.title, fontWeight = FontWeight.SemiBold)
        KeyValue("Schema", manifest.schemaVersion)
        KeyValue("View", manifest.viewType.name)
        KeyValue("Presentation", manifest.presentation.name)
        KeyValue("Freshness", manifest.freshness.name)
        KeyValue("Provenance", manifest.provenance.name)
        KeyValue("Risk", manifest.risk.name)
        HorizontalDivider(color = Outline)
        Text(
            "A UI apresenta projections e envia requests. Truth, policy, authority e execução permanecem nos owners canônicos.",
            color = TextSecondary,
            fontSize = 12.sp,
            lineHeight = 18.sp,
        )
        OutlinedButton(onClick = { onIntent(AuroraUiIntent.OpenEvidence) }, modifier = Modifier.fillMaxWidth()) {
            Text("Abrir Evidence")
        }
    }
}

@Composable
internal fun HumanControlPane(state: AuroraUiState, onIntent: (AuroraUiIntent) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(26.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Heading(
            "Human Control",
            "Approval, modify, deny e step-up ficam em superfície própria. Nesta V1, sem projection de approval, o fluxo é explicitamente request-only.",
        )
        SmallBadge("REQUEST ONLY", SemanticTone.APPROVAL)
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
                    "Os botões abaixo registram somente interação de preview. Execution revalidará current policy/authority quando o binding real existir.",
                    SemanticTone.APPROVAL,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = { onIntent(AuroraUiIntent.SubmitHumanDecision("DENY")) }) { Text("Negar") }
                    OutlinedButton(onClick = { onIntent(AuroraUiIntent.SubmitHumanDecision("MODIFY")) }) { Text("Modificar") }
                    Button(onClick = { onIntent(AuroraUiIntent.SubmitHumanDecision("APPROVE")) }) { Text("Aprovar request") }
                }
            }
        }
        LuminousCallout(
            "STEP-UP AUTHENTICATION",
            "A surface está reservada no design; biometric/passkey será ativado quando o owner de decisão exigir step-up.",
            SemanticTone.INFO,
        )
    }
}

@Composable
internal fun EvidencePane(state: AuroraUiState, onIntent: (AuroraUiIntent) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(26.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Heading(
            "Evidence",
            "Receipt, readback e evidence permanecem distintos. A UI nunca converte ACK em sucesso.",
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item { SmallBadge("CORRELATION ${state.evidence.correlationId}", SemanticTone.INFO) }
            item { SmallBadge("NO CoT", SemanticTone.VERIFIED) }
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatusMiniCard("Receipt / ACK", state.evidence.receiptStatus, SemanticTone.INFO, Modifier.weight(1f))
            StatusMiniCard("Readback", state.evidence.readbackStatus, SemanticTone.VERIFIED, Modifier.weight(1f))
        }
        Card(
            colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.88f)),
            border = androidx.compose.foundation.BorderStroke(1.dp, Outline),
            shape = RoundedCornerShape(22.dp),
        ) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("Evidence Timeline", fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                state.evidence.events.forEachIndexed { index, event ->
                    TimelineRow(index == state.evidence.events.lastIndex, event.label, event.detail, event.tone)
                }
            }
        }
        LuminousCallout(
            "EXECUTION_UNCERTAIN",
            "Se uma ação externa tiver sido enviada e o outcome não for conclusivo, a ação principal será reconciliation/readback — nunca blind retry.",
            SemanticTone.CRITICAL,
        )
        TextButton(onClick = { onIntent(AuroraUiIntent.OpenSurface(UiSurface.CONVERSATION)) }) {
            Text("Voltar à conversa")
        }
    }
}

@Composable
internal fun SettingsPane(
    state: AuroraUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(26.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Heading(
            "Settings",
            "Preferências locais, privacidade, accessibility, voice, device/session e ambiente. Settings não alteram policy/authority.",
        )
        SettingsSection("Accessibility") {
            SettingToggle("Reduced motion", "Mesma semântica sem animação espacial.", state.settings.reducedMotion) {
                onIntent(AuroraUiIntent.SetReducedMotion(it))
            }
            SettingToggle("High contrast", "Aumenta contraste de surfaces e labels.", state.settings.highContrast) {
                onIntent(AuroraUiIntent.SetHighContrast(it))
            }
            SettingToggle("Captions", "Mantém transcript e feedback textual disponível.", state.settings.captionsEnabled) {
                onIntent(AuroraUiIntent.SetCaptions(it))
            }
        }
        SettingsSection("Privacy & Voice") {
            SettingToggle("Privacy mode", "Bloqueia captura de voz nesta V1.", state.settings.privacyMode) {
                onIntent(AuroraUiIntent.SetPrivacyMode(it))
            }
            SettingToggle("Wake preference", "Preferência visual apenas; escuta contínua ainda não é ativada.", state.settings.wakePreferenceEnabled) {
                onIntent(AuroraUiIntent.SetWakePreference(it))
            }
            OutlinedButton(onClick = onVoice) { Text("Testar tap-to-talk") }
        }
        SettingsSection("Device & Session") {
            KeyValue("Environment", state.device.environment)
            KeyValue("Presence", state.device.visibility)
            KeyValue("Local service", state.device.localServicePhase)
            KeyValue("Session", state.device.registrationStatus)
            KeyValue("Network", state.connectivity.label)
            LuminousCallout(
                "DP5",
                "O adapter W15-J está no APK. A sessão remota depende de provisioning físico e evidence real; a interface não cria DeviceId ou gateway credential.",
                SemanticTone.INFO,
            )
        }
        SettingsSection("About / Environment") {
            KeyValue("Version", ai.aurora.device.BuildConfig.VERSION_NAME)
            KeyValue("Build SHA", ai.aurora.device.BuildConfig.AURORA_BUILD_SHA)
            KeyValue("UI profile", ai.aurora.device.BuildConfig.AURORA_UI_PROFILE)
            KeyValue("Application", ai.aurora.device.BuildConfig.APPLICATION_ID)
            Text("Sem secrets, credentials ou tenant topology nesta tela.", color = TextSecondary, fontSize = 12.sp)
        }
    }
}

@Composable
private fun SettingsSection(title: String, content: @Composable ColumnScope.() -> Unit) {
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
private fun SettingToggle(
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

@Composable
internal fun SupportNavigation(surface: UiSurface, onIntent: (AuroraUiIntent) -> Unit) {
    val navigationItems = listOf(
        UiSurface.PRESENCE to "Aurora",
        UiSurface.WORKSPACE to "Workspace",
        UiSurface.HUMAN_CONTROL to "Control",
        UiSurface.EVIDENCE to "Evidence",
        UiSurface.SETTINGS to "Settings",
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(54.dp)
            .background(SurfaceDark.copy(alpha = 0.9f))
            .padding(horizontal = 12.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        navigationItems.forEach { (target, label) ->
            val active = surface == target || (surface == UiSurface.CONVERSATION && target == UiSurface.PRESENCE)
            TextButton(onClick = { onIntent(AuroraUiIntent.OpenSurface(target)) }) {
                Text(label, color = if (active) AuroraCyan else TextSecondary, fontSize = 12.sp)
            }
        }
    }
}

@Composable
internal fun ComponentRenderer(component: AuroraUiComponent) {
    when (component) {
        is AuroraUiComponent.Metric -> MetricCard(component)
        is AuroraUiComponent.Status -> StatusCard(component)
        is AuroraUiComponent.ListBlock -> ListBlock(component)
        is AuroraUiComponent.Recommendation -> RecommendationCard(component)
        is AuroraUiComponent.Timeline -> TimelineBlock(component)
        is AuroraUiComponent.Table -> TableBlock(component)
        is AuroraUiComponent.Graph -> GraphBlock(component)
        is AuroraUiComponent.TextBlock -> LuminousCallout(component.title, component.body, component.tone)
    }
}

@Composable
private fun MetricCard(metric: AuroraUiComponent.Metric) {
    Card(
        colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.88f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, toneColor(metric.tone).copy(alpha = 0.28f)),
        shape = RoundedCornerShape(22.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(metric.label, color = TextSecondary, fontSize = 11.sp, letterSpacing = 0.8.sp)
                Text(metric.value, fontSize = 28.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 3.dp))
                Text(metric.caption, color = TextSecondary, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
            }
            Box(Modifier.size(12.dp).clip(CircleShape).background(toneColor(metric.tone)))
        }
    }
}

@Composable
private fun StatusCard(status: AuroraUiComponent.Status) {
    Card(
        colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.88f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, Outline),
        shape = RoundedCornerShape(20.dp),
    ) {
        Column(modifier = Modifier.padding(17.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(status.label, color = TextSecondary, fontSize = 11.sp)
                SmallBadge(status.value, status.tone)
            }
            Text(status.detail, fontSize = 14.sp, lineHeight = 20.sp)
        }
    }
}

@Composable
private fun ListBlock(block: AuroraUiComponent.ListBlock) {
    Card(
        colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.88f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, Outline),
        shape = RoundedCornerShape(20.dp),
    ) {
        Column(modifier = Modifier.padding(17.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Text(block.title, fontWeight = FontWeight.SemiBold)
            block.items.forEach { item ->
                Row(horizontalArrangement = Arrangement.spacedBy(9.dp), verticalAlignment = Alignment.Top) {
                    Box(Modifier.padding(top = 7.dp).size(6.dp).clip(CircleShape).background(toneColor(block.tone)))
                    Text(item, color = TextSecondary, fontSize = 13.sp, lineHeight = 18.sp)
                }
            }
        }
    }
}

@Composable
private fun RecommendationCard(card: AuroraUiComponent.Recommendation) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Ultraviolet.copy(alpha = 0.10f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, Ultraviolet.copy(alpha = 0.44f)),
        shape = RoundedCornerShape(22.dp),
    ) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Text("RECOMMENDATION", color = Ultraviolet, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
            Text(card.title, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
            Text(card.body, fontSize = 14.sp, lineHeight = 20.sp)
            Text(card.reason, color = TextSecondary, fontSize = 12.sp, lineHeight = 17.sp)
        }
    }
}

@Composable
private fun TimelineBlock(block: AuroraUiComponent.Timeline) {
    Card(
        colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.88f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, Outline),
        shape = RoundedCornerShape(20.dp),
    ) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(block.title, fontWeight = FontWeight.SemiBold)
            block.events.forEachIndexed { index, event ->
                TimelineRow(index == block.events.lastIndex, event.label, event.detail, event.tone)
            }
        }
    }
}

@Composable
private fun TimelineRow(last: Boolean, label: String, detail: String, tone: SemanticTone) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(10.dp).clip(CircleShape).background(toneColor(tone)))
            if (!last) Box(Modifier.width(1.dp).height(36.dp).background(Outline))
        }
        Column(modifier = Modifier.padding(bottom = 4.dp)) {
            Text(label, fontWeight = FontWeight.Medium, fontSize = 13.sp)
            Text(detail, color = TextSecondary, fontSize = 12.sp, lineHeight = 17.sp)
        }
    }
}

@Composable
private fun TableBlock(table: AuroraUiComponent.Table) {
    Card(
        colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.88f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, Outline),
        shape = RoundedCornerShape(20.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Text(table.title, fontWeight = FontWeight.SemiBold)
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(SurfaceRaised, RoundedCornerShape(10.dp))
                    .padding(9.dp),
            ) {
                table.columns.forEach {
                    Text(it, modifier = Modifier.weight(1f), color = TextSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }
            table.rows.forEach { row ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 9.dp, vertical = 7.dp)) {
                    table.columns.indices.forEach { index ->
                        Text(
                            row.getOrElse(index) { "—" },
                            modifier = Modifier.weight(1f),
                            fontSize = 12.sp,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                HorizontalDivider(color = Outline.copy(alpha = 0.55f))
            }
        }
    }
}

@Composable
private fun GraphBlock(graph: AuroraUiComponent.Graph) {
    Card(
        colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.88f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, Outline),
        shape = RoundedCornerShape(20.dp),
    ) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(graph.title, fontWeight = FontWeight.SemiBold)
            graph.nodes.forEachIndexed { index, node ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(toneColor(node.tone)))
                    Text(node.label, modifier = Modifier.weight(1f), fontWeight = FontWeight.Medium)
                    SmallBadge(node.state, node.tone)
                }
                if (index != graph.nodes.lastIndex) Text("↓", color = Outline)
            }
            Text("Edges: ${graph.edges.size} · representação V1 bounded", color = TextSecondary, fontSize = 11.sp)
        }
    }
}

@Composable
private fun StatusMiniCard(
    title: String,
    value: String,
    tone: SemanticTone,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.88f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, toneColor(tone).copy(alpha = 0.34f)),
        shape = RoundedCornerShape(18.dp),
    ) {
        Column(modifier = Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, color = TextSecondary, fontSize = 11.sp)
            Text(value, fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 18.sp)
        }
    }
}

private fun presenceSubhead(state: AuroraUiState): String = when (state.presence) {
    AuroraPresenceMode.OFFLINE -> "Local-only / queue-safe / unavailable ficam distintos"
    AuroraPresenceMode.EXECUTION_UNCERTAIN -> "Reconcile before retry"
    AuroraPresenceMode.WAITING_APPROVAL -> "Human Control é uma fronteira própria"
    AuroraPresenceMode.LISTENING -> state.partialTranscript.ifBlank { "Tap-to-talk ativo" }
    else -> "${state.connectivity.label} · ${state.device.environment} · ${state.device.visibility}"
}
