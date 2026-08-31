# LEGACY CAPABILITY & REUSE SALVAGE REGISTER — Aurora AI-Native

Status: `ACTIVE_CANONICAL_PLANNING_INPUT`  
Scope: planning/governance only; **never runtime authority**.  
Audit date: 2026-08-31  
Source archive SHA-256: `d4388cdefd21c6ba6dcc24e1214d037d499370533bc870890c7881f2027a55c2`  
First-party files classified: **541**  
Capability seeds: **69**

## 1. Decision

The legacy ZIP is a **salvage mine, not a codebase successor**. Every source file is classified and defaults to `NO_DIRECT_RUNTIME_IMPORT`. A future owner wave may reuse a concept, behavior, UX state, capability verb, provider metadata or test scenario only after re-specification against canonical contracts and the four Risk Validation gates.

This register does not release W03+ implementation, does not reopen W00/W01, does not modify W02 ownership, and does not make any legacy plugin/agent/executor authoritative.

## 2. Canonical salvage rules

- Capability vocabulary may be promoted by W04 only after deduplication, target-neutral naming, risk/side-effect classification, permission requirements, availability/freshness and readback/evidence semantics.
- Legacy event code may become only an in-memory/test transport until W03 durable outbox/inbox, idempotency, ordering, replay, DLQ and timer semantics are satisfied.
- Legacy agent/Manus loops are behavior fixtures. Stub, dummy or simulated paths are never implementation evidence.
- Legacy browser/file/shell/device/provider actions never execute directly from model/agent output. W07+ current Policy/Authority/ActionIntent/Executor/Receipt/Evidence boundaries always win.
- Legacy voice/dashboard/face code is UX/protocol reference only. Hardcoded localhost/session assumptions are non-canonical.
- Learning heuristics may seed W18 observations/evals only. They cannot self-promote production behavior or authority.
- Historical PASS/certificate reports are provenance, not acceptance evidence.
- Secret-bearing configuration and local/user/runtime data are excluded from migration.
- Duplicate content is represented once semantically; duplicate files do not inflate capability counts.

## 3. Classification summary

| Reuse class | Files |
|---|---:|
| `CAPABILITY_SEED` | 113 |
| `TEST_SCENARIO_CANDIDATE` | 83 |
| `HISTORICAL_REFERENCE` | 77 |
| `UX_REFERENCE` | 65 |
| `DUPLICATE_REFERENCE` | 41 |
| `REFERENCE_ONLY` | 36 |
| `BUILD_CONFIG_REFERENCE` | 28 |
| `PROTOCOL_UX_REFERENCE` | 22 |
| `CONCEPT_REUSE` | 17 |
| `ANTI_PATTERN_REFERENCE` | 8 |
| `SECURITY_EXCLUDE_DATA` | 8 |
| `BEHAVIOR_REFERENCE` | 7 |
| `INTEGRATION_REFERENCE` | 7 |
| `OBSERVABILITY_REFERENCE` | 7 |
| `DISCARD_RUNTIME_DATA` | 5 |
| `DISCARD_DEPENDENCY_LOCK` | 5 |
| `SECURITY_REFERENCE_ONLY` | 4 |
| `SECURITY_EXCLUDE` | 3 |
| `DISCARD_ANTIPATTERN` | 2 |
| `DOMAIN_BEHAVIOR_REFERENCE` | 2 |
| `MODEL_ADAPTER_REFERENCE` | 1 |

Priority: `P0` 152, `P1` 195, `P2` 100, `P3` 94

## 4. Risk signals found in the archive

| Signal | Files | Governance consequence |
|---|---:|---|
| `STUB_OR_SIMULATION` | 120 | Cannot count as implementation or acceptance evidence. |
| `DUPLICATE_CONTENT` | 99 | Deduplicate semantics; avoid capability count inflation. |
| `LOCALHOST_COUPLING` | 63 | Rebuild behind gateway/session/transport contracts. |
| `NO_CANONICAL_AUTHORITY_BOUNDARY` | 52 | Must pass W02/W07 boundary before any side effect. |
| `DIRECT_PROCESS_EXECUTION` | 39 | Treat as high-risk executor reference; no direct promotion. |
| `RANDOMIZED_DECISION_OR_ID` | 22 | Never use randomness as validation/authority/evidence. IDs must use canonical generators. |
| `SECRET_MATERIAL_OR_PATTERN` | 14 | Do not copy secret values; rotate/revoke where potentially live. |
| `GOD_OBJECT_SIZE` | 11 | Split by canonical ownership; do not recreate central orchestrator. |
| `POTENTIAL_USER_OR_RUNTIME_DATA` | 8 | Exclude from source/control/context seeding unless separately governed. |
| `INCOMPLETE_IMPLEMENTATION` | 5 | Use only as scenario/reference until owner wave implements fully. |
| `DEPENDENCY_SNAPSHOT` | 5 | Do not import historical lockfile. |
| `DYNAMIC_EVAL` | 1 | Reject direct reuse; security review only. |

