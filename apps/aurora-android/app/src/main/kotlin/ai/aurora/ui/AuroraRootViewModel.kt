package ai.aurora.ui

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ai.aurora.device.AuroraApplication
import ai.aurora.device.session.DeviceSessionAvailability
import ai.aurora.ui.model.AuroraPresenceMode
import ai.aurora.ui.model.AuroraPreviewCatalog
import ai.aurora.ui.model.AuroraSettings
import ai.aurora.ui.model.AuroraUiIntent
import ai.aurora.ui.model.AuroraUiState
import ai.aurora.ui.model.ConnectivityUiState
import ai.aurora.ui.model.ConversationRole
import ai.aurora.ui.model.ConversationTurn
import ai.aurora.ui.model.DeviceUiState
import ai.aurora.ui.model.EvidenceUiState
import ai.aurora.ui.model.HumanControlUiState
import ai.aurora.ui.model.OnboardingStep
import ai.aurora.ui.model.ProjectionProvenance
import ai.aurora.ui.model.SemanticTone
import ai.aurora.ui.model.TimelineEvent
import ai.aurora.ui.model.UiSurface
import ai.aurora.ui.model.WorkspaceNavigator
import ai.aurora.ui.model.WorkspaceViewType
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.Locale
import java.util.UUID

class AuroraRootViewModel(application: Application) : AndroidViewModel(application) {
    private val aurora = application as AuroraApplication
    private val preferences = application.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    private val connectivityManager = application.getSystemService(ConnectivityManager::class.java)

    private val _state = MutableStateFlow(initialState())
    val state: StateFlow<AuroraUiState> = _state.asStateFlow()

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = refreshConnectivity()

        override fun onLost(network: Network) = refreshConnectivity()

