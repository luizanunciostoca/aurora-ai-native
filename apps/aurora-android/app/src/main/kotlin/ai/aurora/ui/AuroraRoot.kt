package ai.aurora.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DarkColorScheme
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import ai.aurora.ui.model.AuroraPresenceMode
import ai.aurora.ui.model.AuroraSettings
import ai.aurora.ui.model.AuroraUiComponent
import ai.aurora.ui.model.AuroraUiIntent
import ai.aurora.ui.model.AuroraUiState
import ai.aurora.ui.model.ConversationRole
import ai.aurora.ui.model.ConversationTurn
import ai.aurora.ui.model.DynamicViewManifest
import ai.aurora.ui.model.OnboardingStep
import ai.aurora.ui.model.PresentationMode
import ai.aurora.ui.model.ProjectionFreshness
import ai.aurora.ui.model.ProjectionProvenance
import ai.aurora.ui.model.RiskBand
import ai.aurora.ui.model.SemanticTone
import ai.aurora.ui.model.UiSurface
import ai.aurora.ui.model.WorkspaceViewType
import kotlinx.coroutines.delay

private val Night = Color(0xFF02060D)
private val SurfaceDark = Color(0xFF071523)
private val SurfaceRaised = Color(0xFF0B1D2F)
private val AuroraCyan = Color(0xFF32E8FF)
private val ElectricBlue = Color(0xFF358BFF)
private val Ultraviolet = Color(0xFF835BFF)
private val Verified = Color(0xFF46E6B4)
private val Approval = Color(0xFFFFB547)
private val Critical = Color(0xFFFF5D73)
private val TextPrimary = Color(0xFFF4F8FF)
private val TextSecondary = Color(0xFFA8B8C9)
private val Outline = Color(0xFF18334C)

@Composable
fun AuroraRoot(viewModel: AuroraRootViewModel = viewModel()) {
    val state by viewModel.state.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current
    val voiceController = remember(context, viewModel) {
        VoiceCaptureController(
            context = context,
            onListening = { viewModel.onIntent(AuroraUiIntent.VoiceListening) },
            onPartial = { viewModel.onIntent(AuroraUiIntent.VoicePartial(it)) },
            onResult = { viewModel.onIntent(AuroraUiIntent.VoiceResult(it)) },
            onError = { viewModel.onIntent(AuroraUiIntent.VoiceError(it)) },
        )
    }
    DisposableEffect(voiceController) {
        onDispose { voiceController.close() }
    }
    val microphoneLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            viewModel.onIntent(AuroraUiIntent.StartVoice)
            voiceController.start()
        } else {
            viewModel.onIntent(AuroraUiIntent.VoiceError("Permissão de microfone negada. Você pode continuar usando texto."))
        }
    }
    val startVoice: () -> Unit = {
        if (state.settings.privacyMode) {
            viewModel.onIntent(AuroraUiIntent.VoiceError("Voice está bloqueado enquanto o modo de privacidade estiver ativo."))
        } else if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            viewModel.onIntent(AuroraUiIntent.StartVoice)
            voiceController.start()
        } else {
            microphoneLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    LaunchedEffect(Unit) {
        while (true) {
            viewModel.refreshRuntime()
            delay(1_000)
        }
    }

    AuroraTheme(state.settings) {
        Surface(modifier = Modifier.fillMaxSize(), color = Night) {
            AuroraBackdrop {
                if (!state.onboardingComplete) {
                    OnboardingFlow(
                        state = state,
                        onIntent = viewModel::onIntent,
                        onVoice = startVoice,
                    )
                } else {
                    AuroraShell(
                        state = state,
                        onIntent = viewModel::onIntent,
                        onVoice = startVoice,
                    )
                }
            }
        }
    }
}

@Composable
private fun AuroraTheme(settings: AuroraSettings, content: @Composable () -> Unit) {
    val scheme: DarkColorScheme = darkColorScheme(
        primary = AuroraCyan,
        onPrimary = Night,
        secondary = ElectricBlue,
        onSecondary = TextPrimary,
        tertiary = Ultraviolet,
        background = Night,
        onBackground = TextPrimary,
        surface = SurfaceDark,
        onSurface = TextPrimary,
        surfaceVariant = SurfaceRaised,
        onSurfaceVariant = if (settings.highContrast) Color.White else TextSecondary,
        error = Critical,
        onError = Night,
        outline = if (settings.highContrast) Color(0xFF4E718E) else Outline,
    )
    MaterialTheme(colorScheme = scheme, content = content)
}