## 5. Key salvage decisions

| Legacy source | Owner | Decision | Salvage value |
|---|---|---|---|
| `cerebro/Telencefalo/Lobos_Cerebrais/PluginManager.js` | W04 | **CONCEPT_REUSE** | Capability discovery/lifecycle/health/timeouts. Re-specify; never promote dynamic wrappers directly. |
| `cerebro/Telencefalo/Lobos_Cerebrais/PluginAdapter.js` | W04 | **ANTI_PATTERN** | Stub fallback can report apparent health without real implementation. |
| `cerebro/Telencefalo/Lobos_Cerebrais/AuroraOrchestrator.js` | W04/W05 | **ANTI_PATTERN** | God object mixes routing, plugins, memory, learning, WebSocket, execution and diagnostics. |
| `system/core/AuroraEventBus.js` | W03 | **CONCEPT_REUSE** | Good in-memory request/event semantics; lacks durability/idempotency/replay/tenant envelope. |
| `system/data/database_manager.js` | W03 | **CONCEPT_REUSE** | Persistence interface reference only; W03 owns durable storage semantics. |
| `system/manus/src/agent_core/agent_loop.py` | W05 | **BEHAVIOR_REFERENCE** | Observe/plan/tool loop reference, but tool selection and outputs are explicitly simulated. |
| `system/manus/src/orchestration/tool_orchestrator.py` | W05/W07 | **BEHAVIOR_REFERENCE** | Tool-selection interface reference; legacy selection is dummy and shell-oriented. |
| `cerebro/Telencefalo/Lobos_Cerebrais/Lobo_Temporal/Hipocampo/memory/MemoryManager.js` | W06 | **CONCEPT_REUSE** | Memory types, importance, promotion and indices; add tenant/provenance/freshness/consent. |
| `cerebro/Telencefalo/Diencefalo/Talamo/integracao/ExternalServiceIntegrator.js` | W08/W04 | **CONCEPT_REUSE** | Service capabilities, auth metadata, rate limits, cache/health metrics; direct/simulated execution not reusable. |
| `system/windows/windows-integration.js` | W15/W04 | **CAPABILITY_SEED** | Concrete device capability vocabulary; direct child_process execution is prohibited. |
| `system/voice/AuroraVoiceEngine.js` | W14/W15 | **PROTOCOL_UX_REFERENCE** | Voice state machine, wake/listen/process/speak, client timeout/reconnect semantics. |
| `face/interface/scripts/voice-interface-bridge.js` | W15/W16 | **PROTOCOL_UX_REFERENCE** | Presence/voice interaction reference; hardcoded localhost assumptions must be removed. |
| `cerebro/Telencefalo/Lobos_Cerebrais/Lobo_Temporal/Amigdala/AdaptiveLearningEngine.js` | W18 | **CONCEPT_REUSE** | Learning signal inventory only; no direct online production adaptation. |
| `system/core/EventLogger.js` | W17 | **OBSERVABILITY_REFERENCE** | Logging/trace event vocabulary reference; evidence chain remains canonical. |
| `cerebro/Telencefalo/Diencefalo/Hipotalamo/validation_system/ValidationSystem.js` | NONE | **DISCARD** | Randomized validation cannot be used. |
| `cerebro/Telencefalo/Lobos_Cerebrais/Lobo_Frontal/Planejamento/quantum_orchestration/QuantumOrchestrator.js` | NONE | **DISCARD** | Random choice presented as optimization; no valid algorithmic basis. |
| `system/manus/google-cloud-config.json` | NONE | **SECURITY_EXCLUDE** | Secret-bearing legacy configuration; never commit or reuse; rotate/revoke live credentials. |
| `docs/RELATORIO_TESTE_FINAL_2025-07-18.md` | W20 | **HISTORICAL_EVIDENCE** | Use failures as test scenarios; historical readiness claims are not canonical evidence. |
| `docs/aurora/relatorios/aurora/system/manus/relatorio_lógicas_incompletas_detalhado.md` | W05/W20 | **HISTORICAL_EVIDENCE** | Documents stubs/incomplete logic; valuable negative fixture. |

## 6. Wave handoff map

