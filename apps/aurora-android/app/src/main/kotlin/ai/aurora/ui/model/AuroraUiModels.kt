package ai.aurora.ui.model

enum class UiSurface {
    PRESENCE,
    CONVERSATION,
    WORKSPACE,
    HUMAN_CONTROL,
    EVIDENCE,
    SETTINGS,
}

enum class OnboardingStep {
    WELCOME,
    DEVICE_TRUST,
    VOICE_AUDIO,
    PERMISSIONS,
    READY,
}

enum class AuroraPresenceMode {
    DORMANT,
    PRESENT,
    AWAKEN,
    LISTENING,
    UNDERSTANDING,
    RETRIEVING_CONTEXT,
    REASONING,
    COORDINATING,
    WAITING_APPROVAL,
    EXECUTING,
    VERIFYING,
    SUCCESS,
    EXECUTION_UNCERTAIN,
    DEGRADED,
    OFFLINE,
}

enum class ProjectionFreshness { CURRENT, STALE, UNKNOWN, CONFLICT }
enum class ProjectionProvenance { LIVE, CONNECTED_WHEN_AVAILABLE, TARGET_PREVIEW }
enum class PresentationMode { RICH_RESPONSE, FOCUSED, COMPOSITE, FOCUSED_WITH_SAFETY, FOCUSED_WITH_EVIDENCE }
enum class RiskBand { LOW, MEDIUM, HIGH, CRITICAL }
enum class SemanticTone { NEUTRAL, INFO, EXECUTION, REASONING, VERIFIED, APPROVAL, CRITICAL }
enum class ConversationRole { USER, AURORA, SYSTEM }
enum class VoiceEngineAvailability { UNKNOWN, AVAILABLE, UNAVAILABLE }
enum class VoiceOutputState { IDLE, SPEAKING, ERROR }

data class VoiceSpeakRequest(val id: Long, val text: String) {
    init {
        require(id > 0)
        require(text.isNotBlank())
        require(text.length <= 4_000)
    }
}

data class VoiceUiState(
    val inputAvailability: VoiceEngineAvailability = VoiceEngineAvailability.UNKNOWN,
    val inputEngineLabel: String = "Verificando reconhecimento",
    val outputAvailability: VoiceEngineAvailability = VoiceEngineAvailability.UNKNOWN,
    val outputEngineLabel: String = "Inicializando síntese de voz",
    val audioRouteLabel: String = "Sistema",
    val listening: Boolean = false,
    val partialTranscript: String = "",
    val lastTranscript: String = "",
    val outputState: VoiceOutputState = VoiceOutputState.IDLE,
    val lastError: String? = null,
    val pendingSpeak: VoiceSpeakRequest? = null,
)

enum class WorkspaceViewType(val displayTitle: String, val domain: String) {
    EXECUTIVE_OVERVIEW("Executive Overview", "Executive"),
    ATTENTION_QUEUE("Attention Queue", "Executive"),
    OBJECTIVE_DETAIL("Objective Detail", "Goals"),
    GOAL_GRAPH("Goal Graph", "Goals"),
    TASK_DETAIL("Task Detail", "Goals"),
    CAPABILITY_CATALOG("Capability Catalog", "Capabilities"),
    CAPABILITY_DETAIL("Capability Detail", "Capabilities"),
    WORKFORCE("Workforce", "Execution"),
    AGENT_DETAIL("Agent Detail", "Execution"),
    MARKETING_OVERVIEW("Marketing Overview", "Marketing"),
    CRM_REVENUE("CRM / Revenue", "Revenue"),
    COMMUNITY_INBOX("Community Inbox", "Community"),
    META_ADS("Meta Ads", "Marketing"),
    GOOGLE_ADS("Google Ads", "Marketing"),
    PROVIDERS("Providers", "Operations"),
    DEVICES("Devices", "Operations"),
    WORKFLOWS("Workflows", "Operations"),
    CONTENT_EDITORIAL("Content & Editorial", "Content"),
    ASSET_LIBRARY("Creative / Asset Library", "Content"),
    PUBLICATION_CALENDAR("Publication Calendar", "Content"),
    CAMPAIGN_DETAIL("Campaign Detail", "Marketing"),
    LEAD_DETAIL("Lead Detail", "Revenue"),
    KNOWLEDGE_MEMORY("Knowledge & Memory", "Knowledge"),
    ANALYTICS_OUTCOMES("Analytics & Outcomes", "Analytics"),
    NOTIFICATIONS_INCIDENTS("Notifications & Incidents", "Operations"),
    SYSTEM_HEALTH("System Health / Observability", "Operations"),
    INTEGRATIONS("Integrations / Connections", "Operations"),
    SECURITY_TRUST("Security & Trust Center", "Security"),
    DEVICE_CONTROL("Device Control", "Device"),
    WORKFLOW_DETAIL("Workflow Detail", "Operations"),
    GLOBAL_SEARCH("Global Search / Discovery", "Discovery"),
}