@Composable
private fun AuroraBackdrop(content: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(Color(0xFF0B1930), Night, Color(0xFF01040A)),
                    center = Offset(500f, 240f),
                    radius = 1_300f,
                ),
            ),
    ) {
        content()
    }
}

@Composable
private fun OnboardingFlow(
    state: AuroraUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
) {
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val wide = maxWidth >= 840.dp
        Row(
            modifier = Modifier.fillMaxSize().padding(if (wide) 48.dp else 20.dp),
            horizontalArrangement = Arrangement.spacedBy(28.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (wide) {
                Column(
                    modifier = Modifier.weight(0.42f),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    AuroraCore(
                        mode = if (state.onboardingStep == OnboardingStep.READY) AuroraPresenceMode.PRESENT else AuroraPresenceMode.AWAKEN,
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
                modifier = Modifier.weight(if (wide) 0.58f else 1f).widthIn(max = 720.dp),
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
            Heading("A interface é a própria Aurora", "Você não precisa aprender uma árvore de menus. Diga o que quer; a interface cresce apenas quando ajuda a compreender, decidir ou agir.")
            LuminousCallout(
                title = "Privacy-first",
                body = "A configuração começa localmente. Permissões são solicitadas just-in-time e nunca equivalem a authority.",
                tone = SemanticTone.INFO,
            )
        }
        OnboardingStep.DEVICE_TRUST -> {
            Heading("Device Trust & Registration", "O tablet já possui o runtime local W15. Registration/session remotas continuam fail-closed até provisioning do teste físico.")
            KeyValue("Ambiente", state.device.environment)
            KeyValue("Presence", state.device.visibility)
            KeyValue("Session", state.device.registrationStatus)
            KeyValue("Build", state.device.buildSha)
            LuminousCallout(
                title = "Boundary",
                body = "Device session/trust e Android permission são preconditions; não são business/action authority.",
                tone = SemanticTone.VERIFIED,
            )
        }
        OnboardingStep.VOICE_AUDIO -> {
            Heading("Voice & Audio", "Nesta V1, voz funciona por tap-to-talk. Wake contínuo permanece desativado até a camada final de runtime/privacidade.")
            Button(onClick = onVoice, modifier = Modifier.semantics { contentDescription = "Testar microfone e reconhecimento de voz" }) {
                Text("Testar microfone")
            }
            Text(
                "O transcript reconhecido entra na mesma conversa e nunca vira authority por causa de confiança de fala.",
                color = TextSecondary,
            )
        }
        OnboardingStep.PERMISSIONS -> {
            Heading("Permissões just-in-time", "A primeira APK pede apenas o necessário para conectividade e tap-to-talk. Outras permissões surgem quando uma capability realmente depender delas.")
            PermissionRow("Internet", "Conectividade do device-plane", granted = true)
            PermissionRow("Network state", "Mostrar online/offline/degraded", granted = true)
            PermissionRow(
                "Microfone",
                "Tap-to-talk",
                granted = androidx.compose.ui.platform.LocalContext.current.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED,
            )
        }
        OnboardingStep.READY -> {
            Heading("Pronta", "Pergunte algo à Aurora. A home começa em Presence, não em um dashboard obrigatório.")
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
private fun AuroraShell(
    state: AuroraUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        TopBar(state, onIntent)
        state.globalNotice?.let { notice ->
            DegradedBanner(notice, onDismiss = { onIntent(AuroraUiIntent.ClearNotice) })
        }
        BoxWithConstraints(modifier = Modifier.weight(1f).fillMaxWidth()) {
            val wide = maxWidth >= 920.dp
            val extraWide = maxWidth >= 1_220.dp
            if (wide) {
                Row(modifier = Modifier.fillMaxSize()) {
                    ConversationPane(
                        state = state,
                        onIntent = onIntent,
                        onVoice = onVoice,
                        modifier = Modifier.width(maxWidth * 0.32f).fillMaxHeight(),
                    )
                    VerticalRule()
                    Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                        MainSurfaceContent(state, onIntent, onVoice)
                    }
                    if (extraWide && state.workspaceOpen && state.manifest != null) {
                        VerticalRule()
                        InspectorRail(
                            manifest = state.manifest,
                            onIntent = onIntent,
                            modifier = Modifier.width(270.dp).fillMaxHeight(),
                        )
                    }
                }
            } else {
                Column(modifier = Modifier.fillMaxSize()) {
                    Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                        if (state.surface in setOf(UiSurface.PRESENCE, UiSurface.CONVERSATION)) {
                            ConversationPane(state, onIntent, onVoice, Modifier.fillMaxSize())
                        } else {
                            MainSurfaceContent(state, onIntent, onVoice)
                        }
                    }
                    SupportNavigation(state.surface, onIntent)
                }
            }
        }
        if (wide) SupportNavigation(state.surface, onIntent)
    }
}

@Composable
private fun TopBar(state: AuroraUiState, onIntent: (AuroraUiIntent) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().height(64.dp).padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier.size(20.dp).clip(CircleShape).background(presenceColor(state.presence).copy(alpha = 0.2f)),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(presenceColor(state.presence)))
        }
        Text("AURORA", fontSize = 17.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 4.sp)
        SemanticStatusChip(state.presence.name.replace('_', ' '), presenceTone(state.presence))
        Spacer(Modifier.weight(1f))
        SmallBadge(state.device.environment, SemanticTone.INFO)
        SmallBadge(state.connectivity.label, if (state.connectivity.online) SemanticTone.VERIFIED else SemanticTone.CRITICAL)
        TextButton(onClick = { onIntent(AuroraUiIntent.OpenSurface(UiSurface.SETTINGS)) }) {
            Text("Ajustes")
        }
    }
}

