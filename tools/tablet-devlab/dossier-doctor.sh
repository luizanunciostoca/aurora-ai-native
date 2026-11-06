#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora DP5 dossier doctor failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in git node jq mktemp sha256sum gh unzip awk grep; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"; done
gh auth status >/dev/null 2>&1 || fail "GitHub CLI is not authenticated; run: gh auth login"

REPO="${AURORA_REPOSITORY:-luizanunciostoca/aurora-ai-native}"
DEVLAB_PR="${AURORA_DEVLAB_PR:-499}"
DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
DEVLAB_WORKTREE="$DEVLAB_ROOT/worktrees/devlab"
ANDROID_WORKTREE="$DEVLAB_ROOT/worktrees/android"
HOST_WORKTREE="$DEVLAB_ROOT/worktrees/host"
EVIDENCE_DIR="${AURORA_EVIDENCE_DIR:-$DEVLAB_ROOT/evidence/w15j-dp5}"
DOSSIER="${AURORA_W15J_DOSSIER:-$EVIDENCE_DIR/w15j-evidence.json}"
BINDING="${AURORA_W15J_GOVERNED_EXECUTION_BINDING:-$EVIDENCE_DIR/governed-execution-binding.json}"
FINAL_MANIFEST="$EVIDENCE_DIR/evidence-manifest.sha256"
PRESEAL_MANIFEST="$EVIDENCE_DIR/collector-finalize-manifest.preseal.sha256"
SEAL_STATUS="$EVIDENCE_DIR/dossier-seal-status.txt"
RESULT_DIR="${AURORA_DOSSIER_DOCTOR_DIR:-$DEVLAB_ROOT/evidence/doctor}"

[[ -d "$DEVLAB_WORKTREE" ]] || fail "DevLab worktree missing; run worktrees.sh"
[[ -d "$DEVLAB_WORKTREE/.git" || -f "$DEVLAB_WORKTREE/.git" ]] || fail "DevLab worktree is not a git worktree"
[[ -d "$ANDROID_WORKTREE" ]] || fail "exact Android worktree missing; run worktrees.sh"
[[ -d "$ANDROID_WORKTREE/.git" || -f "$ANDROID_WORKTREE/.git" ]] || fail "Android worktree is not a git worktree"
[[ -d "$HOST_WORKTREE" ]] || fail "exact host worktree missing; run worktrees.sh"
[[ -d "$HOST_WORKTREE/.git" || -f "$HOST_WORKTREE/.git" ]] || fail "host worktree is not a git worktree"
[[ -d "$EVIDENCE_DIR" && ! -L "$EVIDENCE_DIR" ]] || fail "finalized evidence directory is required"
for path in \
  "$FINAL_MANIFEST" \
  "$PRESEAL_MANIFEST" \
  "$SEAL_STATUS" \
  "$EVIDENCE_DIR/reviewer-attestation.json" \
  "$EVIDENCE_DIR/operator-attestation.json" \
  "$EVIDENCE_DIR/wake-evidence.json" \
  "$BINDING" \
  "$DOSSIER"; do
  [[ -f "$path" && ! -L "$path" ]] || fail "required final evidence file missing or unsafe: $path"
done

seal_value() {
  local key="$1"
  [[ "$(grep -c "^${key}=" "$SEAL_STATUS")" -eq 1 ]] || fail "seal status must contain exactly one $key"
  awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, ""); print}' "$SEAL_STATUS"
}

seal_schema="$(seal_value schema)"
collector_manifest_sha="$(seal_value collector_manifest_sha256)"
dossier_preseal_sha="$(seal_value dossier_preseal_sha256)"
dossier_sealed_sha="$(seal_value dossier_sealed_sha256)"
binding_sealed_sha="$(seal_value governed_execution_binding_sha256)"
seal_finalized_at="$(seal_value finalized_at_utc)"
[[ "$seal_schema" == "w15j-tablet-loopback-dossier-seal-v1" ]] || fail "dossier seal schema drift"
for sha in "$collector_manifest_sha" "$dossier_preseal_sha" "$dossier_sealed_sha" "$binding_sealed_sha"; do
  [[ "$sha" =~ ^[0-9a-f]{64}$ ]] || fail "dossier seal contains malformed SHA-256"
done
for key in authorizes_execution proves_execution_success retry_authorized physical_acceptance w16_build_unblocked; do
  [[ "$(seal_value "$key")" == "false" ]] || fail "dossier seal must keep $key=false"