data class WorkspaceNeed(
    val objectiveRef: String? = null,
    val needsComparison: Boolean = false,
    val needsControl: Boolean = false,
    val needsEvidence: Boolean = false,
    val risk: RiskBand = RiskBand.LOW,
    val itemCount: Int = 1,
    val freshness: ProjectionFreshness = ProjectionFreshness.CURRENT,
)

object WorkspaceCompositionPolicy {
    fun choosePresentation(need: WorkspaceNeed): PresentationMode = when {
        need.needsControl || need.risk >= RiskBand.HIGH -> PresentationMode.FOCUSED_WITH_SAFETY
        need.needsComparison && need.itemCount > 3 -> PresentationMode.COMPOSITE
        need.needsEvidence -> PresentationMode.FOCUSED_WITH_EVIDENCE
        need.itemCount <= 3 -> PresentationMode.RICH_RESPONSE
        else -> PresentationMode.FOCUSED
    }
}

data class ConversationTurn(
    val id: String,
    val role: ConversationRole,
    val text: String,
    val provenance: ProjectionProvenance = ProjectionProvenance.LIVE,
    val timestampLabel: String = "agora",
)

data class TimelineEvent(val label: String, val detail: String, val tone: SemanticTone = SemanticTone.NEUTRAL)
data class GraphNode(val id: String, val label: String, val state: String, val tone: SemanticTone = SemanticTone.NEUTRAL)
data class GraphEdge(val from: String, val to: String)

sealed interface AuroraUiComponent {
    data class Metric(val label: String, val value: String, val caption: String, val tone: SemanticTone = SemanticTone.INFO) : AuroraUiComponent
    data class Status(val label: String, val value: String, val detail: String, val tone: SemanticTone = SemanticTone.NEUTRAL) : AuroraUiComponent
    data class ListBlock(val title: String, val items: List<String>, val tone: SemanticTone = SemanticTone.NEUTRAL) : AuroraUiComponent
    data class Recommendation(val title: String, val body: String, val reason: String, val tone: SemanticTone = SemanticTone.REASONING) : AuroraUiComponent
    data class Timeline(val title: String, val events: List<TimelineEvent>) : AuroraUiComponent
    data class Table(val title: String, val columns: List<String>, val rows: List<List<String>>) : AuroraUiComponent
    data class Graph(val title: String, val nodes: List<GraphNode>, val edges: List<GraphEdge>) : AuroraUiComponent
    data class TextBlock(val title: String, val body: String, val tone: SemanticTone = SemanticTone.NEUTRAL) : AuroraUiComponent
}

data class DynamicViewManifest(
    val schemaVersion: String = "aurora.dynamic-view.v1",
    val viewId: String,
    val viewType: WorkspaceViewType,
    val objectiveRef: String? = null,
    val title: String,
    val subtitle: String,
    val components: List<AuroraUiComponent>,
    val freshness: ProjectionFreshness,
    val provenance: ProjectionProvenance,
    val risk: RiskBand = RiskBand.LOW,
    val presentation: PresentationMode = PresentationMode.FOCUSED,
    val safeActions: List<String> = emptyList(),
)

data class AuroraSettings(
    val reducedMotion: Boolean = false,
    val highContrast: Boolean = false,
    val captionsEnabled: Boolean = true,
    val hapticsEnabled: Boolean = true,
    val privacyMode: Boolean = false,
    val wakePreferenceEnabled: Boolean = false,
    val voiceOutputEnabled: Boolean = true,
    val autoSpeakResponses: Boolean = false,
    val bargeInEnabled: Boolean = true,
    val preferOfflineRecognition: Boolean = true,
    val voiceLanguageTag: String = "pt-BR",
    val voiceSpeechRate: Float = 1.0f,
    val voicePitch: Float = 1.0f,
) {
    init {
        require(voiceLanguageTag.isNotBlank() && voiceLanguageTag.length <= 32)
        require(voiceSpeechRate in 0.5f..1.5f)
        require(voicePitch in 0.5f..2.0f)
    }
}

