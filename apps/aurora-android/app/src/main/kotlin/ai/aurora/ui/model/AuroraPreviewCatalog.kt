package ai.aurora.ui.model

object AuroraPreviewCatalog {
    fun manifestFor(
        type: WorkspaceViewType,
        device: DeviceUiState,
        connectivity: ConnectivityUiState,
    ): DynamicViewManifest {
        val components = when (type) {
            WorkspaceViewType.EXECUTIVE_OVERVIEW -> executiveOverview()
            WorkspaceViewType.ATTENTION_QUEUE -> attentionQueue()
            WorkspaceViewType.OBJECTIVE_DETAIL -> objectiveDetail()
            WorkspaceViewType.GOAL_GRAPH -> goalGraph()
            WorkspaceViewType.TASK_DETAIL -> taskDetail()
            WorkspaceViewType.CAPABILITY_CATALOG -> capabilityCatalog()
            WorkspaceViewType.CAPABILITY_DETAIL -> capabilityDetail()
            WorkspaceViewType.WORKFORCE -> workforce()
            WorkspaceViewType.AGENT_DETAIL -> agentDetail()
            WorkspaceViewType.MARKETING_OVERVIEW -> marketingOverview()
            WorkspaceViewType.CRM_REVENUE -> crmRevenue()
            WorkspaceViewType.COMMUNITY_INBOX -> communityInbox()
            WorkspaceViewType.META_ADS -> metaAds()
            WorkspaceViewType.GOOGLE_ADS -> googleAds()
            WorkspaceViewType.PROVIDERS -> providers()
            WorkspaceViewType.DEVICES -> devices(device)
            WorkspaceViewType.WORKFLOWS -> workflows()
            WorkspaceViewType.CONTENT_EDITORIAL -> contentEditorial()
            WorkspaceViewType.ASSET_LIBRARY -> assetLibrary()
            WorkspaceViewType.PUBLICATION_CALENDAR -> publicationCalendar()
            WorkspaceViewType.CAMPAIGN_DETAIL -> campaignDetail()
            WorkspaceViewType.LEAD_DETAIL -> leadDetail()
            WorkspaceViewType.KNOWLEDGE_MEMORY -> knowledgeMemory()
            WorkspaceViewType.ANALYTICS_OUTCOMES -> analyticsOutcomes()
            WorkspaceViewType.NOTIFICATIONS_INCIDENTS -> incidents()
            WorkspaceViewType.SYSTEM_HEALTH -> systemHealth(device, connectivity)
            WorkspaceViewType.INTEGRATIONS -> integrations()
            WorkspaceViewType.SECURITY_TRUST -> securityTrust(device)
            WorkspaceViewType.DEVICE_CONTROL -> deviceControl(device)
            WorkspaceViewType.WORKFLOW_DETAIL -> workflowDetail()
            WorkspaceViewType.GLOBAL_SEARCH -> globalSearch()
        }
        val isLiveDeviceSurface = type in setOf(
            WorkspaceViewType.DEVICES,
            WorkspaceViewType.SYSTEM_HEALTH,
            WorkspaceViewType.DEVICE_CONTROL,
            WorkspaceViewType.SECURITY_TRUST,
        )
        val provenance = if (isLiveDeviceSurface) {
            ProjectionProvenance.CONNECTED_WHEN_AVAILABLE
        } else {
            ProjectionProvenance.TARGET_PREVIEW
        }
        val risk = when (type) {
            WorkspaceViewType.META_ADS,
            WorkspaceViewType.GOOGLE_ADS,
            WorkspaceViewType.SECURITY_TRUST,
            WorkspaceViewType.DEVICE_CONTROL,
            -> RiskBand.HIGH
            WorkspaceViewType.COMMUNITY_INBOX,
            WorkspaceViewType.CRM_REVENUE,
            WorkspaceViewType.INTEGRATIONS,
            -> RiskBand.MEDIUM
            else -> RiskBand.LOW
        }
        val need = WorkspaceNeed(
            needsComparison = type in setOf(
                WorkspaceViewType.MARKETING_OVERVIEW,
                WorkspaceViewType.ANALYTICS_OUTCOMES,
                WorkspaceViewType.EXECUTIVE_OVERVIEW,
            ),
            needsControl = risk >= RiskBand.HIGH,
            needsEvidence = type in setOf(
                WorkspaceViewType.SYSTEM_HEALTH,
                WorkspaceViewType.WORKFLOW_DETAIL,
                WorkspaceViewType.TASK_DETAIL,
            ),
            risk = risk,
            itemCount = components.size,
            freshness = if (isLiveDeviceSurface) ProjectionFreshness.CURRENT else ProjectionFreshness.UNKNOWN,
        )
        return DynamicViewManifest(
            viewId = "tablet-v1-${type.name.lowercase()}",
            viewType = type,
            title = type.displayTitle,
            subtitle = subtitle(type),
            components = components,
            freshness = need.freshness,
            provenance = provenance,
            risk = risk,
            presentation = WorkspaceCompositionPolicy.choosePresentation(need),
            safeActions = safeActions(type),
        )
    }