@Composable
private fun ConversationPane(
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
        modifier = modifier.background(SurfaceDark.copy(alpha = 0.72f)).padding(18.dp),
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
            modifier = Modifier.weight(1f).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            contentPadding = PaddingValues(vertical = 6.dp),
        ) {
            items(state.conversation, key = { it.id }) { turn -> ConversationBubble(turn) }
            if (state.listening) {
                item {
                    LuminousCallout(
                        title = "LISTENING",
                        body = state.partialTranscript.ifBlank { "Estou ouvindo…" },
                        tone = SemanticTone.INFO,
                    )
                }
            }
        }
        CommandInput(state, onIntent, onVoice)
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
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Campo de conversa com a Aurora" },
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
                modifier = Modifier.semantics { contentDescription = if (state.listening) "Aurora está ouvindo" else "Falar com a Aurora" },
            ) {
                Text(if (state.listening) "Ouvindo…" else "Falar")
            }
        }
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
            Text(if (user) "VOCÊ" else "AURORA", color = if (user) ElectricBlue else AuroraCyan, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp)
            Spacer(Modifier.height(5.dp))
            Text(turn.text, fontSize = 14.sp, lineHeight = 20.sp)
            Spacer(Modifier.height(7.dp))
            Text(turn.provenance.name.replace('_', ' '), color = TextSecondary, fontSize = 9.sp)
        }
    }
}

@Composable
private fun MainSurfaceContent(
    state: AuroraUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
) {
    when (state.surface) {
        UiSurface.PRESENCE,
        UiSurface.CONVERSATION,
        -> PresenceFocus(state, onIntent, onVoice)
        UiSurface.WORKSPACE -> WorkspacePane(state, onIntent)
        UiSurface.HUMAN_CONTROL -> HumanControlPane(state, onIntent)
        UiSurface.EVIDENCE -> EvidencePane(state, onIntent)
        UiSurface.SETTINGS -> SettingsPane(state, onIntent, onVoice)
    }
}