object VoicePresentationPolicy {
    fun maySpeak(settings: AuroraSettings, text: String): Boolean =
        settings.voiceOutputEnabled && settings.autoSpeakResponses && !settings.privacyMode && text.isNotBlank()
}

data class ConnectivityUiState(val online: Boolean = false, val label: String = "Verificando rede")

data class DeviceUiState(
    val environment: String = "UNKNOWN",
    val buildSha: String = "unknown",
    val uiProfile: String = "unknown",
    val visibility: String = "NONE",
    val processGeneration: Long = 0,
    val localServicePhase: String = "STOPPED",
    val devicePlaneAdapterAvailable: Boolean = true,
    val registrationStatus: String = "Não provisionado para sessão remota",
)

data class HumanControlUiState(
    val pendingCount: Int = 0,
    val title: String = "Nenhuma decisão pendente",
    val impact: String = "Sem impacto externo",
    val expiry: String = "—",
    val requestOnly: Boolean = true,
)

data class EvidenceUiState(
    val headline: String = "Evidence disponível quando houver execução ou verificação",
    val receiptStatus: String = "Nenhum receipt ativo",
    val readbackStatus: String = "Nenhum readback ativo",
    val correlationId: String = "local-ui",
    val events: List<TimelineEvent> = emptyList(),
)

data class AuroraUiState(
    val onboardingComplete: Boolean = false,
    val onboardingStep: OnboardingStep = OnboardingStep.WELCOME,
    val surface: UiSurface = UiSurface.PRESENCE,
    val presence: AuroraPresenceMode = AuroraPresenceMode.PRESENT,
    val conversation: List<ConversationTurn> = emptyList(),
    val inputDraft: String = "",
    val workspaceOpen: Boolean = false,
    val selectedView: WorkspaceViewType = WorkspaceViewType.EXECUTIVE_OVERVIEW,
    val manifest: DynamicViewManifest? = null,
    val availableViews: List<WorkspaceViewType> = WorkspaceViewType.entries,
    val settings: AuroraSettings = AuroraSettings(),
    val connectivity: ConnectivityUiState = ConnectivityUiState(),
    val device: DeviceUiState = DeviceUiState(),
    val voice: VoiceUiState = VoiceUiState(),
    val globalNotice: String? = null,
    val humanControl: HumanControlUiState = HumanControlUiState(),
    val evidence: EvidenceUiState = EvidenceUiState(),
) {
    val listening: Boolean get() = voice.listening
    val partialTranscript: String get() = voice.partialTranscript
}

sealed interface AuroraUiIntent {
    data object NextOnboarding : AuroraUiIntent
    data object PreviousOnboarding : AuroraUiIntent
    data object CompleteOnboarding : AuroraUiIntent
    data class OpenSurface(val surface: UiSurface) : AuroraUiIntent
    data class UpdateDraft(val value: String) : AuroraUiIntent
    data class SubmitText(val text: String) : AuroraUiIntent
    data class OpenDynamicView(val viewType: WorkspaceViewType) : AuroraUiIntent
    data object CloseWorkspace : AuroraUiIntent
    data object StartVoice : AuroraUiIntent
    data object VoiceListening : AuroraUiIntent
    data class VoicePartial(val transcript: String) : AuroraUiIntent
    data class VoiceResult(val transcript: String) : AuroraUiIntent
    data class VoiceError(val message: String) : AuroraUiIntent
    data class VoiceInputAvailability(val available: Boolean, val engineLabel: String) : AuroraUiIntent
    data class VoiceOutputAvailability(val available: Boolean, val engineLabel: String, val audioRouteLabel: String) : AuroraUiIntent
    data class VoiceOutputStarted(val requestId: Long) : AuroraUiIntent
    data class VoiceOutputCompleted(val requestId: Long) : AuroraUiIntent
    data class VoiceOutputError(val requestId: Long?, val message: String) : AuroraUiIntent
    data object TestVoiceOutput : AuroraUiIntent
    data object StopVoiceOutput : AuroraUiIntent
    data class SetReducedMotion(val enabled: Boolean) : AuroraUiIntent
    data class SetHighContrast(val enabled: Boolean) : AuroraUiIntent
    data class SetCaptions(val enabled: Boolean) : AuroraUiIntent
    data class SetHaptics(val enabled: Boolean) : AuroraUiIntent
    data class SetPrivacyMode(val enabled: Boolean) : AuroraUiIntent
    data class SetWakePreference(val enabled: Boolean) : AuroraUiIntent
    data class SetVoiceOutputEnabled(val enabled: Boolean) : AuroraUiIntent
    data class SetAutoSpeakResponses(val enabled: Boolean) : AuroraUiIntent
    data class SetBargeIn(val enabled: Boolean) : AuroraUiIntent
    data class SetPreferOfflineRecognition(val enabled: Boolean) : AuroraUiIntent
    data class SetVoiceLanguage(val languageTag: String) : AuroraUiIntent
    data class SetVoiceSpeechRate(val value: Float) : AuroraUiIntent
    data class SetVoicePitch(val value: Float) : AuroraUiIntent
    data class ReviewApproval(val approvalRef: String = "preview-approval") : AuroraUiIntent
    data class SubmitHumanDecision(val decision: String) : AuroraUiIntent
    data class RequestCancellation(val subjectRef: String) : AuroraUiIntent
    data object OpenEvidence : AuroraUiIntent
    data object ClearNotice : AuroraUiIntent
}