    private fun subtitle(type: WorkspaceViewType): String = when (type) {
        WorkspaceViewType.EXECUTIVE_OVERVIEW -> "Resumo executivo sob demanda; nunca uma home fixa."
        WorkspaceViewType.ATTENTION_QUEUE -> "Somente o que realmente precisa de atenção humana."
        WorkspaceViewType.OBJECTIVE_DETAIL -> "Resultado desejado, progresso, riscos e outcomes."
        WorkspaceViewType.GOAL_GRAPH -> "Dependências, paralelismo, joins e caminho crítico."
        WorkspaceViewType.TASK_DETAIL -> "Unidade de trabalho, estado e evidence reconstruível."
        WorkspaceViewType.CAPABILITY_CATALOG -> "Descoberta capability-first: possibilidade não é permissão."
        WorkspaceViewType.CAPABILITY_DETAIL -> "Semântica, preconditions, targets e evidence strategy."
        WorkspaceViewType.WORKFORCE -> "Workers e times bounded quando realmente úteis."
        WorkspaceViewType.AGENT_DETAIL -> "Papel e atividade sem personificar authority."
        WorkspaceViewType.MARKETING_OVERVIEW -> "Objetivos, campanhas, conteúdo, leads e outcomes."
        WorkspaceViewType.CRM_REVENUE -> "Pipeline, next-best action e revenue com PII minimizada."
        WorkspaceViewType.COMMUNITY_INBOX -> "Comentários, DMs, FAQ, leads e escalations."
        WorkspaceViewType.META_ADS -> "Performance e budget com Human Control para impacto financeiro."
        WorkspaceViewType.GOOGLE_ADS -> "Search/PMax/Display/YouTube com semântica própria do provider."
        WorkspaceViewType.PROVIDERS -> "Health, account bindings, quotas e readback."
        WorkspaceViewType.DEVICES -> "Registration, session/trust, capabilities e last evidence."
        WorkspaceViewType.WORKFLOWS -> "Durable state, timers, blockers, attempts e evidence."
        WorkspaceViewType.CONTENT_EDITORIAL -> "Planejamento, revisão e readiness editorial."
        WorkspaceViewType.ASSET_LIBRARY -> "Ativos, metadata, rights e approval state."
        WorkspaceViewType.PUBLICATION_CALENDAR -> "Calendário editorial, conflitos e gaps."
        WorkspaceViewType.CAMPAIGN_DETAIL -> "Campanha cross-channel com goals, spend e creatives."
        WorkspaceViewType.LEAD_DETAIL -> "Lead/opportunity com consent, source e contexto minimizado."
        WorkspaceViewType.KNOWLEDGE_MEMORY -> "Conhecimento, decisões, freshness e provenance."
        WorkspaceViewType.ANALYTICS_OUTCOMES -> "Outcomes, attribution caveats, cohorts e goal linkage."
        WorkspaceViewType.NOTIFICATIONS_INCIDENTS -> "Incidentes úteis com contexto antes de urgência."
        WorkspaceViewType.SYSTEM_HEALTH -> "SLO/evidence completeness e health sem secrets."
        WorkspaceViewType.INTEGRATIONS -> "Conexões, scopes, accounts e credential state."
        WorkspaceViewType.SECURITY_TRUST -> "Trust posture, containment e security evidence."
        WorkspaceViewType.DEVICE_CONTROL -> "Capabilities locais, permissions, queue e recent receipts."
        WorkspaceViewType.WORKFLOW_DETAIL -> "State machine, timers, attempts, blockers e evidence."
        WorkspaceViewType.GLOBAL_SEARCH -> "Busca cross-domain sem árvore rígida."
    }

