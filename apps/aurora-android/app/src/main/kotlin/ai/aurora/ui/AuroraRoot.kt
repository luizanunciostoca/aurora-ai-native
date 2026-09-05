package ai.aurora.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import ai.aurora.ui.model.AuroraUiIntent
import ai.aurora.ui.model.AuroraUiState
import ai.aurora.ui.model.UiSurface
import ai.aurora.ui.model.VoiceOutputState
import kotlinx.coroutines.delay

@Composable
fun AuroraRoot(viewModel: AuroraRootViewModel = viewModel()) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    val voiceController = remember(context, viewModel) {
        VoiceCaptureController(
            context = context,
            onListening = { viewModel.onIntent(AuroraUiIntent.VoiceListening) },
            onPartial = { viewModel.onIntent(AuroraUiIntent.VoicePartial(it)) },
            onResult = { viewModel.onIntent(AuroraUiIntent.VoiceResult(it)) },
            onError = { viewModel.onIntent(AuroraUiIntent.VoiceError(it)) },
        )
    }
    val outputController = remember(context, viewModel) {
        VoiceOutputController(
            context = context,
            onAvailability = { available, engine, route ->
                viewModel.onIntent(AuroraUiIntent.VoiceOutputAvailability(available, engine, route))
            },
            onStarted = { viewModel.onIntent(AuroraUiIntent.VoiceOutputStarted(it)) },
            onCompleted = { viewModel.onIntent(AuroraUiIntent.VoiceOutputCompleted(it)) },
            onError = { id, message -> viewModel.onIntent(AuroraUiIntent.VoiceOutputError(id, message)) },
        )
    }

    DisposableEffect(voiceController, outputController) {
        onDispose {
            voiceController.close()
            outputController.close()
        }
    }

    LaunchedEffect(state.settings.preferOfflineRecognition) {
        val availability = voiceController.availability(state.settings.preferOfflineRecognition)
        viewModel.onIntent(AuroraUiIntent.VoiceInputAvailability(availability.available, availability.engineLabel))
    }

    LaunchedEffect(state.voice.pendingSpeak?.id) {
        val request = state.voice.pendingSpeak ?: return@LaunchedEffect
        outputController.speak(request.text, state.settings, request.id)
    }

    val microphoneLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            viewModel.onIntent(AuroraUiIntent.StartVoice)
            voiceController.start(
                VoiceRecognitionConfig(
                    languageTag = state.settings.voiceLanguageTag,
                    preferOffline = state.settings.preferOfflineRecognition,
                ),
            )
        } else {
            viewModel.onIntent(
                AuroraUiIntent.VoiceError(
                    "Permissão de microfone negada. Você pode continuar usando texto.",
                ),
            )
        }
    }

    val startVoice: () -> Unit = {
        when {
            state.settings.privacyMode ->
                viewModel.onIntent(
                    AuroraUiIntent.VoiceError(
                        "Voice está bloqueado enquanto o modo de privacidade estiver ativo.",
                    ),
                )
            state.voice.outputState == VoiceOutputState.SPEAKING && !state.settings.bargeInEnabled ->
                viewModel.onIntent(
                    AuroraUiIntent.VoiceError(
                        "A Aurora está falando. Ative barge-in ou pare a saída de voz antes de iniciar o microfone.",
                    ),
                )
            else -> {
                if (state.voice.outputState == VoiceOutputState.SPEAKING && state.settings.bargeInEnabled) {
                    outputController.stop()
                    viewModel.onIntent(AuroraUiIntent.StopVoiceOutput)
                }
                if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    viewModel.onIntent(AuroraUiIntent.StartVoice)
                    voiceController.start(
                        VoiceRecognitionConfig(
                            languageTag = state.settings.voiceLanguageTag,
                            preferOffline = state.settings.preferOfflineRecognition,
                        ),
                    )
                } else {
                    microphoneLauncher.launch(Manifest.permission.RECORD_AUDIO)
                }
            }
        }
    }

    val stopVoiceOutput: () -> Unit = {
        outputController.stop()
        viewModel.onIntent(AuroraUiIntent.StopVoiceOutput)
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
                        onStopVoiceOutput = stopVoiceOutput,
                    )
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
    onStopVoiceOutput: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        TopBar(state, onIntent)
        state.globalNotice?.let { notice ->
            DegradedBanner(notice) { onIntent(AuroraUiIntent.ClearNotice) }
        }
        BoxWithConstraints(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
        ) {
            val wideLayout = maxWidth >= 920.dp
            val extraWideLayout = maxWidth >= 1_220.dp
            val conversationWidth = maxWidth * 0.32f
            if (wideLayout) {
                Row(modifier = Modifier.fillMaxSize()) {
                    ConversationPane(
                        state = state,
                        onIntent = onIntent,
                        onVoice = onVoice,
                        modifier = Modifier
                            .width(conversationWidth)
                            .fillMaxHeight(),
                    )
                    VerticalRule()
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight(),
                    ) {
                        MainSurfaceContent(state, onIntent, onVoice, onStopVoiceOutput)
                    }
                    if (extraWideLayout && state.workspaceOpen && state.manifest != null) {
                        VerticalRule()
                        InspectorRail(
                            manifest = state.manifest,
                            onIntent = onIntent,
                            modifier = Modifier
                                .width(270.dp)
                                .fillMaxHeight(),
                        )
                    }
                }
            } else {
                Box(modifier = Modifier.fillMaxSize()) {
                    if (state.surface in setOf(UiSurface.PRESENCE, UiSurface.CONVERSATION)) {
                        ConversationPane(
                            state = state,
                            onIntent = onIntent,
                            onVoice = onVoice,
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        MainSurfaceContent(state, onIntent, onVoice, onStopVoiceOutput)
                    }
                }
            }
        }
        SupportNavigation(state.surface, onIntent)
    }
}

@Composable
private fun MainSurfaceContent(
    state: AuroraUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
    onStopVoiceOutput: () -> Unit,
) {
    when (state.surface) {
        UiSurface.PRESENCE,
        UiSurface.CONVERSATION,
        -> PresenceFocus(state, onIntent, onVoice)
        UiSurface.WORKSPACE -> WorkspacePane(state, onIntent)
        UiSurface.HUMAN_CONTROL -> HumanControlPane(state, onIntent)
        UiSurface.EVIDENCE -> EvidencePane(state, onIntent)
        UiSurface.SETTINGS -> VoiceAndSystemSettingsPane(state, onIntent, onVoice, onStopVoiceOutput)
    }
}

@Composable
internal fun VerticalRule() {
    Box(
        Modifier
            .fillMaxHeight()
            .width(1.dp)
            .background(Outline.copy(alpha = 0.72f)),
    )
}