object WorkspaceNavigator {
    fun classify(text: String): WorkspaceViewType? {
        val normalized = text.lowercase()
        return when {
            listOf("atenção", "atencao", "bloque", "pendência", "pendencia").any(normalized::contains) -> WorkspaceViewType.ATTENTION_QUEUE
            listOf("objetivo", "goal").any(normalized::contains) -> WorkspaceViewType.OBJECTIVE_DETAIL
            listOf("grafo", "dependência", "dependencia", "caminho crítico", "caminho critico").any(normalized::contains) -> WorkspaceViewType.GOAL_GRAPH
            listOf("tarefa", "task").any(normalized::contains) -> WorkspaceViewType.TASK_DETAIL
            listOf("capability", "capabilities", "o que pode", "o que consegue", "consegue fazer", "pode fazer", "o que a aurora consegue").any(normalized::contains) -> WorkspaceViewType.CAPABILITY_CATALOG
            listOf("agente", "worker", "workforce").any(normalized::contains) -> WorkspaceViewType.WORKFORCE
            listOf("marketing", "campanha", "conteúdo", "conteudo").any(normalized::contains) -> WorkspaceViewType.MARKETING_OVERVIEW
            listOf("lead", "crm", "receita", "revenue", "vendas").any(normalized::contains) -> WorkspaceViewType.CRM_REVENUE
            listOf("comentário", "comentario", "direct", "dm", "community", "inbox").any(normalized::contains) -> WorkspaceViewType.COMMUNITY_INBOX
            listOf("meta ads", "facebook ads", "instagram ads").any(normalized::contains) -> WorkspaceViewType.META_ADS
            listOf("google ads", "pmax", "search ads").any(normalized::contains) -> WorkspaceViewType.GOOGLE_ADS
            listOf("provider", "provedor", "integração", "integracao", "conexão", "conexao").any(normalized::contains) -> WorkspaceViewType.PROVIDERS
            listOf("device", "tablet", "dispositivo", "sessão", "sessao").any(normalized::contains) -> WorkspaceViewType.DEVICES
            listOf("workflow", "fluxo", "n8n").any(normalized::contains) -> WorkspaceViewType.WORKFLOWS
            listOf("evidence", "evidência", "evidencia", "prova", "receipt", "readback", "verificado").any(normalized::contains) -> WorkspaceViewType.SYSTEM_HEALTH
            listOf("segurança", "seguranca", "trust", "kill switch").any(normalized::contains) -> WorkspaceViewType.SECURITY_TRUST
            listOf("calendário", "calendario", "agenda", "publicação", "publicacao").any(normalized::contains) -> WorkspaceViewType.PUBLICATION_CALENDAR
            listOf("asset", "ativo", "criativo", "biblioteca").any(normalized::contains) -> WorkspaceViewType.ASSET_LIBRARY
            listOf("memória", "memoria", "knowledge", "conhecimento").any(normalized::contains) -> WorkspaceViewType.KNOWLEDGE_MEMORY
            listOf("analytics", "resultado", "outcome", "métrica", "metrica").any(normalized::contains) -> WorkspaceViewType.ANALYTICS_OUTCOMES
            else -> null
        }
    }
}