@Composable
private fun PresenceFocus(
    state: AuroraUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        AuroraCore(state.presence, state.settings.reducedMotion, 220.dp)
        Spacer(Modifier.height(24.dp))
        Text(presenceHeadline(state.presence), fontSize = 28.sp, fontWeight = FontWeight.Light, textAlign = TextAlign.Center)
        Text(
            "Conversa primeiro. A visualização aparece apenas quando ajuda.",
            color = TextSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )
        Spacer(Modifier.height(26.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(onClick = onVoice) { Text("Falar") }
            OutlinedButton(onClick = { onIntent(AuroraUiIntent.OpenSurface(UiSurface.CONVERSATION)) }) { Text("Digitar") }
        }
        Spacer(Modifier.height(30.dp))
        Text("Experimente", color = TextSecondary, fontSize = 12.sp, letterSpacing = 1.2.sp)
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
                modifier = Modifier.width(220.dp).clickable { onIntent(AuroraUiIntent.SubmitText(prompt)) },
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
private fun WorkspacePane(state: AuroraUiState, onIntent: (AuroraUiIntent) -> Unit) {
    val manifest = state.manifest
    Column(modifier = Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        WorkspaceSelector(state.selectedView, onIntent)
        if (manifest == null) {
            EmptyState(
                title = "Nenhum workspace aberto",
                body = "Peça pela conversa: “mostre capabilities”, “abra Devices”, “compare campanhas”…",
            )
        } else {
            WorkspaceHeader(manifest, onIntent)
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(bottom = 24.dp),
            ) {
                items(manifest.components.size) { index ->
                    ComponentRenderer(manifest.components[index])
                }
                item {
                    if (manifest.safeActions.isNotEmpty()) {
                        ActionRow(manifest, onIntent)
                    }
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
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Column(modifier = Modifier.weight(1f)) {
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                SmallBadge(manifest.viewType.domain, SemanticTone.INFO)
                SmallBadge(manifest.provenance.name.replace('_', ' '), provenanceTone(manifest.provenance))
                SmallBadge(manifest.freshness.name, freshnessTone(manifest.freshness))
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
            Text("AÇÕES SEGURAS / REQUESTS", color = TextSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(manifest.safeActions) { action ->
                    OutlinedButton(onClick = {
                        when {
                            action.contains("evidence", ignoreCase = true) -> onIntent(AuroraUiIntent.OpenEvidence)
                            action.contains("approval", ignoreCase = true) -> onIntent(AuroraUiIntent.ReviewApproval())
                            action.contains("cancel", ignoreCase = true) -> onIntent(AuroraUiIntent.RequestCancellation(manifest.viewId))
                            else -> onIntent(AuroraUiIntent.SubmitText("$action em ${manifest.title}"))
                        }
                    }) { Text(action) }
                }
            }
        }
    }
}

@Composable
private fun InspectorRail(
    manifest: DynamicViewManifest?,
    onIntent: (AuroraUiIntent) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (manifest == null) return
    Column(
        modifier = modifier.background(SurfaceDark.copy(alpha = 0.72f)).verticalScroll(rememberScrollState()).padding(18.dp),
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
        Text("A UI apresenta projections e envia requests. Truth, policy, authority e execução permanecem nos owners canônicos.", color = TextSecondary, fontSize = 12.sp, lineHeight = 18.sp)
        OutlinedButton(onClick = { onIntent(AuroraUiIntent.OpenEvidence) }, modifier = Modifier.fillMaxWidth()) {
            Text("Abrir Evidence")
        }
    }
}

@Composable
private fun HumanControlPane(state: AuroraUiState, onIntent: (AuroraUiIntent) -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(26.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Heading("Human Control", "Approval, modify, deny e step-up ficam em superfície própria. Nesta V1, sem projection de approval, o fluxo é explicitamente request-only.")
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
                    title = "Sem authority local",
                    body = "Os botões abaixo registram somente interação de preview. Execution revalidará current policy/authority quando o binding real existir.",
                    tone = SemanticTone.APPROVAL,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = { onIntent(AuroraUiIntent.SubmitHumanDecision("DENY")) }) { Text("Negar") }
                    OutlinedButton(onClick = { onIntent(AuroraUiIntent.SubmitHumanDecision("MODIFY")) }) { Text("Modificar") }
                    Button(onClick = { onIntent(AuroraUiIntent.SubmitHumanDecision("APPROVE")) }) { Text("Aprovar request") }
                }
            }
        }
        LuminousCallout(
            title = "Step-up Authentication",
            body = "A surface está reservada no design; biometric/passkey será ativado quando o owner de decisão exigir step-up.",
            tone = SemanticTone.INFO,
        )
    }
}

@Composable
private fun EvidencePane(state: AuroraUiState, onIntent: (AuroraUiIntent) -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(26.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Heading("Evidence", "Receipt, readback e evidence permanecem distintos. A UI nunca converte ACK em sucesso.")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SmallBadge("CORRELATION ${state.evidence.correlationId}", SemanticTone.INFO)
            SmallBadge("NO CoT", SemanticTone.VERIFIED)
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
            title = "EXECUTION_UNCERTAIN",
            body = "Se uma ação externa tiver sido enviada e o outcome não for conclusivo, a ação principal será reconciliation/readback — nunca blind retry.",
            tone = SemanticTone.CRITICAL,
        )
        TextButton(onClick = { onIntent(AuroraUiIntent.OpenSurface(UiSurface.CONVERSATION)) }) { Text("Voltar à conversa") }
    }
}