    private fun safeActions(type: WorkspaceViewType): List<String> = when (type) {
        WorkspaceViewType.META_ADS,
        WorkspaceViewType.GOOGLE_ADS,
        -> listOf("Comparar", "Abrir proposta", "Revisar approval")
        WorkspaceViewType.DEVICES,
        WorkspaceViewType.DEVICE_CONTROL,
        -> listOf("Inspecionar dispositivo", "Abrir evidence", "Reconciliar")
        WorkspaceViewType.WORKFLOWS,
        WorkspaceViewType.WORKFLOW_DETAIL,
        -> listOf("Abrir evidence", "Solicitar cancelamento")
        WorkspaceViewType.CAPABILITY_CATALOG -> listOf("Pesquisar", "Abrir detalhe", "Perguntar à Aurora")
        WorkspaceViewType.GLOBAL_SEARCH -> listOf("Pesquisar", "Refinar")
        else -> listOf("Abrir detalhe", "Pedir explicação")
    }

    private fun executiveOverview(): List<AuroraUiComponent> = listOf(
        previewNotice("Executive Overview está pronto para projections reais quando o UI BFF W16 for conectado."),
        AuroraUiComponent.Metric("Objetivos ativos", "—", "Aguardando projection canônica"),
        AuroraUiComponent.Metric("Atenção humana", "—", "Approvals/uncertain/stale", SemanticTone.APPROVAL),
        AuroraUiComponent.Metric("Outcomes verificados", "—", "Somente readback/evidence", SemanticTone.VERIFIED),
        AuroraUiComponent.Recommendation(
            "Progressive disclosure",
            "A Aurora abrirá apenas as views necessárias para a intenção atual.",
            "Regra do produto: conversa primeiro, workspace sob demanda.",
        ),
    )

    private fun attentionQueue(): List<AuroraUiComponent> = listOf(
        previewNotice("Fila estrutural pronta; itens reais virão de AttentionProjection."),
        AuroraUiComponent.ListBlock(
            "Categorias de atenção",
            listOf("Approval pendente", "Execution uncertain", "Projection stale", "Escalation", "High-value decision"),
            SemanticTone.APPROVAL,
        ),
        AuroraUiComponent.Status("Fila atual", "Sem projection live", "Nenhuma urgência é fabricada pela UI."),
    )

    private fun objectiveDetail(): List<AuroraUiComponent> = listOf(
        previewNotice("ObjectiveProjection ainda não conectado nesta APK."),
        AuroraUiComponent.Status("Objetivo", "Selecione via conversa", "Goal truth permanece no owner canônico."),
        AuroraUiComponent.Metric("Progresso", "—", "Nunca calculado localmente"),
        AuroraUiComponent.ListBlock("Drill-down", listOf("Goal Graph", "Task Detail", "Evidence")),
    )

    private fun goalGraph(): List<AuroraUiComponent> = listOf(
        previewNotice("GoalGraphProjection será renderizado como DAG bounded."),
        AuroraUiComponent.Graph(
            "Exemplo sintético de composição",
            nodes = listOf(
                GraphNode("goal", "Objetivo", "ACTIVE", SemanticTone.EXECUTION),
                GraphNode("a", "Lane A", "READY", SemanticTone.INFO),
                GraphNode("b", "Lane B", "BLOCKED", SemanticTone.APPROVAL),
                GraphNode("join", "Join", "WAITING", SemanticTone.NEUTRAL),
            ),
            edges = listOf(GraphEdge("goal", "a"), GraphEdge("goal", "b"), GraphEdge("a", "join"), GraphEdge("b", "join")),
        ),
    )

    private fun taskDetail(): List<AuroraUiComponent> = listOf(
        previewNotice("TaskProjection + Receipt/Readback refs serão conectados pelo owner."),
        AuroraUiComponent.Status("Task", "Nenhuma selecionada", "Attempts, dependencies e phase aparecerão aqui."),
        AuroraUiComponent.Timeline(
            "Evidence rail",
            listOf(
                TimelineEvent("Requested", "Sem task real ativa"),
                TimelineEvent("Receipt", "Nunca interpretado como sucesso", SemanticTone.INFO),
                TimelineEvent("Readback", "Define o estado verificado", SemanticTone.VERIFIED),
            ),
        ),
    )

