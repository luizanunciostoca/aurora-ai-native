# W16 Cortex PREBUILD Readiness Register

Status: **PREBUILD ONLY — W16 NOT ACCEPTED — W15-J / DP5 NOT MODIFIED**

Baseline main: `77f0f8532197025ee913dd02fcb56878d9d667a9`.

## Live baseline findings

- Canonical W16 planning exists, but the active Cortex application does not yet exist on `main`.
- `apps/aurora-desktop` contains only `legacy-reference`; the new implementation must not treat legacy material as an active runtime surface.
- W15-J / DP5 remains a formal release dependency for W16 BUILD.
- Parallel W14/W15 work is active; this prebuild therefore owns only new Cortex-local contracts/models/docs plus minimal test/build registration.

## Gap register after this prebuild foundation

| Area | PREBUILD state | Remaining gate/work |
| --- | --- | --- |
| Architecture | READY | Runtime integration acceptance after DP5 |
| Information architecture | READY | Rendered usability validation |
| Global navigation model | READY | Visual shell + E2E |
| Semantic Zoom model | READY | Rendered canvas + interaction tests |
| Inspector model | READY | Visual component + focus-return test |
| Timeline model | READY | Runtime projection adapter |
| Command Palette model | READY | Visual overlay; execution actions remain out of scope |
| Global search model | READY | Runtime index/projection binding |
| Loading/empty/degraded/offline/error | READY | Rendered state catalog + E2E |
| Design tokens | READY | Visual QA and platform-specific consumption |
| Reusable headless components | READY | Renderer-specific components |
| Data contracts + runtime validation | READY | Bind accepted runtime schemas if required |
| ViewModels/adapters | READY | Real adapter blocked by DP5 |
| Fixtures/mocks | READY | No physical evidence may derive from them |
| Accessibility contract | READY | TalkBack/screen-reader/rendered keyboard verification |
| Responsive/tablet-first rules | READY | Physical/rendered viewport verification |
| Error boundary projection | READY | Framework-specific ErrorBoundary wrapper |
| UI observability contract | READY | Telemetry sink integration post-gate |
| Unit/contract/state tests | READY | Exact-head CI required |
| Component/navigation/a11y tests | PARTIAL | Headless covered; rendered tests require active shell |
| Story/demo environment | PARTIAL | Deterministic fixture exists; visual story host deferred |
| Cortex → Runtime adapter | BLOCKED | Deliberately fail-closed until formal W15-J / DP5 release |
| Active desktop/tablet Cortex app | BLOCKED | W16 BUILD gate |
| Physical acceptance claims | OUT OF SCOPE | Must come only from DP5 process |

## Invariants

`INTELLIGENCE != AUTHORITY != EXECUTION`.

Cortex PREBUILD:

- cannot issue authority;
- cannot prove execution success;
- cannot authorize retry;
- cannot turn mock data into physical evidence;
- cannot mark W15-J or W16 accepted;
- cannot bypass accepted runtime owners.

## Readiness interpretation

Readiness percentages, when reported, refer only to **safe W16 PREBUILD preparation**, never to W16 acceptance or production readiness. The remaining renderer/runtime integration work must be re-estimated after formal DP5 release because its exact scope depends on the accepted runtime tuple.