- **W03:** EventBus/EventCore/database patterns -> in-memory test transport, persistence requirements, replay/timeout scenarios. No legacy bus becomes durable runtime.
- **W04:** Highest-value handoff: deduplicated capability seed catalog, plugin discovery/health/availability concepts, task scheduling verbs. Capability-first and target-neutral only.
- **W05:** Manus agent loop, meta-cognition and tool-selection behavior -> benchmark/test fixtures for bounded agent runtime; no dummy selection.
- **W06:** MemoryManager/context/long-term-memory concepts -> memory taxonomy, importance, promotion/retrieval; add tenant, provenance, trust, freshness, consent, retention.
- **W07:** Browser/file/shell/deploy/device execution failure cases -> executor negative tests. Direct process execution is explicitly non-reusable.
- **W08:** ExternalServiceIntegrator/service metadata -> provider capability/auth/rate-limit/health/readback requirements.
- **W09:** Only generic automation/integration behavior is relevant; no n8n workflow in this ZIP becomes governed automation automatically.
- **W10-W13:** Marketing/PPC/content examples -> domain intent/test fixtures only; vertical business semantics remain owned by their waves.
- **W14:** WebSocket/client session/timeout/reconnect voice bridge concepts -> command-session/device-gateway tests.
- **W15:** Windows and voice sources -> native capability vocabulary, permission/consent/reconnect scenarios and Presence state machine; implementation must be platform-native/governed.
- **W16:** Face/dashboard panels -> UX/workspace reference; rebuild against canonical read models and approvals/evidence views.
- **W17:** EventLogger/monitoring/diagnostics -> telemetry signal candidates and failure reconstruction tests.
- **W18:** AdaptiveLearningEngine -> observation/features candidates only; eval/promotion must be evidence-based, shadow/canary and rollbackable.
- **W19:** Legacy auth/security/shell/eval/stub weaknesses -> threat-model corpus and negative security tests; never security implementation source.
- **W20:** Historical integration tests/reports -> release scenario corpus, especially contradictions between “certified” claims and real failure reports.

## 7. Archive integrity findings

- The archive contains contradictory internal readiness claims: `CERTIFICADO_OFICIAL_SISTEMA_AURORA.md` claims `100% OPERACIONAL` and `120/120` plugins, while `RELATORIO_TESTE_FINAL_2025-07-18.md` records **17/22 tests passed (77.3%)**, plugin system **1/4 (25%)**, and `NOT READY`. Therefore legacy certificates are explicitly non-authoritative.
- The Manus incomplete-logic report explicitly documents dummy tool selection, simulated returns and placeholders. Stub-backed tests may seed negative scenarios but never count as functional evidence.
- `system/windows/windows-integration.js` references multiple actions without implementations (`closeApplication`, `focusApplication`, `createFile`, `deleteFile`, `searchFiles`, `muteSystem`, `unmuteSystem`, `getSystemVolume`). The file is useful as capability vocabulary, not reusable executor code.
- Secret-like material exists in legacy configuration. No secret value is copied into these artifacts; credential-bearing files are `SECURITY_EXCLUDE`.

## 8. Capability seed catalog

`LEGACY_CAPABILITY_SEED_CATALOG.csv` contains 69 deduplicated candidate capabilities. Every row is `SEED_ONLY_NOT_CANONICAL`. W04 must accept/reject/rename each candidate; later waves may not treat this CSV as an executable registry.

High-risk examples include `browser.console.execute`, `shell.execute`, `file.delete`, `service.deploy.*` and `device.power.*`. Their presence in the seed catalog is **not permission to implement or execute them**; it ensures risk and authority requirements are considered explicitly instead of being rediscovered ad hoc.

## 9. Per-file traceability

The Drive governance mirror `AURORA_LEGACY_SOURCE_FILE_CLASSIFICATION_2026-08-31` classifies every first-party file with source SHA-256, size, lines, reuse class, priority, primary owner wave, candidate consumers, risk flags, duplicate relationship and salvage rationale. It is the file-level index for this archive review; Git keeps the curated planning artifacts rather than mirroring sensitive/oversized legacy content.

No secret value from the archive is copied into this register. Secret-bearing sources are named only so they can be excluded and remediated.

## 10. Acceptance requirements for any future promotion

1. Owner wave revalidates current `main`, current manual/ADR, publication barriers and this register.
2. Promote the **smallest semantic unit**, never a directory tree by default.
3. Re-specify inputs/outputs using canonical IDs, tenant, correlation, errors and versioning.
4. Classify side effect, risk, reversibility, authority requirements, readback/evidence and idempotency.
5. Remove hardcoded credentials, localhost assumptions, random validation/IDs, stubs and hidden direct execution.
6. Add correctness, safety/authority, performance/economics and failure/recoverability evidence.
7. Record the promotion decision and source file SHA in that wave’s evidence/handoff.

## 11. Explicit non-promotion list

- `AuroraOrchestrator.js` as a central runtime.
- `PluginAdapter` fallback/stub success semantics.
- `ValidationSystem` randomized validation.
- `QuantumOrchestrator` randomized “optimal” selection.
- direct shell/process/browser/device/provider executors without canonical authority/executor boundaries.
- historical auth/security logic as replacement for W02/W19.
- historical lockfiles, logs, generated runtime data, user memory/profile data or credential files.
- historical certificates/reports as acceptance evidence.

## 12. Lifecycle

This register remains active planning input until all listed salvage candidates are either promoted by their owner wave with evidence, explicitly rejected, or archived. A promoted item must record its canonical successor and source SHA so provenance stays auditable.
