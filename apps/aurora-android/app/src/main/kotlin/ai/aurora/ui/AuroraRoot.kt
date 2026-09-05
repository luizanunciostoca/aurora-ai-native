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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
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
    val activity = context as? FragmentActivity
    val hapticsController = remember(context) { AuroraHapticsController(context) }
    var stepUpState by remember { mutableStateOf(StepUpUiState()) }

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
    val stepUpController = remember(activity) {
        activity?.let { host ->
            StepUpAuthController(
                activity = host,
                onStarted = {
                    stepUpState = StepUpUiState(
                        status = StepUpStatus.AUTHENTICATING,
                        detail = "Aguardando confirmação biométrica ou credencial do dispositivo.",
                        successSequence = stepUpState.successSequence,
                    )
                },
                onSucceeded = { method ->
                    stepUpState = StepUpUiState(
                        status = StepUpStatus.SUCCEEDED,
                        detail = "Interação local confirmada. Policy/authority ainda precisam ser revalidadas pelo backend.",
                        method = method,
                        successSequence = stepUpState.successSequence + 1,
                    )
                    hapticsController.acknowledged(state.settings.hapticsEnabled)
                },
                onFailed = { message ->
                    stepUpState = StepUpUiState(
                        status = StepUpStatus.FAILED,
                        detail = message,
                        successSequence = stepUpState.successSequence,
                    )
                    hapticsController.warning(state.settings.hapticsEnabled)
                },
            )
        }
    }

    DisposableEffect(voiceController, outputController) {
        onDispose {
            voiceController.close()
            outputController.close()
        }
    }

    LaunchedEffect(stepUpController) {
        val availability = stepUpController?.availability()
        stepUpState = when {
            availability == null -> StepUpUiState(
                status = StepUpStatus.UNAVAILABLE,
                detail = "A Activity atual não suporta o host biométrico esperado.",
            )
            availability.available -> StepUpUiState(
                status = StepUpStatus.AVAILABLE,
                detail = availability.detail,
            )
            else -> StepUpUiState(
                status = StepUpStatus.UNAVAILABLE,
                detail = availability.detail,
            )
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

    LaunchedEffect(state.voice.listening) {
        if (state.voice.listening) hapticsController.listening(state.settings.hapticsEnabled)
    }

    LaunchedEffect(state.voice.lastTranscript) {
        if (state.voice.lastTranscript.isNotBlank()) hapticsController.acknowledged(state.settings.hapticsEnabled)
    }

    LaunchedEffect(state.voice.lastError) {
        if (state.voice.lastError != null) hapticsController.warning(state.settings.hapticsEnabled)
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
            viewModel.onIntent(AuroraUiIntent.VoiceError("Permissão de microfone negada. Você pode continuar usando texto."))
        }
    }

    val startVoice: () -> Unit = {
        when {
            state.settings.privacyMode ->
                viewModel.onIntent(AuroraUiIntent.VoiceError("Voice está bloqueado enquanto o modo de privacidade estiver ativo."))
            state.voice.outputState == VoiceOutputState.SPEAKING && !state.settings.bargeInEnabled ->
                viewModel.onIntent(AuroraUiIntent.VoiceError("A Aurora está falando. Ative barge-in ou pare a saída de voz antes de iniciar o microfone."))
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

    val startStepUp: () -> Unit = {
        val controller = stepUpController
        if (controller == null) {
            stepUpState = StepUpUiState(
                status = StepUpStatus.UNAVAILABLE,
                detail = "Step-up local não está disponível neste host.",
                successSequence = stepUpState.successSequence,
            )
        } else {
            controller.authenticate("Confirmar interação local para revisar a proposta")
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
                    OnboardingFlow(state = state, onIntent = viewModel::onIntent, onVoice = startVoice)
                } else {
                    AuroraShell(
                        state = state,
                        stepUpState = stepUpState,
                        onIntent = viewModel::onIntent,
                        onVoice = startVoice,
                        onStopVoiceOutput = stopVoiceOutput,
                        onStepUp = startStepUp,
                    )
                }
            }
        }
    }
}

@Composable
private fun AuroraShell(
    state: AuroraUiState,
    stepUpState: StepUpUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
    onStopVoiceOutput: () -> Unit,
    onStepUp: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        TopBar(state, onIntent)
        state.globalNotice?.let { notice -> DegradedBanner(notice) { onIntent(AuroraUiIntent.ClearNotice) } }
        BoxWithConstraints(modifier = Modifier.weight(1f).fillMaxWidth()) {
            val wideLayout = maxWidth >= 920.dp
            val extraWideLayout = maxWidth >= 1_220.dp
            val conversationWidth = maxWidth * 0.32f
            if (wideLayout) {
                Row(modifier = Modifier.fillMaxSize()) {
                    ConversationPane(
                        state = state,
                        onIntent = onIntent,
                        onVoice = onVoice,
                        modifier = Modifier.width(conversationWidth).fillMaxHeight(),
                    )
                    VerticalRule()
                    Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                        MainSurfaceContent(state, stepUpState, onIntent, onVoice, onStopVoiceOutput, onStepUp)
                    }
                    if (extraWideLayout && state.workspaceOpen && state.manifest != null) {
                        VerticalRule()
                        InspectorRail(
                            manifest = state.manifest,
                            onIntent = onIntent,
                            modifier = Modifier.width(270.dp).fillMaxHeight(),
                        )
                    }
                }
            } else {
                Box(modifier = Modifier.fillMaxSize()) {
                    if (state.surface in setOf(UiSurface.PRESENCE, UiSurface.CONVERSATION)) {
                        ConversationPane(state, onIntent, onVoice, Modifier.fillMaxSize())
                    } else {
                        MainSurfaceContent(state, stepUpState, onIntent, onVoice, onStopVoiceOutput, onStepUp)
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
    stepUpState: StepUpUiState,
    onIntent: (AuroraUiIntent) -> Unit,
    onVoice: () -> Unit,
    onStopVoiceOutput: () -> Unit,
    onStepUp: () -> Unit,
) {
    when (state.surface) {
        UiSurface.PRESENCE,
        UiSurface.CONVERSATION,
        -> PresenceFocus(state, onIntent, onVoice)
        UiSurface.WORKSPACE -> WorkspacePane(state, onIntent)
        UiSurface.HUMAN_CONTROL -> HumanControlV2Pane(state, stepUpState, onIntent, onStepUp)
        UiSurface.EVIDENCE -> EvidencePane(state, onIntent)
        UiSurface.SETTINGS -> VoiceAndSystemSettingsPane(state, onIntent, onVoice, onStopVoiceOutput)
    }
}

@Composable
internal fun VerticalRule() {
    Box(Modifier.fillMaxHeight().width(1.dp).background(Outline.copy(alpha = 0.72f)))
}