done
[[ "$(sha256sum "$PRESEAL_MANIFEST" | awk '{print $1}')" == "$collector_manifest_sha" ]] || \
  fail "pre-seal collector manifest digest drift"
[[ "$(sha256sum "$DOSSIER" | awk '{print $1}')" == "$dossier_sealed_sha" ]] || \
  fail "sealed dossier digest drift"
[[ "$(sha256sum "$BINDING" | awk '{print $1}')" == "$binding_sealed_sha" ]] || \
  fail "sealed governed execution binding digest drift"
preseal_dossier_sha="$(awk '$2 == "w15j-evidence.json" {print $1}' "$PRESEAL_MANIFEST")"
[[ "$preseal_dossier_sha" == "$dossier_preseal_sha" ]] || \
  fail "pre-seal collector manifest does not bind the recorded dossier predecessor"
preseal_binding_sha="$(awk '$2 == "governed-execution-binding.json" {print $1}' "$PRESEAL_MANIFEST")"
[[ "$preseal_binding_sha" == "$binding_sealed_sha" ]] || \
  fail "pre-seal collector manifest does not bind the recorded governed execution binding"
[[ "$(jq -er '.environment.finalizedAtUtc' "$DOSSIER")" == "$seal_finalized_at" ]] || \
  fail "sealed dossier finalization timestamp drift"
(
  cd "$EVIDENCE_DIR"
  sha256sum -c "$(basename "$FINAL_MANIFEST")" >/dev/null
) || fail "sealed final evidence manifest digest verification failed"
for required in \
  "$(basename "$PRESEAL_MANIFEST")" \
  "$(basename "$SEAL_STATUS")" \
  "$(basename "$BINDING")" \
  "$(basename "$DOSSIER")"; do
  [[ "$(awk -v name="$required" '$2 == name {count++} END {print count+0}' "$FINAL_MANIFEST")" -eq 1 ]] || \
    fail "sealed final manifest must contain exactly one $required entry"
done

devlab_head="$(git -C "$DEVLAB_WORKTREE" rev-parse HEAD)"
[[ "$devlab_head" =~ ^[0-9a-f]{40}$ ]] || fail "DevLab worktree HEAD is malformed"
[[ -z "$(git -C "$DEVLAB_WORKTREE" status --porcelain)" ]] || fail "DevLab worktree must remain clean"

mkdir -p "$RESULT_DIR"
chmod 700 "$RESULT_DIR"
TUPLE="$RESULT_DIR/control-tower-tuple.json"
RESULT="$RESULT_DIR/trusted-preflight.json"
SEMANTIC_LINT="$RESULT_DIR/governed-execution-binding-lint.txt"
DOSSIER_LINT="$RESULT_DIR/tablet-loopback-dossier-lint.txt"
[[ ! -e "$TUPLE" ]] || fail "refusing to overwrite existing live control-tower tuple: $TUPLE"
[[ ! -e "$RESULT" ]] || fail "refusing to overwrite existing trusted-preflight result: $RESULT"
[[ ! -e "$SEMANTIC_LINT" ]] || fail "refusing to overwrite existing semantic binding lint: $SEMANTIC_LINT"
[[ ! -e "$DOSSIER_LINT" ]] || fail "refusing to overwrite existing dossier lint: $DOSSIER_LINT"

AURORA_CONTROL_TOWER_TUPLE="$TUPLE" bash "$DEVLAB_WORKTREE/tools/tablet-devlab/capture-control-tower-tuple.sh"

main_sha="$(jq -er '.reconciledMainSha' "$TUPLE")"
android_sha="$(jq -er '.androidCandidateSha' "$TUPLE")"
host_sha="$(jq -er '.hostCandidateSha' "$TUPLE")"
for sha in "$main_sha" "$android_sha" "$host_sha"; do
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "captured control-tower tuple contains malformed candidate SHA"
done

[[ "$(git -C "$ANDROID_WORKTREE" rev-parse HEAD)" == "$android_sha" ]] || fail "Android worktree drift from captured live tuple"
[[ -z "$(git -C "$ANDROID_WORKTREE" status --porcelain)" ]] || fail "Android worktree must remain clean"
[[ "$(git -C "$HOST_WORKTREE" rev-parse HEAD)" == "$host_sha" ]] || fail "host worktree drift from captured live tuple"
[[ -z "$(git -C "$HOST_WORKTREE" status --porcelain)" ]] || fail "host worktree must remain clean"

