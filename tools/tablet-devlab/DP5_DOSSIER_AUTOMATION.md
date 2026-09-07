# DP5 Tablet Dossier Automation

Status: **operator/readiness tooling only — not W15-J acceptance**.

This layer removes manual error-prone steps from the tablet-only DP5 workflow while preserving the physical reality gate and independent review boundary.

`INTELLIGENCE != AUTHORITY != EXECUTION`.

## 1. Capture the independent live Control Tower tuple

After `fetch-current-artifact.sh` has downloaded and verified the exact artifact, run:

```bash
bash tools/tablet-devlab/capture-control-tower-tuple.sh
```

The command fails closed unless all of the following still match the packaged DP5 tuple:

- live `main` SHA;
- Android PR #413 exact head, current-main base, open/draft/unmerged state and merge-base;
- host PR #462 exact head, current-main base, open/draft/unmerged state and merge-base;
- packaging workflow run id, exact head, branch, `push` event and `completed/success` state;
- artifact id/name, ownership by the packaging run and non-expired state;
- GitHub artifact digest, when exposed by the API;
- independently downloaded local ZIP digest.

It writes a mode-`0600` `w15j-control-tower-tuple-v1` JSON outside Git and refuses to overwrite an existing capture. A successful capture is only `READY_NOT_ACCEPTED`; it grants no W02/W07 authority, no retry permission and no physical PASS.

## 2. Build the complete physical operator dossier before finalization

The collector evidence directory must contain `w15j-evidence.json` before the immutable collector manifest is finalized. Populate it from the current Android W15-J evidence template and the real tablet evidence from the same exact tuple.

The dossier must include the complete physical contract, including:

- all 48 mandatory W15-J scenarios with PASS status, timestamps and evidence references;
- the bounded positive Android native effect and Receipt/Evidence chain through current W02/W07/W03/W14 owners;
- DENY, stale, kill, cancel, duplicate, uncertain and reconciliation cases;
- threat-review results and any explicit governed handoffs;
- resource observations backed by raw evidence;
- wake evidence with at least 100 deliberate attempts and the required false-wake/noise/privacy matrix;
- integrated Risk Gates A, B, C and D as PASS;
- final handoffs and finalization references.

`w15j-evidence.json` belongs inside the finalized collector manifest. The independent `reviewer-attestation.json` remains a post-manifest sidecar and must bind to that immutable manifest rather than modifying it.

## 3. Finalized dossier doctor

Only after the real physical window has been finalized and the independent reviewer has produced the manifest-bound `reviewer-attestation.json`, run:

```bash
AURORA_EVIDENCE_DIR="$HOME/aurora-devlab/evidence/w15j-dp5" \
  bash tools/tablet-devlab/dossier-doctor.sh
```

The doctor requires the finalized manifest, complete `w15j-evidence.json`, operator attestation, reviewer attestation and wake evidence. It then:

1. re-captures the live GitHub Control Tower tuple through the fail-closed command above;
2. requires the local DevLab worktree to be clean and exactly equal to the live #499 head, with base/merge-base reconciled to the captured main;
3. requires both local Android and host worktrees to be clean and exactly equal to the Android/host SHAs in that freshly captured tuple;
4. runs the canonical `w15j-tablet-loopback-trusted-preflight.mjs` validator from the exact Android candidate to reconstruct trusted physical facts from raw finalized evidence;
5. verifies `LOCAL_TABLET_LOOPBACK` + `SELF_ADB_WIRELESS_DEBUGGING` bindings and that trusted evidence still says `physicallyAccepted=false`;
6. runs the canonical `w15j-tablet-loopback-preflight.mjs` against `w15j-evidence.json`, the same finalized evidence directory and the same live tuple;
7. requires the exact non-accepting completion disposition with `scenarios=48`, which includes complete scenario, threat, resource and Risk A-D validation;
8. emits SHA-256 references for the operator dossier, manifest, live tuple, trusted-preflight output and complete-dossier lint.

The resulting disposition is:

```text
LINT_READY_FOR_INDEPENDENT_CONTROL_TOWER_REVIEW_NOT_ACCEPTED
```

It deliberately emits:

```text
required_physical_scenarios=48
complete_dossier_lint=PASS_NOT_ACCEPTED
authorizes_execution=false
proves_execution_success=false
retry_authorized=false
physical_acceptance=false
w16_build_unblocked=false
```

## Acceptance boundary

Neither command nor either validator may be used to promote W15-J. The final acceptance controller must still review the real representative-tablet dossier, integrated Risk Gates A-D, operator and independent-reviewer attestations, and revalidate GitHub live immediately before any acceptance decision. Until that decision is made on complete physical evidence, #413/#462/#499 remain unmerged and W16 BUILD remains blocked.
