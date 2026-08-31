# LEGACY_SUCCESSOR_MAP — W00-G

Baseline: `c61d1f4c534c54e29006b2fa2d87812822e0903d`

This map identifies successor **targets**, not permission to copy legacy implementation into canonical runtime.

| Legacy/reference scope | Current role | Successor target | Migration rule |
|---|---|---|---|
| `apps/aurora-desktop/legacy-reference/face/interface/html/index.html` | visual/interaction provenance | `apps/aurora-android/src/presence/**` for Presence Mode concepts; canonical desktop UI target when defined | Rebuild. Preserve orb/core/rings/voice-reactive UX; do not port broken relative assets blindly. |
| legacy HTML dashboard launch/context panels | dashboard/workspace UX reference | `apps/aurora-android/src/workspace/DynamicViews/**` and governed read models/APIs | Rebuild demand-driven Workspace; no legacy local-storage/token assumptions. |
| `apps/.../interface/main.js` | Electron orchestration reference | canonical desktop/client runtime + `services/aurora-gateway/**` | Replace missing local EventBus coupling with typed contracts/transport. |
| `apps/.../interface/voice-websocket-bridge.js` | voice/event semantics reference | canonical voice client/gateway contract | Preserve event semantics only after schema review; no direct promotion. |
| `apps/.../interface/scripts/voice-interface-bridge.js` | browser voice UX reference | canonical Presence voice state/UI | Reimplement against canonical client API; no hardcoded localhost WebSocket authority. |
| `apps/.../preload/preload.js` | historical IPC surface | typed canonical desktop IPC/API contract | Reconcile channel names first; only accepted contract becomes authority. |
| `apps/.../interface/package.json` | historical Electron build/test metadata | canonical monorepo app package metadata | Do not reuse missing Jest/icon/build assumptions. |
| `services/agent-runtime/legacy-manus-reference/manus/agent/**` | Manus planning/tool-loop reference | `services/agent-runtime/manus-execution-kernel/**` | Rewrite behind bounded worker contracts; placeholder functions are not implementations. |
| `services/agent-runtime/legacy-manus-reference/manus/browser/**` | browser tool semantics reference | bounded agent tool execution / future governed browser executor contracts | Re-specify typed inputs, policy, evidence, idempotency, timeout and error semantics. |
| `services/agent-runtime/legacy-manus-reference/manus/file/**` | file tool compatibility reference | bounded agent-runtime file/tool adapter contracts | Rebuild with path/security/tenant boundaries; do not preserve permissive compatibility behavior by default. |
| `services/agent-runtime/legacy-manus-reference/manus/data/**` | historical local data reference | canonical context/data stores defined by later architecture waves | No direct runtime import. |
| `services/agent-runtime/legacy-manus-reference/manus/docs/**` | historical implementation/provenance evidence | canonical developer/architecture documentation | Preserve only factual provenance; historical success claims are not current acceptance evidence. |
| `services/agent-runtime/legacy-manus-reference/manus/config/**` | sanitized legacy configuration reference | managed configuration/secrets contracts; `docs/security/SECURITY_NOTICE.md` for policy | Never restore excluded credential-bearing configuration. |
| `reference/original-manus/manus/config/SECURITY_NOTICE.txt` | provenance-only security marker | `docs/security/SECURITY_NOTICE.md` | Canonical policy is the docs/security notice; reference copy may be removable only after provenance decision. |
| `tools/migration/import-v03-baseline.sh` | completed baseline-import helper | no runtime successor | Keep as reproducibility evidence until owner approves lifecycle advancement. |

## Explicit non-successors

- `legacy-reference` is never a successor to canonical runtime.
- `reference/**` is never runtime authority.
- Historical Manus success reports are never acceptance evidence for Aurora AI-Native.
- The n8n source library is not production automation merely because a workflow exists in provenance/external artifacts.

## Legacy salvage planning input — 2026-08-31

A deeper review of the supplied `aurora_transcendente_final (3).zip` archive is tracked by:

- `docs/governance/legacy/LEGACY_CAPABILITY_AND_REUSE_SALVAGE_REGISTER.md`;
- `docs/governance/legacy/LEGACY_CAPABILITY_SEED_CATALOG.csv`;
- `docs/governance/legacy/SALVAGE_AUDIT_SUMMARY.json`;
- Drive `AURORA_LEGACY_SOURCE_FILE_CLASSIFICATION_2026-08-31` for file-level evidence.

The archive SHA-256 is `d4388cdefd21c6ba6dcc24e1214d037d499370533bc870890c7881f2027a55c2`. The audit classified 541 first-party files and produced 69 deduplicated capability seeds. All seeds are planning inputs only and default to `NO_DIRECT_RUNTIME_IMPORT` / `SEED_ONLY_NOT_CANONICAL`.

Future owner waves must consume the salvage register instead of re-importing the archive. Promotion is semantic and minimal: a wave may accept a capability verb, behavior, UX/protocol state, provider metadata or negative-test scenario only after re-specification against current canonical contracts and Risk Validation gates. Secret-bearing configuration, user/runtime data, direct process executors, randomized validation/optimization, permissive stub success and historical certificate claims are explicitly non-promotable.

## Runtime dependency conclusion

At the audited baseline there is no implemented canonical runtime entrypoint consuming the legacy/reference trees. Therefore the current dependency direction is clean: **canonical targets may consult legacy references during redesign, but no legacy tree is runtime authority**.
