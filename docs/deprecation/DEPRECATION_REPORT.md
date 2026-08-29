# DEPRECATION_REPORT — W00-G

Baseline: `c61d1f4c534c54e29006b2fa2d87812822e0903d`

## Lifecycle

`ACTIVE -> DEPRECATED -> QUARANTINED -> REMOVABLE -> REMOVED`

`DUPLICATE` and `BROKEN_REFERENCE` are evidence classifications and never authorize deletion by themselves.

## Decisions

| ID | Scope | Class | Lifecycle | Severity | Evidence | Successor | Decision |
|---|---|---|---|---|---|---|---|
| DEP-001 | `tools/migration/import-v03-baseline.sh` | DEPRECATED | DEPRECATED | P2 | baseline import is documented complete and the helper has no canonical runtime role | none required | Keep for reproducibility until owner/coordinator authorizes quarantine. |
| DEP-002 | `docs/migration/STRUCTURE_STATUS.csv` | BROKEN_REFERENCE | ACTIVE | P1-GOVERNANCE | multiple live-path/count assertions disagree with the Git tree | corrected live inventory after W00 convergence | Correct later under the owning lock; do not delete. |
| DEP-003 | `docs/migration/ANDROID_UI_PORTING_PLAN.md` | BROKEN_REFERENCE | ACTIVE | P2 | asserts an Android duplicate reference tree absent from GitHub live | corrected porting plan | Correct later under the owning lock. |
| DEP-004 | legacy Electron `main.js` and `voice-websocket-bridge.js` | LEGACY_REFERENCE + BROKEN_REFERENCE | ACTIVE | P2 | both reference a missing EventBus path | canonical client transport / typed contracts | Preserve provenance; never repair into runtime authority. |
| DEP-005 | legacy Electron `package.json` | LEGACY_REFERENCE + BROKEN_REFERENCE | ACTIVE | P2 | absent Jest setup/icon and redundant start scripts | canonical app package metadata | Preserve until successor is implemented and accepted. |
| DEP-006 | legacy Electron `html/index.html` | LEGACY_REFERENCE + BROKEN_REFERENCE | ACTIVE | P2 | referenced CSS/voice/dashboard paths are absent | canonical Presence/Workspace UI | Preserve visual provenance. |
| DEP-007 | legacy Electron `preload.js` | LEGACY_REFERENCE + BROKEN_REFERENCE | ACTIVE | P2 | exposed IPC invocations do not match the committed main handlers | typed canonical IPC/API contract | Preserve for contract discovery. |
| DEP-008 | two legacy/provenance `SECURITY_NOTICE.txt` copies | DUPLICATE | ACTIVE | P2 | both paths resolve to the same Git blob SHA | `docs/security/SECURITY_NOTICE.md` is canonical policy | Keep until provenance requirement and cleanup approval are explicit. |
| DEP-009 | `services/agent-runtime/legacy-manus-reference/**` | LEGACY_REFERENCE | ACTIVE | P2 | selected files include explicit placeholder/compatibility code and historical evidence | `services/agent-runtime/manus-execution-kernel` target | Preserve as rewrite reference; not runtime acceptance evidence. |

## Removal gate

A candidate advances to `QUARANTINED` only after a repository-wide reference scan, accepted successor/no-successor decision, provenance decision, ownership release, green relevant tests/build, and recorded rationale/rollback evidence. `REMOVABLE` requires accepted quarantine evidence. `REMOVED` requires a reviewed cleanup change.

## Current result

`REMOVED = 0`

No safe removal is authorized during the current parallel phase. The audit records evidence without violating ownership locks.