        override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) =
            refreshConnectivity()
    }

    init {
        runCatching { connectivityManager.registerDefaultNetworkCallback(networkCallback) }
        refreshRuntime()
    }

    fun onIntent(intent: AuroraUiIntent) {
        when (intent) {
            AuroraUiIntent.NextOnboarding -> moveOnboarding(forward = true)
            AuroraUiIntent.PreviousOnboarding -> moveOnboarding(forward = false)
            AuroraUiIntent.CompleteOnboarding -> completeOnboarding()
            is AuroraUiIntent.OpenSurface -> _state.update { it.copy(surface = intent.surface) }
            is AuroraUiIntent.UpdateDraft -> _state.update { it.copy(inputDraft = intent.value.take(MAX_INPUT_CHARS)) }
            is AuroraUiIntent.SubmitText -> submitText(intent.text)
            is AuroraUiIntent.OpenDynamicView -> openView(intent.viewType)
            AuroraUiIntent.CloseWorkspace ->
                _state.update {
                    it.copy(
                        workspaceOpen = false,
                        manifest = null,
                        surface = UiSurface.CONVERSATION,
                    )
                }
            AuroraUiIntent.StartVoice ->
                _state.update {
                    it.copy(
                        presence = AuroraPresenceMode.AWAKEN,
                        globalNotice = "Toque para falar. A captura de voz só inicia após permissão explícita.",
                    )
                }
            AuroraUiIntent.VoiceListening ->
                _state.update {
                    it.copy(
                        listening = true,
                        partialTranscript = "",
                        presence = AuroraPresenceMode.LISTENING,
                        globalNotice = null,
                    )
                }
            is AuroraUiIntent.VoicePartial ->
                _state.update { it.copy(partialTranscript = intent.transcript.take(MAX_INPUT_CHARS)) }
            is AuroraUiIntent.VoiceResult -> {
                _state.update { it.copy(listening = false, partialTranscript = "") }
                submitText(intent.transcript)
            }
            is AuroraUiIntent.VoiceError ->
                _state.update {
                    it.copy(
                        listening = false,
                        partialTranscript = "",
                        presence = if (it.connectivity.online) AuroraPresenceMode.PRESENT else AuroraPresenceMode.OFFLINE,
                        globalNotice = intent.message,
                    )
                }
            is AuroraUiIntent.SetReducedMotion -> updateSettings { it.copy(reducedMotion = intent.enabled) }
            is AuroraUiIntent.SetHighContrast -> updateSettings { it.copy(highContrast = intent.enabled) }
            is AuroraUiIntent.SetCaptions -> updateSettings { it.copy(captionsEnabled = intent.enabled) }
            is AuroraUiIntent.SetPrivacyMode -> updateSettings { it.copy(privacyMode = intent.enabled) }
            is AuroraUiIntent.SetWakePreference -> updateSettings { it.copy(wakePreferenceEnabled = intent.enabled) }
            is AuroraUiIntent.ReviewApproval -> openApprovalPreview(intent.approvalRef)
            is AuroraUiIntent.SubmitHumanDecision -> submitPreviewDecision(intent.decision)
            is AuroraUiIntent.RequestCancellation -> requestCancellation(intent.subjectRef)
            AuroraUiIntent.OpenEvidence -> openEvidence()
            AuroraUiIntent.ClearNotice -> _state.update { it.copy(globalNotice = null) }
        }
    }

    fun refreshRuntime() {
        val presence = aurora.presenceSnapshot()
        val sessionAvailability = aurora.deviceSessionClient().sessionAvailability(System.currentTimeMillis())
        val connectivity = currentConnectivity()
        _state.update { current ->
            val runtimePresence = when {
                current.listening -> AuroraPresenceMode.LISTENING
                !connectivity.online -> AuroraPresenceMode.OFFLINE
                presence.visibility.name == "FOREGROUND" -> AuroraPresenceMode.PRESENT
                else -> AuroraPresenceMode.DORMANT
            }
            val device = DeviceUiState(
                environment = aurora.environmentConfig.environment.name,
                buildSha = ai.aurora.device.BuildConfig.AURORA_BUILD_SHA,
                uiProfile = ai.aurora.device.BuildConfig.AURORA_UI_PROFILE,
                visibility = presence.visibility.name,
                processGeneration = presence.processGeneration,
                localServicePhase = presence.localServicePhase.name,
                devicePlaneAdapterAvailable = true,
                registrationStatus = sessionLabel(sessionAvailability),
            )
            val refreshedManifest = current.manifest?.let {
                AuroraPreviewCatalog.manifestFor(it.viewType, device, connectivity)
            }
            current.copy(
                presence = runtimePresence,
                connectivity = connectivity,
                device = device,
                manifest = refreshedManifest,
            )
        }
    }

    override fun onCleared() {
        runCatching { connectivityManager.unregisterNetworkCallback(networkCallback) }
        super.onCleared()
    }

    private fun initialState(): AuroraUiState {
        val settings = AuroraSettings(
            reducedMotion = preferences.getBoolean(KEY_REDUCED_MOTION, false),
            highContrast = preferences.getBoolean(KEY_HIGH_CONTRAST, false),
            captionsEnabled = preferences.getBoolean(KEY_CAPTIONS, true),
            hapticsEnabled = preferences.getBoolean(KEY_HAPTICS, true),
            privacyMode = preferences.getBoolean(KEY_PRIVACY_MODE, false),
            wakePreferenceEnabled = preferences.getBoolean(KEY_WAKE, false),
        )
        val onboardingComplete = preferences.getBoolean(KEY_ONBOARDING_COMPLETE, false)
        return AuroraUiState(
            onboardingComplete = onboardingComplete,
            onboardingStep = if (onboardingComplete) OnboardingStep.READY else OnboardingStep.WELCOME,
            surface = if (onboardingComplete) UiSurface.PRESENCE else UiSurface.PRESENCE,
            conversation = listOf(
                ConversationTurn(
                    id = "welcome",
                    role = ConversationRole.AURORA,
                    text = "Estou pronta. Pergunte, fale ou peça para eu mostrar uma visão. As superfícies ainda não conectadas aparecem claramente como TARGET PREVIEW.",
                    provenance = ProjectionProvenance.LIVE,
                ),
            ),
            settings = settings,
            evidence = baseEvidence(),
        )
    }

    private fun moveOnboarding(forward: Boolean) {
        _state.update { current ->
            val steps = OnboardingStep.entries
            val index = steps.indexOf(current.onboardingStep)
            val nextIndex = if (forward) (index + 1).coerceAtMost(steps.lastIndex) else (index - 1).coerceAtLeast(0)
            current.copy(onboardingStep = steps[nextIndex])
        }
    }

    private fun completeOnboarding() {
        preferences.edit().putBoolean(KEY_ONBOARDING_COMPLETE, true).apply()
        _state.update {
            it.copy(
                onboardingComplete = true,
                onboardingStep = OnboardingStep.READY,
                surface = UiSurface.PRESENCE,
                presence = if (it.connectivity.online) AuroraPresenceMode.PRESENT else AuroraPresenceMode.OFFLINE,
            )
        }
    }

    private fun submitText(rawText: String) {
        val text = rawText.trim().take(MAX_INPUT_CHARS)
        if (text.isEmpty()) return
        val userTurn = ConversationTurn(
            id = UUID.randomUUID().toString(),
            role = ConversationRole.USER,
            text = text,
            provenance = ProjectionProvenance.LIVE,
        )
        _state.update {
            it.copy(
                conversation = (it.conversation + userTurn).takeLast(MAX_TURNS),
                inputDraft = "",
                surface = UiSurface.CONVERSATION,
                presence = AuroraPresenceMode.UNDERSTANDING,
                globalNotice = null,
            )
        }
        viewModelScope.launch {
            if (!_state.value.settings.reducedMotion) delay(180)
            _state.update { it.copy(presence = AuroraPresenceMode.RETRIEVING_CONTEXT) }
            if (!_state.value.settings.reducedMotion) delay(180)
            _state.update { it.copy(presence = AuroraPresenceMode.REASONING) }
            if (!_state.value.settings.reducedMotion) delay(220)
            routeConversation(text)
        }
    }

    private fun routeConversation(text: String) {
        val normalized = text.lowercase(Locale("pt", "BR"))
        when {
            listOf("configura", "settings", "ajustes", "privacidade", "acessibilidade").any(normalized::contains) -> {
                appendAurora("Abri Ajustes. Preferências locais não alteram policy ou authority do sistema.")
                _state.update { it.copy(surface = UiSurface.SETTINGS, presence = AuroraPresenceMode.PRESENT) }
            }
            listOf("aprovar", "approval", "orçamento", "orcamento", "autorizar").any(normalized::contains) -> {
                appendAurora("Posso mostrar a superfície de Human Control. Nesta APK ela é request-only até a projection de approval ser conectada.")
                openApprovalPreview("conversation-preview")
            }
            listOf("evidência", "evidencia", "evidence", "receipt", "readback", "prova", "trace").any(normalized::contains) -> {
                appendAurora("Abri Evidence. Receipt e readback permanecem visualmente separados; ACK nunca é exibido como sucesso verificado.")
                openEvidence()
            }
            listOf("voltar", "fechar workspace", "só conversa", "so conversa").any(normalized::contains) -> {
                appendAurora("Workspace recolhido. A conversa continua como âncora.")
                _state.update {
                    it.copy(
                        workspaceOpen = false,
                        manifest = null,
                        surface = UiSurface.CONVERSATION,
                        presence = AuroraPresenceMode.PRESENT,
                    )
                }
            }
            else -> {
                val viewType = WorkspaceNavigator.classify(text)
                if (viewType == null) {
                    appendAurora(
                        "Entendi. Nesta V1 eu já posso navegar pela interface, mostrar capabilities, dispositivo, workflows, marketing, CRM, ads, evidence e outras views. O processamento de negócio remoto será conectado progressivamente.",
                    )
                    _state.update { it.copy(presence = AuroraPresenceMode.PRESENT) }
                } else {
                    appendAurora(responseFor(viewType))
                    openView(viewType)
                }
            }
        }
    }

    private fun openView(viewType: WorkspaceViewType) {
        _state.update { current ->
            val manifest = AuroraPreviewCatalog.manifestFor(viewType, current.device, current.connectivity)
            current.copy(
                workspaceOpen = true,
                selectedView = viewType,
                manifest = manifest,
                surface = UiSurface.WORKSPACE,
                presence = if (manifest.risk >= ai.aurora.ui.model.RiskBand.HIGH) {
                    AuroraPresenceMode.COORDINATING
                } else {
                    AuroraPresenceMode.PRESENT
                },
            )
        }
    }

    private fun openApprovalPreview(reference: String) {
        _state.update {
            it.copy(
                surface = UiSurface.HUMAN_CONTROL,
                presence = AuroraPresenceMode.WAITING_APPROVAL,
                humanControl = HumanControlUiState(
                    pendingCount = 1,
                    title = "Preview de decisão governada",
                    impact = "TARGET PREVIEW · nenhum write será enviado",
                    expiry = "Sem expiry real — projection não conectada",
                    requestOnly = true,
                ),
                globalNotice = "Approval ref $reference está em modo preview. Nenhum OwnerDecision será fabricado no client.",
            )
        }
    }

    private fun submitPreviewDecision(decision: String) {
        appendAurora("Decisão '$decision' registrada apenas como interação de preview. A UI não criou OwnerDecision, PolicyToken nem execução.")
        _state.update {
            it.copy(
                surface = UiSurface.CONVERSATION,
                presence = AuroraPresenceMode.PRESENT,
                globalNotice = "Human Control permanece request-only até o backend de approval estar conectado.",
            )
        }
    }

    private fun requestCancellation(subjectRef: String) {
        appendAurora("Solicitação de cancelamento para '$subjectRef' não foi enviada: esta projection ainda não possui binding canônico. Nenhum estado local foi alterado.")
        _state.update { it.copy(globalNotice = "Cancel é request-only e exige binding do owner canônico.") }
    }

    private fun openEvidence() {
        _state.update {
            it.copy(
                surface = UiSurface.EVIDENCE,
                evidence = baseEvidence().copy(
                    headline = "Evidence V1 · runtime local + fronteiras de verificação",
                    correlationId = "ui-${ai.aurora.device.BuildConfig.AURORA_BUILD_SHA.take(8)}",
                ),
                presence = AuroraPresenceMode.VERIFYING,
            )
        }
        viewModelScope.launch {
            if (!_state.value.settings.reducedMotion) delay(260)
            _state.update { it.copy(presence = AuroraPresenceMode.PRESENT) }
        }
    }

    private fun appendAurora(text: String) {
        val turn = ConversationTurn(
            id = UUID.randomUUID().toString(),
            role = ConversationRole.AURORA,
            text = text,
            provenance = ProjectionProvenance.LIVE,
        )
        _state.update { it.copy(conversation = (it.conversation + turn).takeLast(MAX_TURNS)) }
    }

    private fun responseFor(viewType: WorkspaceViewType): String =
        when (viewType) {
            WorkspaceViewType.DEVICES -> "Abri Devices. Presence e ambiente do tablet são LIVE; registration/session remotas permanecem claramente separadas até provisioning físico."
            WorkspaceViewType.SYSTEM_HEALTH -> "Abri System Health. Rede e runtime local são LIVE; SLOs e telemetry de produção continuam como projections futuras W17."
            WorkspaceViewType.CAPABILITY_CATALOG -> "Abri Capability Catalog. A V1 já preserva a regra capability-first: disponibilidade nunca é permission ou authority."
            WorkspaceViewType.META_ADS,
            WorkspaceViewType.GOOGLE_ADS,
            -> "Abri a visão de mídia paga. Dados de negócio ainda estão em TARGET PREVIEW e qualquer ação financeira permanece atrás de Human Control."
            WorkspaceViewType.CRM_REVENUE -> "Abri CRM / Revenue. Nenhum PII sintético é exibido; projections reais entrarão com consent, freshness e provenance."
            else -> "Abri ${viewType.displayTitle}. Esta surface já está implementada visualmente e aguardará projections canônicas onde o backend ainda não estiver conectado."
        }

    private fun updateSettings(transform: (AuroraSettings) -> AuroraSettings) {
        _state.update { it.copy(settings = transform(it.settings)) }
        val settings = _state.value.settings
        preferences.edit()
            .putBoolean(KEY_REDUCED_MOTION, settings.reducedMotion)
            .putBoolean(KEY_HIGH_CONTRAST, settings.highContrast)
            .putBoolean(KEY_CAPTIONS, settings.captionsEnabled)
            .putBoolean(KEY_HAPTICS, settings.hapticsEnabled)
            .putBoolean(KEY_PRIVACY_MODE, settings.privacyMode)
            .putBoolean(KEY_WAKE, settings.wakePreferenceEnabled)
            .apply()
    }

    private fun refreshConnectivity() {
        _state.update { current ->
            val connectivity = currentConnectivity()
            val nextPresence = when {
                current.listening -> AuroraPresenceMode.LISTENING
                !connectivity.online -> AuroraPresenceMode.OFFLINE
                current.presence == AuroraPresenceMode.OFFLINE -> AuroraPresenceMode.PRESENT
                else -> current.presence
            }
            val refreshedManifest = current.manifest?.let {
                AuroraPreviewCatalog.manifestFor(it.viewType, current.device, connectivity)
            }
            current.copy(
                connectivity = connectivity,
                presence = nextPresence,
                manifest = refreshedManifest,
            )
        }
    }

    private fun currentConnectivity(): ConnectivityUiState {
        val network = connectivityManager.activeNetwork
            ?: return ConnectivityUiState(false, "Offline")
        val capabilities = connectivityManager.getNetworkCapabilities(network)
            ?: return ConnectivityUiState(false, "Offline")
        val hasInternet = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        val validated = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        return when {
            validated -> ConnectivityUiState(true, "Online")
            hasInternet -> ConnectivityUiState(true, "Rede disponível · validação pendente")
            else -> ConnectivityUiState(false, "Offline")
        }
    }

    private fun sessionLabel(availability: DeviceSessionAvailability): String = when (availability) {
        DeviceSessionAvailability.NONE -> "Não provisionado para sessão remota"
        DeviceSessionAvailability.ACTIVE -> "Sessão ACTIVE"
        DeviceSessionAvailability.EXPIRED -> "Sessão EXPIRED · reconnect necessário"
        DeviceSessionAvailability.REVOKED -> "Sessão REVOKED"
        DeviceSessionAvailability.BLOCKED -> "Sessão BLOCKED · registro/chave requer atenção"
    }

    private fun baseEvidence(): EvidenceUiState =
        EvidenceUiState(
            headline = "Evidence disponível quando houver execução ou verificação",
            receiptStatus = "ACK/Receipt ≠ verified success",
            readbackStatus = "Readback ainda não solicitado",
            correlationId = "local-ui",
            events = listOf(
                TimelineEvent("Build", ai.aurora.device.BuildConfig.AURORA_BUILD_SHA, SemanticTone.INFO),
                TimelineEvent("UI profile", ai.aurora.device.BuildConfig.AURORA_UI_PROFILE, SemanticTone.INFO),
                TimelineEvent("Authority boundary", "UI não fabrica PolicyToken/OwnerDecision", SemanticTone.VERIFIED),
            ),
        )

    companion object {
        private const val PREFERENCES_NAME = "aurora.ui.v1"
        private const val KEY_ONBOARDING_COMPLETE = "onboarding_complete"
        private const val KEY_REDUCED_MOTION = "reduced_motion"
        private const val KEY_HIGH_CONTRAST = "high_contrast"
        private const val KEY_CAPTIONS = "captions"
        private const val KEY_HAPTICS = "haptics"
        private const val KEY_PRIVACY_MODE = "privacy_mode"
        private const val KEY_WAKE = "wake_preference"
        private const val MAX_INPUT_CHARS = 2_000
        private const val MAX_TURNS = 60
    }
}