@Composable
private fun SettingsPane(
    state: AuroraUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(26.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Heading("Settings", "Preferências locais, privacidade, accessibility, voice, device/session e ambiente. Settings não alteram policy/authority.")
        SettingsSection("Accessibility") {
            SettingToggle("Reduced motion", "Mesma semântica sem animação espacial.", state.settings.reducedMotion) { onIntent(AuroraUiIntent.SetReducedMotion(it)) }
            SettingToggle("High contrast", "Aumenta contraste de surfaces e labels.", state.settings.highContrast) { onIntent(AuroraUiIntent.SetHighContrast(it)) }
            SettingToggle("Captions", "Mantém transcript e feedback textual disponível.", state.settings.captionsEnabled) { onIntent(AuroraUiIntent.SetCaptions(it)) }
        }
        SettingsSection("Privacy & Voice") {
            SettingToggle("Privacy mode", "Bloqueia captura de voz nesta V1.", state.settings.privacyMode) { onIntent(AuroraUiIntent.SetPrivacyMode(it)) }
            SettingToggle("Wake preference", "Preferência visual apenas; escuta contínua ainda não é ativada.", state.settings.wakePreferenceEnabled) { onIntent(AuroraUiIntent.SetWakePreference(it)) }
            OutlinedButton(onClick = onVoice) { Text("Testar tap-to-talk") }
        }
        SettingsSection("Device & Session") {
            KeyValue("Environment", state.device.environment)
            KeyValue("Presence", state.device.visibility)
            KeyValue("Local service", state.device.localServicePhase)
            KeyValue("Session", state.device.registrationStatus)
            KeyValue("Network", state.connectivity.label)
            LuminousCallout(
                title = "DP5",
                body = "O adapter W15-J está no APK. A sessão remota depende de provisioning físico e evidence real; a interface não cria DeviceId ou gateway credential.",
                tone = SemanticTone.INFO,
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
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.Medium)
            Text(detail, color = TextSecondary, fontSize = 12.sp)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun SupportNavigation(surface: UiSurface, onIntent: (AuroraUiIntent) -> Unit) {
    val items = listOf(
        UiSurface.PRESENCE to "Aurora",
        UiSurface.WORKSPACE to "Workspace",
        UiSurface.HUMAN_CONTROL to "Control",
        UiSurface.EVIDENCE to "Evidence",
        UiSurface.SETTINGS to "Settings",
    )
    Row(
        modifier = Modifier.fillMaxWidth().height(54.dp).background(SurfaceDark.copy(alpha = 0.9f)).padding(horizontal = 12.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.forEach { (target, label) ->
            val active = surface == target || (surface == UiSurface.CONVERSATION && target == UiSurface.PRESENCE)
            TextButton(onClick = { onIntent(AuroraUiIntent.OpenSurface(target)) }) {
                Text(label, color = if (active) AuroraCyan else TextSecondary, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun ComponentRenderer(component: AuroraUiComponent) {
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
            Row(Modifier.fillMaxWidth().background(SurfaceRaised, RoundedCornerShape(10.dp)).padding(9.dp)) {
                table.columns.forEach { Text(it, modifier = Modifier.weight(1f), color = TextSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold) }
            }
            table.rows.forEach { row ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 9.dp, vertical = 7.dp)) {
                    table.columns.indices.forEach { index ->
                        Text(row.getOrElse(index) { "—" }, modifier = Modifier.weight(1f), fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
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
                if (index != graph.nodes.lastIndex) {
                    Text("↓", color = Outline, modifier = Modifier.padding(start = 2.dp))
                }
            }
            Text("Edges: ${graph.edges.size} · representação V1 bounded", color = TextSecondary, fontSize = 11.sp)
        }
    }
}

@Composable
private fun LuminousCallout(title: String, body: String, tone: SemanticTone) {
    val color = toneColor(tone)
    Card(
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.08f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, color.copy(alpha = 0.36f)),
        shape = RoundedCornerShape(18.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, color = color, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
            Text(body, fontSize = 13.sp, lineHeight = 19.sp)
        }
    }
}

@Composable
private fun DegradedBanner(text: String, onDismiss: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().background(Approval.copy(alpha = 0.11f)).padding(horizontal = 18.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, modifier = Modifier.weight(1f), color = TextPrimary, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        TextButton(onClick = onDismiss) { Text("Fechar") }
    }
}

@Composable
private fun EmptyState(title: String, body: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
            AuroraCore(AuroraPresenceMode.DORMANT, reducedMotion = true, size = 90.dp)
            Spacer(Modifier.height(16.dp))
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
            Text(body, color = TextSecondary, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp), lineHeight = 18.sp)
        }
    }
}

@Composable
private fun Heading(title: String, body: String) {
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(title, fontSize = 25.sp, fontWeight = FontWeight.SemiBold)
        Text(body, color = TextSecondary, fontSize = 14.sp, lineHeight = 21.sp)
    }
}

@Composable
private fun KeyValue(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
        Text(label, color = TextSecondary, fontSize = 12.sp)
        Text(value, fontSize = 12.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.End, modifier = Modifier.widthIn(max = 360.dp))
    }
}

@Composable
private fun PermissionRow(title: String, detail: String, granted: Boolean) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(if (granted) Verified else Approval))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.Medium)
            Text(detail, color = TextSecondary, fontSize = 12.sp)
        }
        SmallBadge(if (granted) "AVAILABLE" else "JUST-IN-TIME", if (granted) SemanticTone.VERIFIED else SemanticTone.APPROVAL)
    }
}