    private fun capabilityCatalog(): List<AuroraUiComponent> = listOf(
        previewNotice("Catálogo visual capability-first pronto para CapabilityCatalogProjection."),
        AuroraUiComponent.Table(
            "Capability map",
            listOf("Classe", "Exemplos", "Authority"),
            listOf(
                listOf("UNDERSTAND", "Pesquisar · comparar · resumir", "Não"),
                listOf("CREATE", "Planejar · redigir · gerar", "Não"),
                listOf("OPERATE", "Publicar · atualizar · navegar", "Requer governance"),
                listOf("OBSERVE", "Monitorar · reconciliar · evidenciar", "Não"),
            ),
        ),
    )

    private fun capabilityDetail(): List<AuroraUiComponent> = listOf(
        previewNotice("Selecione uma capability após conexão do catálogo real."),
        AuroraUiComponent.ListBlock("Separação obrigatória", listOf("Availability", "Preconditions", "Targets", "Authority", "Evidence strategy")),
        AuroraUiComponent.Status("Permission", "Não inferida", "Capability availability nunca equivale a permission."),
    )

    private fun workforce(): List<AuroraUiComponent> = listOf(
        previewNotice("WorkforceProjection ainda não conectado."),
        AuroraUiComponent.Table(
            "Workers bounded",
            listOf("Role", "Lease", "Load", "Authority"),
            listOf(
                listOf("Specialist", "preview", "—", "NONE by default"),
                listOf("Deterministic route", "n/a", "—", "Owner-defined"),
            ),
        ),
    )

    private fun agentDetail(): List<AuroraUiComponent> = listOf(
        previewNotice("AgentProfileProjection ainda não conectado."),
        AuroraUiComponent.Status("Authority", "NONE", "Status de worker nunca implica poder."),
        AuroraUiComponent.ListBlock("Inspector", listOf("Role", "Capabilities", "Scope", "Lease", "Current task", "Evidence")),
    )

    private fun marketingOverview(): List<AuroraUiComponent> = listOf(
        previewNotice("Dados abaixo são estrutura visual; nenhuma métrica de negócio foi fabricada."),
        AuroraUiComponent.Metric("Spend", "—", "Aguardando providers"),
        AuroraUiComponent.Metric("Leads", "—", "Aguardando CRM"),
        AuroraUiComponent.Metric("Outcomes", "—", "Aguardando evidence", SemanticTone.VERIFIED),
        AuroraUiComponent.Recommendation(
            "Próxima decisão",
            "Quando projections estiverem conectadas, a Aurora priorizará recomendações por objetivo, risco e impacto.",
            "Preview de comportamento decision-oriented.",
        ),
    )

    private fun crmRevenue(): List<AuroraUiComponent> = listOf(
        previewNotice("CrmRevenueProjection ainda não conectado; PII não é simulada."),
        AuroraUiComponent.Table(
            "Pipeline",
            listOf("Stage", "Volume", "Freshness"),
            listOf(
                listOf("Qualified", "—", "UNKNOWN"),
                listOf("Opportunity", "—", "UNKNOWN"),
                listOf("Won", "—", "UNKNOWN"),
            ),
        ),
        AuroraUiComponent.Status("Consent", "Owner-required", "Ações ficam bloqueadas quando consent/purpose não são atuais.", SemanticTone.APPROVAL),
    )

    private fun communityInbox(): List<AuroraUiComponent> = listOf(
        previewNotice("CommunityProjection ainda não conectado; nenhuma mensagem pessoal é exibida."),
        AuroraUiComponent.ListBlock("Inbox lanes", listOf("FAQ verified", "Lead candidate", "Sensitive escalation", "Human review")),
        AuroraUiComponent.Status("Suggested response", "Preview only", "Suggestion nunca equivale a send authority.", SemanticTone.REASONING),
    )

