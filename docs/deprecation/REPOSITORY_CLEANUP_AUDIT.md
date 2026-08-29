# REPOSITORY_CLEANUP_AUDIT — W00-G

## Audit authority

- Repository: `luizanunciostoca/aurora-ai-native`
- Audited baseline: `c61d1f4c534c54e29006b2fa2d87812822e0903d`
- Branch: `wave/00g-cleanup-audit`
- Mode: `AUDIT_FIRST / EVIDENCE_REQUIRED`
- Lifecycle: `ACTIVE -> DEPRECATED -> QUARANTINED -> REMOVABLE -> REMOVED`

The W00 ownership registry grants W00-G write ownership only over `docs/deprecation/**`, `tools/audit/**`, and cleanup/deprecation evidence created by this subwave. Runtime/scaffold, `reference/**`, `**/legacy-reference/**`, `docs/migration/**`, and paths owned by W00-A..F remain read-only during the parallel phase. Therefore no foreign-path removal is permitted in this audit branch.

## Inventory

The audited baseline contains **59 committed files**. Every file is classified in `docs/deprecation/REPOSITORY_FILE_CLASSIFICATION.csv`.

Primary classification totals:

| Class | Count | Meaning |
|---|---:|---|
| ACTIVE_CANONICAL | 7 | Baseline authority/policy files |
| SCAFFOLD_ACTIVE | 13 | Intentional future-runtime status markers |
| LEGACY_REFERENCE | 35 | Non-authoritative source/provenance references |
| REFERENCE_ONLY | 1 | Provenance-only committed reference |
| BROKEN_REFERENCE | 2 | Active migration documents containing stale live-tree assertions |
| DEPRECATED | 1 | Completed one-time migration helper |
| REMOVABLE | 0 | No file currently passes both evidence and ownership gates |

`DUPLICATE` and `BROKEN_REFERENCE` can also appear as flags on a primary class.

## Canonical runtime reachability

The root README and migration closeout explicitly state that v0.3 is a **development scaffold**, not an implemented target runtime. The current `main` baseline contains status markers plus selected legacy/reference source. There is no active canonical application/service entrypoint that imports from `legacy-reference`, `legacy-manus-reference`, or `reference/`.

**Result:** no P0/P1 runtime dependency on legacy/reference is present at the audited SHA.

This finding must be revalidated after W00-A/W00-C and later runtime waves are merged.

## Broken-reference findings

### BR-001 — legacy Electron EventBus path missing

`apps/aurora-desktop/legacy-reference/face/interface/main.js` and `voice-websocket-bridge.js` import `../../system/core/AuroraEventBus.js`. That path does not exist in the committed tree.

Disposition: `LEGACY_REFERENCE + BROKEN_REFERENCE`. Do not repair inside legacy reference. The future runtime must use canonical typed contracts/event transport.

### BR-002 — legacy Electron dev fallback missing

`main.js` attempts `electron-reload` and then `./electron-reload-stub.js`; the package metadata does not declare `electron-reload`, and the stub is not committed.

Disposition: reference-only inconsistency; no runtime blocker.

### BR-003 — legacy package metadata points to absent test/build files

`apps/.../interface/package.json` declares Jest setup at `jest.setup.js` and a Windows builder icon at `assets/aurora-icon.png`; neither is present in the committed mapped reference. Multiple start scripts also resolve to the same Electron entrypoint.

Disposition: `LEGACY_REFERENCE + BROKEN_REFERENCE`. Do not make the package canonical.

### BR-004 — legacy HTML assets/dashboard paths absent

`apps/.../interface/html/index.html` references absent styles/assets such as `../styles/main.css`, `../styles/voice-integration.css`, `../../processador/voz/VoiceRecognitionEnhanced.css`, and a dashboard path not present in the mapped Git tree.

Disposition: preserve visual provenance only; successor UI must be rebuilt in canonical application paths.

