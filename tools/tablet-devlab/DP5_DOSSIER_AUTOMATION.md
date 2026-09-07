# DP5 Tablet Dossier Automation

Status: **operator/readiness tooling only — not W15-J acceptance**.

This layer removes two manual error-prone steps from the tablet-only DP5 workflow while preserving the physical reality gate and independent review boundary.

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

## 2. Finalized dossier doctor

Only after the real physical window has been finalized and the independent reviewer has produced the manifest-bound `reviewer-attestation.json`, run:

```bash
AURORA_EVIDENCE_DIR="$HOME/aurora-devlab/evidence/w15j-dp5" \
  bash tools/tablet-devlab/dossier-doctor.sh
```

The doctor requires the finalized manifest, operator attestation, reviewer attestation and wake evidence. It then:

1. re-captures the live GitHub Control Tower tuple through the fail-closed command above;
2. requires the exact Android worktree and verifies that it is clean and pinned to the packaged Android SHA;
3. runs the canonical `w15j-tablet-loopback-trusted-preflight.mjs` validator from that exact Android candidate;
4. verifies `LOCAL_TABLET_LOOPBACK` + `SELF_ADB_WIRELESS_DEBUGGING` bindings;
5. verifies that the trusted result still says `physicallyAccepted=false` and requires external live GitHub revalidation immediately before acceptance;
6. emits SHA-256 references for the manifest file, live tuple and trusted-preflight output.

The resulting disposition is:

```text
LINT_READY_FOR_INDEPENDENT_CONTROL_TOWER_REVIEW_NOT_ACCEPTED
```

It deliberately emits:

```text
authorizes_execution=false
proves_execution_success=false
retry_authorized=false
physical_acceptance=false
w16_build_unblocked=false
```

## Acceptance boundary

Neither command may be used to promote W15-J. The final acceptance controller must still review the real representative-tablet dossier, integrated Risk Gates A-D, operator and independent-reviewer attestations, and revalidate GitHub live immediately before any acceptance decision. Until that decision is made on complete physical evidence, #413/#462/#499 remain unmerged and W16 BUILD remains blocked.