TRUSTED_VALIDATOR="$ANDROID_WORKTREE/tools/acceptance/w15j-tablet-loopback-trusted-preflight.mjs"
SEMANTIC_VALIDATOR="$ANDROID_WORKTREE/tools/acceptance/w15j-governed-execution-binding.mjs"
DOSSIER_VALIDATOR="$ANDROID_WORKTREE/tools/acceptance/w15j-tablet-loopback-preflight.mjs"
[[ -f "$TRUSTED_VALIDATOR" ]] || fail "tablet-loopback trusted preflight validator missing"
[[ -f "$SEMANTIC_VALIDATOR" ]] || fail "governed execution semantic binding validator missing"
[[ -f "$DOSSIER_VALIDATOR" ]] || fail "tablet-loopback complete dossier validator missing"

pr_payload="$(gh api -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' "/repos/$REPO/pulls/$DEVLAB_PR")"
pr_head="$(jq -er '.head.sha' <<<"$pr_payload")"
pr_base="$(jq -er '.base.sha' <<<"$pr_payload")"
pr_state="$(jq -er '.state' <<<"$pr_payload")"
pr_draft="$(jq -r '.draft' <<<"$pr_payload")"
pr_merged_at="$(jq -r '.merged_at // ""' <<<"$pr_payload")"
[[ "$pr_head" == "$devlab_head" ]] || fail "DevLab worktree is stale versus live PR #$DEVLAB_PR head"
[[ "$pr_base" == "$main_sha" ]] || fail "DevLab PR base drifted from the captured canonical main"
[[ "$pr_state" == "open" && "$pr_draft" == "true" && -z "$pr_merged_at" ]] || \
  fail "DevLab PR must remain open/draft/unmerged before DP5 acceptance"

compare="$(gh api -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' "/repos/$REPO/compare/$main_sha...$devlab_head")"
merge_base="$(jq -er '.merge_base_commit.sha' <<<"$compare")"
behind="$(jq -er '.behind_by' <<<"$compare")"
[[ "$merge_base" == "$main_sha" && "$behind" == "0" ]] || \
  fail "DevLab worktree no longer reconciles exactly to the captured canonical main"

set +e
node "$TRUSTED_VALIDATOR" "$EVIDENCE_DIR" "$TUPLE" "$RESULT"
validator_status=$?
set -e
(( validator_status == 0 )) || fail "tablet-loopback trusted preflight blocked; preserve dossier and inspect validator output"

[[ -f "$RESULT" && ! -L "$RESULT" ]] || fail "trusted-preflight output missing"
chmod 600 "$RESULT" "$TUPLE"

schema="$(jq -er '.schemaVersion' "$RESULT")"
accepted="$(jq -r '.physicallyAccepted' "$RESULT")"
transport="$(jq -er '.transportBindings.gatewayTransport' "$RESULT")"
control_plane="$(jq -er '.transportBindings.controlPlane' "$RESULT")"
live_requirement="$(jq -er '.trustRoot.liveGitHubRevalidation' "$RESULT")"
[[ "$schema" == "w15j-tablet-loopback-trusted-preflight-v1" ]] || fail "trusted-preflight schema drift"
[[ "$accepted" == "false" ]] || fail "software validator must never self-declare physical acceptance"
[[ "$transport" == "LOCAL_TABLET_LOOPBACK" ]] || fail "trusted-preflight transport drift"
[[ "$control_plane" == "SELF_ADB_WIRELESS_DEBUGGING" ]] || fail "trusted-preflight control-plane drift"
[[ "$live_requirement" == "EXTERNAL_REQUIRED_IMMEDIATELY_BEFORE_ACCEPTANCE" ]] || fail "live GitHub acceptance revalidation requirement missing"
[[ "$(jq -er '.evidenceManifest.sha256' "$RESULT")" == "$(sha256sum "$FINAL_MANIFEST" | awk '{print $1}')" ]] || \
  fail "trusted preflight did not bind the sealed final manifest"

set +e
node "$SEMANTIC_VALIDATOR" "$DOSSIER" "$RESULT" "$EVIDENCE_DIR" >"$SEMANTIC_LINT" 2>&1
semantic_status=$?
set -e
chmod 600 "$SEMANTIC_LINT"
(( semantic_status == 0 )) || fail "governed execution semantic binding blocked; inspect $SEMANTIC_LINT"
mapfile -t semantic_lines <"$SEMANTIC_LINT"
[[ "${#semantic_lines[@]}" -eq 1 ]] || fail "semantic binding validator must emit exactly one disposition line"
[[ "${semantic_lines[0]}" == W15J_GOVERNED_EXECUTION_BINDING_READY_NOT_ACCEPTED\ actionIntent=*\ execution=*\ roles=7 ]] || \
  fail "semantic binding validator did not prove exactly seven evidence roles"