    private fun metaAds(): List<AuroraUiComponent> = listOf(
        previewNotice("MetaAdsProjection ainda não conectado; financial writes permanecem governados."),
        AuroraUiComponent.Table(
            "Campaign table",
            listOf("Campaign", "Spend", "ROAS", "Budget"),
            listOf(listOf("Projection required", "—", "—", "—")),
        ),
        AuroraUiComponent.Status("Financial impact", "Human Control", "Qualquer alteração de budget exige proposal/approval.", SemanticTone.APPROVAL),
    )

    private fun googleAds(): List<AuroraUiComponent> = listOf(
        previewNotice("GoogleAdsProjection ainda não conectado; semântica não é copiada de Meta."),
        AuroraUiComponent.ListBlock("Surface", listOf("Search", "PMax", "Display", "YouTube", "Conversion readback")),
        AuroraUiComponent.Status("Provider state", "UNKNOWN", "Quota/degraded serão mostrados explicitamente."),
    )

    private fun providers(): List<AuroraUiComponent> = listOf(
        previewNotice("Provider health/readback será conectado via projections W08+."),
        AuroraUiComponent.Table(
            "Connections",
            listOf("Provider", "Health", "Read", "Write"),
            listOf(
                listOf("Meta", "UNKNOWN", "Projection", "Governed"),
                listOf("Google", "UNKNOWN", "Projection", "Governed"),
                listOf("CRM", "UNKNOWN", "Projection", "Governed"),
            ),
        ),
        AuroraUiComponent.Status("Credential possession", "≠ authority", "Conexão saudável não autoriza ação."),
    )

    private fun devices(device: DeviceUiState): List<AuroraUiComponent> {
        val runtime = device.runtimeIntegration
        return listOf(
            liveNotice("Estado local do tablet e read models W04/W14/W15 são LIVE; authority/execution continuam fora da UI."),
            AuroraUiComponent.Status("Environment", device.environment, "Build ${device.buildSha}", SemanticTone.INFO),
            AuroraUiComponent.Status("Presence", device.visibility, "Process generation ${device.processGeneration}", SemanticTone.VERIFIED),
            AuroraUiComponent.Status("Local service", device.localServicePhase, "Runtime W15 presente no APK."),
            AuroraUiComponent.Status("Device plane", device.registrationStatus, "Adapter W15-J: ${if (device.devicePlaneAdapterAvailable) "AVAILABLE" else "UNAVAILABLE"}"),
            AuroraUiComponent.Status(
                "Governed voice",
                runtime.governedVoiceStatus,
                "W04 ${runtime.w04RegistryVersion} · W15-G ${runtime.w15gVocabularyVersion} · ${runtime.currentDeviceCapabilities} DEVICE capabilities · ${runtime.deterministicVoiceCommands} deterministic commands",
                if (runtime.governedVoiceStatus == "READY") SemanticTone.VERIFIED else SemanticTone.APPROVAL,
            ),
            AuroraUiComponent.Status(
                "W07 voice ingress",
                runtime.w07VoiceIngressStatus,
                "Ausência de ingress mantém o fast path fail-closed em Conversation; UI não executa candidato.",
                SemanticTone.APPROVAL,
            ),
            AuroraUiComponent.ListBlock(
                "Offline queue · read-only",
                listOf(
                    "Status ${runtime.offlineQueueStatus}",
                    "Total ${runtime.offlineQueueTotal}",
                    "Deferred ${runtime.offlineQueueDeferred}",
                    "Reconciliation required ${runtime.offlineQueueReconciliationRequired}",
                ),
                if (runtime.offlineQueueReconciliationRequired > 0) SemanticTone.CRITICAL else SemanticTone.INFO,
            ),
        )
    }

    private fun workflows(): List<AuroraUiComponent> = listOf(
        previewNotice("WorkflowsProjection ainda não conectado."),
        AuroraUiComponent.ListBlock("Durable states", listOf("RUNNING", "WAITING", "COMPLETED", "UNCERTAIN", "RECONCILING")),
        AuroraUiComponent.Status("Replay", "Owner-controlled", "Reconnect não aparece como nova execução."),
    )

    private fun contentEditorial(): List<AuroraUiComponent> = listOf(
        previewNotice("Product extension pronta para EditorialProjection futura."),
        AuroraUiComponent.ListBlock("Editorial", listOf("Calendar strip", "Content cards", "Approval readiness", "Missing assets")),
    )

