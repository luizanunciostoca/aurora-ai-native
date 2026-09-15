# DP5 Tablet Dossier Automation

Status: **operator/readiness tooling only — not W15-J acceptance**.

This layer removes manual error-prone steps from the tablet-only DP5 workflow while preserving the physical reality gate and independent review boundary.

`INTELLIGENCE != AUTHORITY != EXECUTION`.

## 1. Capture the independent live Control Tower tuple

After `fetch-current-artifact.sh` has downloaded and verified the exact artifact, run:

```bash
bash tools/tablet-devlab/capture-control-tower-tuple.sh
```

The command fails closed unless live `main`, Android #413, host #462, merge-bases, packaging run, artifact identity and independently downloaded ZIP digest all still match. The resulting mode-`0600` `w15j-control-tower-tuple-v1` record is only `READY_NOT_ACCEPTED`.

## 2. Run the tablet physical preflight

Run the exact collector preflight before creating the operator dossier. It creates the machine-owned physical facts used by the dossier binder, including exact APK bytes, physical device identity, same-tablet transport and host identity.

The tablet-loopback transport must remain:

```text
gatewayTransport=LOCAL_TABLET_LOOPBACK
adbReversePort=null
controlPlane=SELF_ADB_WIRELESS_DEBUGGING
```

## 3. Prepare the exact operator dossier and semantic binding

After preflight and Control Tower tuple capture, run:

```bash
AURORA_EVIDENCE_DIR="$HOME/aurora-devlab/evidence/w15j-dp5" \
AURORA_CONTROL_TOWER_TUPLE="$HOME/aurora-devlab/evidence/control-tower-tuple.json" \
  bash tools/tablet-devlab/prepare-dp5-dossier.sh
```

This command uses the exact Android candidate's `w15j-tablet-loopback-dossier-lifecycle.mjs` binder. It refuses stale or dirty Android worktrees, refuses overwrite and converts the canonical W15-J template into the exact same-tablet physical tuple. Machine-owned fields are bound to Control Tower + collector preflight rather than operator text.

Preparation also creates `governed-execution-binding.json` from the exact Android candidate's `W15J_GOVERNED_EXECUTION_BINDING_TEMPLATE.json`. The file is deliberately incomplete and non-authoritative at creation time, but it must exist before the physical collector is finalized so its final bytes can be included in the immutable manifest.

At this stage `environment.finalizedAtUtc` deliberately remains `REQUIRED`, DP5 remains incomplete and all binding authority/acceptance flags remain false.

The operator then records the real physical matrix in `w15j-evidence.json`, including:

- all 48 mandatory scenarios with PASS, timestamps and manifested evidence references;
- bounded native Android effect and Receipt/Evidence chain through current W02/W07/W03/W14 owners;
- DENY, stale, kill, cancel, duplicate, uncertain and reconciliation cases;
- threat review and governed handoffs;
- resource observations backed by raw evidence;
- wake evidence with at least 100 deliberate attempts plus required negative/noise/privacy coverage;
- integrated Risk Gates A-D;
- final handoffs and references.

The operator must also populate `governed-execution-binding.json` from those real evidence files. It binds exactly seven semantic owner roles:

1. current W02/W07 authority;
2. W14 current trusted session;
3. W14 command/delivery identity;
4. W03 durable command/receipt state;
5. Android native bounded execution observation;
6. non-authoritative Receipt/Evidence ingress;
7. W07 final outcome reconciliation.

Each semantic role references a distinct final-manifest evidence file and SHA-256. The binding itself remains `EVIDENCE_BINDING_ONLY`; it cannot grant execution authority, prove success by itself, authorize retry, declare physical acceptance or unblock W16.

## 4. Finalize the physical collector window

Run the canonical tablet-loopback collector finalize only after the 48-scenario matrix **and governed execution binding** are complete. The collector writes its own exact `finalized_at_utc` and its immutable first final manifest.