set +e
node "$DOSSIER_VALIDATOR" "$DOSSIER" "$EVIDENCE_DIR" "$TUPLE" >"$DOSSIER_LINT" 2>&1
dossier_status=$?
set -e
chmod 600 "$DOSSIER_LINT"
(( dossier_status == 0 )) || fail "complete tablet-loopback dossier lint blocked; inspect $DOSSIER_LINT"
mapfile -t dossier_lines <"$DOSSIER_LINT"
expected_dossier_line="W15J_TABLET_LOOPBACK_LINT_READY_NOT_ACCEPTED candidate=$android_sha scenarios=48"
[[ "${#dossier_lines[@]}" -eq 1 && "${dossier_lines[0]}" == "$expected_dossier_line" ]] || \
  fail "complete dossier validator did not emit the canonical 48-scenario NOT_ACCEPTED disposition"

manifest_sha="$(sha256sum "$FINAL_MANIFEST" | awk '{print $1}')"
binding_sha="$(sha256sum "$BINDING" | awk '{print $1}')"
dossier_sha="$(sha256sum "$DOSSIER" | awk '{print $1}')"
seal_status_sha="$(sha256sum "$SEAL_STATUS" | awk '{print $1}')"
preseal_manifest_file_sha="$(sha256sum "$PRESEAL_MANIFEST" | awk '{print $1}')"
tuple_sha="$(sha256sum "$TUPLE" | awk '{print $1}')"
result_sha="$(sha256sum "$RESULT" | awk '{print $1}')"
semantic_lint_sha="$(sha256sum "$SEMANTIC_LINT" | awk '{print $1}')"
dossier_lint_sha="$(sha256sum "$DOSSIER_LINT" | awk '{print $1}')"
cat >"$RESULT_DIR/DOCTOR_STATUS.txt" <<EOF
status=LINT_READY_FOR_INDEPENDENT_CONTROL_TOWER_REVIEW_NOT_ACCEPTED
transport=LOCAL_TABLET_LOOPBACK
control_plane=SELF_ADB_WIRELESS_DEBUGGING
devlab_candidate_sha=$devlab_head
android_candidate_sha=$android_sha
host_candidate_sha=$host_sha
required_semantic_evidence_roles=7
semantic_binding_lint=PASS_NOT_ACCEPTED
required_physical_scenarios=48
complete_dossier_lint=PASS_NOT_ACCEPTED
manifest_file_sha256=$manifest_sha
collector_preseal_manifest_sha256=$preseal_manifest_file_sha
dossier_seal_status_sha256=$seal_status_sha
governed_execution_binding_sha256=$binding_sha
operator_dossier_sha256=$dossier_sha
control_tower_tuple_sha256=$tuple_sha
trusted_preflight_sha256=$result_sha
semantic_binding_lint_sha256=$semantic_lint_sha
complete_dossier_lint_sha256=$dossier_lint_sha
authorizes_execution=false
proves_execution_success=false
retry_authorized=false
physical_acceptance=false
w16_build_unblocked=false
required_next=Independent acceptance controller must revalidate live GitHub immediately before any W15-J acceptance decision.
EOF
chmod 600 "$RESULT_DIR/DOCTOR_STATUS.txt"

printf 'DP5_DOSSIER_DOCTOR=LINT_READY_FOR_INDEPENDENT_CONTROL_TOWER_REVIEW_NOT_ACCEPTED\n'
printf 'result_dir=%s\n' "$RESULT_DIR"
printf 'devlab_candidate_sha=%s\nandroid_candidate_sha=%s\nhost_candidate_sha=%s\n' \
  "$devlab_head" "$android_sha" "$host_sha"
printf 'required_semantic_evidence_roles=7\nsemantic_binding_lint=PASS_NOT_ACCEPTED\n'
printf 'required_physical_scenarios=48\ncomplete_dossier_lint=PASS_NOT_ACCEPTED\n'
printf 'sealed_dossier_provenance=VERIFIED\n'
printf 'authorizes_execution=false\nphysical_acceptance=false\nretry_authorized=false\nw16_build_unblocked=false\n'
