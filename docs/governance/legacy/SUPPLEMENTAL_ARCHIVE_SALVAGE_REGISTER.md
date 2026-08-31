# Supplemental Archive Salvage Register — Nova Aurora + n8n

Status: `ACTIVE_CANONICAL_PLANNING_INPUT`  
Audit date: 2026-08-31  
Scope: governance/reference only; never runtime authority.

This supplement extends `LEGACY_CAPABILITY_AND_REUSE_SALVAGE_REGISTER.md` with two additional user-provided archives. It does not release W03+, reopen W00/W01, change W02 ownership/state, or authorize any workflow/source for direct execution.

## 1. Nova aurora.zip

Source SHA-256: `d3df1ea55e0ae68f8c6c009e683edae538e4b5d9a45952ae06f0835cff60c23f`

Archive inventory:
- 36,957 entries.
- ~808 MB uncompressed.
- 176 first-party candidates after excluding vendored dependencies/build/cache/runtime baggage.
- 165/176 candidates are exact byte duplicates of material already classified by the prior legacy salvage.
- 11 unique delta items remain.
- 10 unique delta items are preserved as `REFERENCE_ONLY_NOT_RUNTIME_AUTHORITY`.
- 1 unique local/runtime data item is excluded.

Unique preserved delta includes updated/unique dashboard/face/voice bridge references plus Manus↔Aurora bridge/lifecycle references and historical test output. Duplicate files are not copied again; prior source SHA classification remains authoritative.

Drive evidence:
- `LEGACY_SALVAGE_REFERENCE/03_NOVA_AURORA_UNIQUE_DELTA/NOVA_AURORA_UNIQUE_DELTA_REFERENCE_ONLY.zip`
- `NOVA_AURORA_DELTA_CLASSIFICATION_2026-08-31`
- `NOVA_AURORA_SALVAGE_AUDIT_SUMMARY.json`

Promotion rule: owner wave re-specifies the smallest semantic unit against current canonical contracts. No Electron/EventBus/Manus bridge code gains runtime authority by preservation.

## 2. n8n-workflows-main.zip

Source SHA-256: `4173960e9aed58b773482b2e660976533dabcc982ddd3e14d6790a670eebd89b`

Archive inventory:
- 2,058 entries.
- 2,053 workflow JSON files.
- 2,053/2,053 parse successfully.
- 1,997 exact-content unique workflows.
- 1,979 structurally unique workflows after normalization.
- 74 structural duplicates are indexed but not copied.
- 10 empty/invalid workflow records are excluded.
- 32 workflows containing direct command/SSH execution surfaces are `INDEX_ONLY_HIGH_RISK_EXECUTION`.
- 1,937 structurally deduplicated patterns are preserved as sanitized reference envelopes.

### 2.1 Sanitization boundary

Preserved n8n patterns are intentionally **not direct importable production workflows**:
- source `pinData` removed;
- workflow/node runtime IDs and webhook IDs removed;
- credential identities replaced with reference placeholders;
- possible literal secrets redacted;
- source execution state forced inactive;
- each JSON wrapped in an Aurora `REFERENCE_ONLY_NOT_RUNTIME_AUTHORITY` envelope carrying source path/SHA and structural hash.

The source collection README states the workflows were gathered from multiple public sources. Provenance/licensing is therefore mixed. Direct code/content promotion requires provenance/license confirmation in addition to normal Aurora governance.

### 2.2 W09 ownership

W09 remains the sole owner of n8n execution-fabric semantics. A workflow pattern can inform:
- trigger/subscription shapes;
- branching/merge/retry/timeouts;
- provider binding patterns;
- data transformation;
- orchestration topology;
- human/AI handoff;
- observability/error handling.

It cannot by itself become:
- source of truth;
- action authority;
- approval;
- provider credential;
- production workflow;
- bypass around W02/W07.

Drive evidence under `LEGACY_SALVAGE_REFERENCE/W09_N8N_REFERENCE`:
- `N8N_WORKFLOW_REFERENCE_CATALOG_2026-08-31`
- `N8N_W09_SANITIZED_PATTERN_LIBRARY.zip`
- `N8N_HIGH_RISK_EXECUTION_INDEX_ONLY.csv`
- `N8N_STRUCTURAL_DUPLICATES_INDEX.csv`
- `N8N_EMPTY_INVALID_INDEX.csv`
- `N8N_SALVAGE_AUDIT_SUMMARY.json`

### 2.3 Downstream reference coverage

Sanitized, deduplicated downstream subsets:
- W10 Revenue/CRM: 167 patterns.
- W11 Organic/Community: 343 patterns.
- W12 Meta Ads: 1 Meta Lead Ads-specific pattern only.
- W17 Observability: 41 patterns.
- W18 AI/Evals: 758 patterns.
- Marketing Analytics: 8 patterns.

**W13 Google Ads coverage gap:** no direct Google Ads / GoogleAds / AdWords workflow or node was found. Google Analytics and Search Console examples are not relabeled as Google Ads coverage. W13 must use official Google Ads APIs/adapters and canonical Aurora governance.

**W12 coverage limitation:** the single Meta-specific pattern is a lead-ad trigger reference, not evidence of full campaign/adset/ad operations.

## 3. Cross-archive deduplication rule

The physical preservation set is source-aware and SHA-aware:
1. existing master salvage remains the canonical physical archive for the prior ZIP;
2. `Nova aurora.zip` stores only unique delta not already in that master;
3. n8n stores sanitized structural references rather than duplicating source credentials/runtime state;
4. duplicate structural n8n workflows remain index-only;
5. high-risk direct command/SSH n8n workflows remain index-only.

## 4. Security and authority invariants

- Intelligence != Authority != Execution.
- n8n is execution fabric, never authority.
- Source `active=true` is historical metadata only.
- No credential metadata or pin data grants provider access.
- Shell/SSH/process examples do not become executable Aurora capabilities by preservation.
- Current Policy/Authority/ActionIntent/Executor/Receipt/Evidence boundaries always win.
- Mixed-source workflow provenance must be cleared before direct reuse.
- No supplemental archive changes W02 release state or releases W03+.

## 5. Lifecycle

Each owner wave must record `PROMOTE`, `REWRITE`, `REJECT`, or `ARCHIVE` for any consumed reference and cite the source SHA/structural hash in wave evidence. Preservation is provenance and design input, not acceptance evidence.