@Composable
private fun StatusMiniCard(title: String, value: String, tone: SemanticTone, modifier: Modifier = Modifier) {
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

@Composable
private fun SemanticStatusChip(text: String, tone: SemanticTone) = SmallBadge(text, tone)

@Composable
private fun SmallBadge(text: String, tone: SemanticTone) {
    val color = toneColor(tone)
    Text(
        text = text,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(color.copy(alpha = 0.10f))
            .border(1.dp, color.copy(alpha = 0.30f), RoundedCornerShape(50))
            .padding(horizontal = 9.dp, vertical = 5.dp),
        color = color,
        fontSize = 9.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.7.sp,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
private fun VerticalRule() {
    Box(Modifier.fillMaxHeight().width(1.dp).background(Outline.copy(alpha = 0.72f)))
}

@Composable
private fun AuroraCore(mode: AuroraPresenceMode, reducedMotion: Boolean, size: Dp) {
    val transition = rememberInfiniteTransition(label = "aurora-core")
    val animatedPulse by transition.animateFloat(
        initialValue = 0.92f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(animation = tween(1_800), repeatMode = RepeatMode.Reverse),
        label = "aurora-pulse",
    )
    val pulse = if (reducedMotion) 1f else animatedPulse
    val color = presenceColor(mode)
    Box(
        modifier = Modifier.size(size).semantics { contentDescription = "Aurora ${mode.name.lowercase().replace('_', ' ')}" },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val radius = this.size.minDimension / 2f
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(color.copy(alpha = 0.36f), color.copy(alpha = 0.05f), Color.Transparent),
                    radius = radius,
                ),
                radius = radius * pulse,
            )
            drawCircle(color = color.copy(alpha = 0.30f), radius = radius * 0.58f * pulse)
            drawCircle(color = SurfaceRaised, radius = radius * 0.43f)
            drawCircle(color = color.copy(alpha = 0.82f), radius = radius * 0.22f)
            drawCircle(color = Color.White.copy(alpha = 0.78f), radius = radius * 0.075f)
            if (!reducedMotion && mode in setOf(AuroraPresenceMode.LISTENING, AuroraPresenceMode.EXECUTING, AuroraPresenceMode.VERIFYING)) {
                drawArc(
                    color = color,
                    startAngle = -70f,
                    sweepAngle = 170f,
                    useCenter = false,
                    topLeft = Offset(radius * 0.23f, radius * 0.23f),
                    size = androidx.compose.ui.geometry.Size(radius * 1.54f, radius * 1.54f),
                    style = androidx.compose.ui.graphics.drawscope.Stroke(width = 3f, cap = StrokeCap.Round),
                )
            }
        }
    }
}