    private fun assetLibrary(): List<AuroraUiComponent> = listOf(
        previewNotice("Product extension pronta para AssetProjection futura."),
        AuroraUiComponent.ListBlock("Asset filters", listOf("Event", "Campaign", "Rights", "Approval", "Format")),
        AuroraUiComponent.Status("Rights", "Required", "Rights unknown bloqueia publicação."),
    )

    private fun publicationCalendar(): List<AuroraUiComponent> = listOf(
        previewNotice("Product extension pronta para PublicationCalendarProjection."),
        AuroraUiComponent.ListBlock("Calendar", listOf("Scheduled", "Needs approval", "Conflict", "Gap")),
        AuroraUiComponent.Status("Move item", "Proposal only", "Owner realiza write governado."),
    )

    private fun campaignDetail(): List<AuroraUiComponent> = listOf(
        previewNotice("CampaignProjection ainda não conectado."),
        AuroraUiComponent.ListBlock("Campaign detail", listOf("Goal", "Spend", "Performance", "Creatives", "Audience", "Provider health")),
    )

    private fun leadDetail(): List<AuroraUiComponent> = listOf(
        previewNotice("LeadProjection ainda não conectado; nenhum PII sintético é mostrado."),
        AuroraUiComponent.ListBlock("Lead detail", listOf("Consent", "Source", "Score", "Conversation summary", "Stage", "Next action")),
        AuroraUiComponent.Status("PII", "Minimized", "Consent/purpose ficam visíveis antes de qualquer ação."),
    )

    private fun knowledgeMemory(): List<AuroraUiComponent> = listOf(
        previewNotice("Knowledge/Memory projections ainda não conectadas."),
        AuroraUiComponent.ListBlock("Search dimensions", listOf("Semantic result", "Decision record", "Evidence ref", "Freshness", "Conflict")),
        AuroraUiComponent.Status("Memory", "Context only", "Memória nunca se torna authority."),
    )

    private fun analyticsOutcomes(): List<AuroraUiComponent> = listOf(
        previewNotice("OutcomeAnalyticsProjection ainda não conectado."),
        AuroraUiComponent.Metric("Outcome trend", "—", "Aguardando evidence"),
        AuroraUiComponent.Metric("Attribution quality", "—", "Correlation não prova causation"),
        AuroraUiComponent.Metric("Cost / latency", "—", "W17 owner"),
    )

    private fun incidents(): List<AuroraUiComponent> = listOf(
        previewNotice("IncidentProjection ainda não conectado."),
        AuroraUiComponent.Status("Incidentes críticos", "—", "Sem projection live; UI não fabrica alerta."),
        AuroraUiComponent.ListBlock("Incident detail", listOf("Severity", "Affected capability", "Owner", "Mitigation", "Timeline")),
    )

    private fun systemHealth(device: DeviceUiState, connectivity: ConnectivityUiState): List<AuroraUiComponent> {
        val runtime = device.runtimeIntegration
        return listOf(
            liveNotice("Connectivity, runtime Android e read models W04/W15 são LIVE; SLO/evidence completeness entram somente com W17."),
            AuroraUiComponent.Status("Network", connectivity.label, "Estado observado localmente", if (connectivity.online) SemanticTone.VERIFIED else SemanticTone.CRITICAL),
            AuroraUiComponent.Status("Tablet runtime", device.visibility, "Service ${device.localServicePhase}", SemanticTone.INFO),
            AuroraUiComponent.Status(
                "Voice routing",
                runtime.governedVoiceStatus,
                "W04 ${runtime.w04RegistryVersion} · W15-G ${runtime.w15gVocabularyVersion} · W07 ${runtime.w07VoiceIngressStatus}",
                if (runtime.governedVoiceStatus == "READY") SemanticTone.VERIFIED else SemanticTone.APPROVAL,
            ),
            AuroraUiComponent.Status(
                "Offline queue",
                runtime.offlineQueueStatus,
                "${runtime.offlineQueueTotal} total · ${runtime.offlineQueueDeferred} deferred · ${runtime.offlineQueueReconciliationRequired} reconciliation required",
                if (runtime.offlineQueueReconciliationRequired > 0) SemanticTone.CRITICAL else SemanticTone.INFO,
            ),
            AuroraUiComponent.Metric("Evidence completeness", "—", "W17 projection futura"),
            AuroraUiComponent.Metric("p95 latency", "—", "Nenhum SLO inventado"),
        )
    }