### BR-005 — preload/main IPC contract drift

The legacy preload exposes invocation names including `voice-update-settings`, `process-command`, `process-voice-command`, `start-voice-listening`, `speak-text`, `get-system-status`, `toggle-fullscreen`, and others that have no matching handlers in the committed `main.js`. Several names also differ (`minimize-window` vs `window-minimize`, `close-window` vs `window-close`).

Disposition: historical interface contract only. A future typed IPC/API contract must replace it.

### BR-006 — migration status describes paths not present in GitHub live

`docs/migration/STRUCTURE_STATUS.csv` claims current files/counts for paths that are absent from the audited Git tree, including examples such as `apps/aurora-web/legacy-reference`, Android duplicated legacy UI trees, `services/aurora-gateway/legacy-reference`, n8n source-library/curated-candidates, and several `reference/` collections. It also reports old counts for mapped legacy areas.

Disposition: `BROKEN_REFERENCE`, severity `P1-GOVERNANCE`. W00-G must not edit `docs/migration/**` while its lock is read-only; correction is handed to the coordinator/W00-F after parallel accepted SHAs are known.

### BR-007 — Android porting plan asserts absent duplicated UI tree

`docs/migration/ANDROID_UI_PORTING_PLAN.md` says the UI is duplicated at `apps/aurora-android/reference/legacy-presence-ui`, but that tree is absent from GitHub live at the audited SHA.

Disposition: `BROKEN_REFERENCE`, correction deferred under ownership rules.

## Duplicate findings

### DUP-001 — duplicated security notice blob

The same Git blob (`b1a168d2a0aa64185c76aea49d44de1a4268d186`) is committed at:

- `reference/original-manus/manus/config/SECURITY_NOTICE.txt`
- `services/agent-runtime/legacy-manus-reference/manus/config/SECURITY_NOTICE.txt`

This is a known exact-content duplicate. It is **not removable now** because both locations carry provenance/legacy context and both are protected during the parallel phase. Canonical security policy already exists at `docs/security/SECURITY_NOTICE.md`.

## Placeholder / historical findings

Representative Manus files explicitly state that they are placeholders for the actual implementation, including `agent_advance_phase.py` and `browser_click.py`; `file_read.py` retains compatibility/placeholder wording. The legacy report `manus/docs/relatorio_final_sucesso.py` is a historical success report that references tests/configuration not present in the curated baseline.

Disposition: the entire `services/agent-runtime/legacy-manus-reference/**` tree remains `LEGACY_REFERENCE`. These files are rewrite inputs, not runtime acceptance evidence.

## Empty, backup and ambiguous-name scan

Tree metadata shows no zero-byte committed files in the audited baseline. No committed path matches the targeted ambiguous naming patterns `backup`, `copy`, `final2`, `new`, or `new-new` as a file-generation suffix/prefix candidate.

## Dead / completed script finding

`tools/migration/import-v03-baseline.sh` is a one-time baseline import helper. The migration closeout documents that v0.3 import is complete-by-classification. The script therefore moves from `ACTIVE` to `DEPRECATED`, but not to `QUARANTINED/REMOVABLE` during W00 parallel execution because `tools/migration/**` is outside W00-G write ownership and remains useful as provenance/reproducibility evidence.

## Removal decisions

No file was removed.

This is intentional and evidence-based, not a failure to clean: every plausible removal candidate either (a) retains provenance value, (b) lacks a fully accepted successor, or (c) is ownership-locked until W00-A..F accepted SHAs are known. Removing any such file now would violate the governing cleanup policy.

## Audit tooling

`tools/audit/repository-cleanup-audit.mjs` was added as dependency-free repeatable tooling. It scans a checkout for exact-content duplicates, zero-byte files, suspicious backup/copy naming, structural markers, and broken relative JS/HTML/CSS references; canonical broken references make the tool fail closed, while legacy/reference broken links remain reported evidence rather than becoming runtime authority.