private fun toneColor(tone: SemanticTone): Color = when (tone) {
    SemanticTone.NEUTRAL -> TextSecondary
    SemanticTone.INFO -> AuroraCyan
    SemanticTone.EXECUTION -> ElectricBlue
    SemanticTone.REASONING -> Ultraviolet
    SemanticTone.VERIFIED -> Verified
    SemanticTone.APPROVAL -> Approval
    SemanticTone.CRITICAL -> Critical
}

private fun provenanceTone(provenance: ProjectionProvenance): SemanticTone = when (provenance) {
    ProjectionProvenance.LIVE -> SemanticTone.VERIFIED
    ProjectionProvenance.CONNECTED_WHEN_AVAILABLE -> SemanticTone.INFO
    ProjectionProvenance.TARGET_PREVIEW -> SemanticTone.REASONING
}

private fun freshnessTone(freshness: ProjectionFreshness): SemanticTone = when (freshness) {
    ProjectionFreshness.CURRENT -> SemanticTone.VERIFIED
    ProjectionFreshness.STALE -> SemanticTone.APPROVAL
    ProjectionFreshness.UNKNOWN -> SemanticTone.NEUTRAL
    ProjectionFreshness.CONFLICT -> SemanticTone.CRITICAL
}

private fun presenceTone(mode: AuroraPresenceMode): SemanticTone = when (mode) {
    AuroraPresenceMode.DORMANT,
    AuroraPresenceMode.PRESENT,
    AuroraPresenceMode.AWAKEN,
    AuroraPresenceMode.LISTENING,
    -> SemanticTone.INFO
    AuroraPresenceMode.UNDERSTANDING,
    AuroraPresenceMode.RETRIEVING_CONTEXT,
    AuroraPresenceMode.REASONING,
    AuroraPresenceMode.COORDINATING,
    -> SemanticTone.REASONING
    AuroraPresenceMode.WAITING_APPROVAL -> SemanticTone.APPROVAL
    AuroraPresenceMode.EXECUTING -> SemanticTone.EXECUTION
    AuroraPresenceMode.VERIFYING -> SemanticTone.INFO
    AuroraPresenceMode.SUCCESS -> SemanticTone.VERIFIED
    AuroraPresenceMode.EXECUTION_UNCERTAIN,
    AuroraPresenceMode.DEGRADED,
    AuroraPresenceMode.OFFLINE,
    -> SemanticTone.CRITICAL
}

private fun presenceColor(mode: AuroraPresenceMode): Color = toneColor(presenceTone(mode))

private fun presenceHeadline(mode: AuroraPresenceMode): String = when (mode) {
    AuroraPresenceMode.DORMANT -> "Disponível"
    AuroraPresenceMode.PRESENT -> "Pronta"
    AuroraPresenceMode.AWAKEN -> "Estou aqui"
    AuroraPresenceMode.LISTENING -> "Ouvindo"
    AuroraPresenceMode.UNDERSTANDING -> "Entendendo"
    AuroraPresenceMode.RETRIEVING_CONTEXT -> "Buscando contexto"
    AuroraPresenceMode.REASONING -> "Analisando"
    AuroraPresenceMode.COORDINATING -> "Coordenando"
    AuroraPresenceMode.WAITING_APPROVAL -> "Aguardando decisão"
    AuroraPresenceMode.EXECUTING -> "Executando request governado"
    AuroraPresenceMode.VERIFYING -> "Verificando estado real"
    AuroraPresenceMode.SUCCESS -> "Concluído e verificado"
    AuroraPresenceMode.EXECUTION_UNCERTAIN -> "Execução incerta"
    AuroraPresenceMode.DEGRADED -> "Continuando com limitações"
    AuroraPresenceMode.OFFLINE -> "Offline"
}

private fun presenceSubhead(state: AuroraUiState): String = when (state.presence) {
    AuroraPresenceMode.OFFLINE -> "Local-only / queue-safe / unavailable ficam distintos"
    AuroraPresenceMode.EXECUTION_UNCERTAIN -> "Reconcile before retry"
    AuroraPresenceMode.WAITING_APPROVAL -> "Human Control é uma fronteira própria"
    AuroraPresenceMode.LISTENING -> state.partialTranscript.ifBlank { "Tap-to-talk ativo" }
    else -> "${state.connectivity.label} · ${state.device.environment} · ${state.device.visibility}"
}