    private fun integrations(): List<AuroraUiComponent> = listOf(
        previewNotice("IntegrationProjection ainda não conectado."),
        AuroraUiComponent.ListBlock("Connections", listOf("Providers", "Accounts", "Webhooks", "Workflows", "Scopes", "Health")),
        AuroraUiComponent.Status("Connection", "≠ authority", "Re-auth/reconnect serão requests governados."),
    )

    private fun securityTrust(device: DeviceUiState): List<AuroraUiComponent> = listOf(
        liveNotice("Presence/environment local são LIVE; trust/policy remotos ainda aguardam projection."),
        AuroraUiComponent.Status("Environment", device.environment, "UI profile ${device.uiProfile}", SemanticTone.INFO),
        AuroraUiComponent.Status("Device session", device.registrationStatus, "Session/trust não são business authority."),
        AuroraUiComponent.ListBlock("Trust center", listOf("Policy version", "Kill switch", "Suspicious state", "Security evidence"), SemanticTone.CRITICAL),
    )

    private fun deviceControl(device: DeviceUiState): List<AuroraUiComponent> {
        val runtime = device.runtimeIntegration
        return listOf(
            liveNotice("Runtime/read models locais disponíveis; qualquer side effect continua atrás de W07/W15-F e revalidação atual."),
            AuroraUiComponent.Status("Device adapter", if (device.devicePlaneAdapterAvailable) "AVAILABLE" else "UNAVAILABLE", "Availability não autoriza execução."),
            AuroraUiComponent.Status(
                "Current DEVICE capabilities",
                runtime.currentDeviceCapabilities.toString(),
                "Snapshot W04/W15-C usado apenas como availability/precondition; não é permission nem authority.",
                SemanticTone.INFO,
            ),
            AuroraUiComponent.Status(
                "W07 voice ingress",
                runtime.w07VoiceIngressStatus,
                "NOT_COMPOSED mantém comandos de voz fora da execução.",
                SemanticTone.APPROVAL,
            ),
            AuroraUiComponent.ListBlock(
                "Offline queue · no blind retry",
                listOf(
                    "${runtime.offlineQueueDeferred} deferred",
                    "${runtime.offlineQueueReconciliationRequired} reconciliation required",
                    "UI não chama drain/retry",
                ),
                if (runtime.offlineQueueReconciliationRequired > 0) SemanticTone.CRITICAL else SemanticTone.INFO,
            ),
            AuroraUiComponent.ListBlock("Preconditions", listOf("Session current", "Capability fresh", "Android permission", "W07 authority", "Evidence strategy")),
        )
    }

    private fun workflowDetail(): List<AuroraUiComponent> = listOf(
        previewNotice("WorkflowDetailProjection ainda não conectado."),
        AuroraUiComponent.Timeline(
            "State machine",
            listOf(
                TimelineEvent("Current node", "Projection required", SemanticTone.INFO),
                TimelineEvent("Timer", "Projection required"),
                TimelineEvent("Evidence", "Projection required", SemanticTone.VERIFIED),
            ),
        ),
        AuroraUiComponent.Status("Cancel", "Request only", "UI nunca avança state machine diretamente."),
    )

    private fun globalSearch(): List<AuroraUiComponent> = listOf(
        previewNotice("SearchProjection ainda não conectado; busca local nesta APK navega apenas pelo catálogo visual."),
        AuroraUiComponent.ListBlock("Search scope", listOf("Objectives", "Tasks", "Capabilities", "Devices", "Evidence", "Content")),
        AuroraUiComponent.Status("Tenant isolation", "Required", "Sem permission não há resultado nem inferência de existência."),
    )

    private fun previewNotice(body: String): AuroraUiComponent =
        AuroraUiComponent.TextBlock("TARGET PREVIEW", body, SemanticTone.REASONING)

    private fun liveNotice(body: String): AuroraUiComponent =
        AuroraUiComponent.TextBlock("LIVE + CONNECTED WHEN AVAILABLE", body, SemanticTone.VERIFIED)
}