That collector manifest is intentionally treated as **pre-seal provenance**, because its manifested `w15j-evidence.json` still contains `environment.finalizedAtUtc=REQUIRED`; the operator cannot safely predict the collector-owned timestamp in advance.

Do not modify `governed-execution-binding.json` after collector finalize. Do not create `reviewer-attestation.json` yet.

## 5. Seal the dossier to the collector-owned finalization fact

Immediately after collector finalize, run:

```bash
AURORA_EVIDENCE_DIR="$HOME/aurora-devlab/evidence/w15j-dp5" \
AURORA_CONTROL_TOWER_TUPLE="$HOME/aurora-devlab/evidence/control-tower-tuple.json" \
  bash tools/tablet-devlab/seal-dp5-dossier.sh
```

The sealer fails closed unless the first collector final manifest verifies byte-for-byte and includes both the pre-seal dossier and `governed-execution-binding.json`. It then:

1. preserves the original collector manifest as `collector-finalize-manifest.preseal.sha256`;
2. records the pre-seal dossier digest;
3. invokes the exact Android binder to inject only the collector-owned `finalized_at_utc` while revalidating all machine-owned tuple/device fields;
4. verifies that the semantic binding remained immutable across the seal;
5. writes `dossier-seal-status.txt` with predecessor/sealed hashes and non-authority flags;
6. creates a new sealed `evidence-manifest.sha256` covering the complete final evidence, semantic binding, predecessor manifest, seal record and sealed dossier;
7. verifies the sealed manifest with `sha256sum -c`;
8. remains explicitly `NOT_ACCEPTED` and keeps W16 blocked.

A second seal is refused. A reviewer attestation present before sealing is also refused.

## 6. Independent reviewer sidecar

Only after sealing may the independent reviewer create `reviewer-attestation.json`.

The reviewer attestation is intentionally excluded from `evidence-manifest.sha256` to avoid self-reference. Instead it must bind its `evidenceManifestSha256` field to the **sealed final manifest file digest**. The trusted Android validator snapshots that sidecar separately and requires the reviewer identity to differ from the operator.

Do not regenerate the sealed manifest after reviewer attestation creation.

## 7. Finalized dossier doctor

After sealing and reviewer attestation, run:

```bash
AURORA_EVIDENCE_DIR="$HOME/aurora-devlab/evidence/w15j-dp5" \
  bash tools/tablet-devlab/dossier-doctor.sh
```

The doctor now requires and verifies the full provenance chain:

```text
collector final manifest
→ governed-execution-binding.json already manifested
→ preserved pre-seal manifest
→ pre-seal dossier hash
→ exact collector finalized_at_utc
→ sealed dossier hash
→ seal status
→ sealed final manifest
→ independent reviewer sidecar bound to sealed manifest
→ trusted physical reconstruction
→ complete 48-scenario dossier lint
→ independent seven-role governed execution semantic validation
```

It also re-captures GitHub live, requires clean exact DevLab/Android/host worktrees, runs `w15j-tablet-loopback-trusted-preflight.mjs`, runs `w15j-tablet-loopback-preflight.mjs`, requires `scenarios=48`, then runs `w15j-governed-execution-binding.mjs` and requires `roles=7`. It still refuses any self-declared physical acceptance.

Its strongest disposition remains:

```text
LINT_READY_FOR_INDEPENDENT_CONTROL_TOWER_REVIEW_NOT_ACCEPTED
```

with:

```text
required_semantic_evidence_roles=7
semantic_binding_lint=PASS_NOT_ACCEPTED
authorizes_execution=false
proves_execution_success=false
retry_authorized=false
physical_acceptance=false
w16_build_unblocked=false
```

## Acceptance boundary

Preparation, sealing, reviewer attestation, doctor and all validators are evidence tooling only. The final acceptance controller must still independently review the representative-tablet dossier and revalidate GitHub live immediately before any W15-J acceptance decision.

Until genuine physical evidence satisfies that boundary: **#413/#462/#499 remain unmerged, W15-J remains unaccepted and W16 BUILD remains blocked.**
