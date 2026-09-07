#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora DP5 dossier doctor failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in git node jq mktemp sha256sum gh; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"; done
gh auth status >/dev/null 2>&1 || fail "GitHub CLI is not authenticated; run: gh auth login"

REPO="${AURORA_REPOSITORY:-luizanunciostoca/aurora-ai-native}"
DEVLAB_PR="${AURORA_DEVLAB_PR:-499}"
DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
DEVLAB_WORKTREE="$DEVLAB_ROOT/worktrees/devlab"
ANDROID_WORKTREE="$DEVLAB_ROOT/worktrees/android"
EVIDENCE_DIR="${AURORA_EVIDENCE_DIR:-$DEVLAB_ROOT/evidence/w15j-dp5}"
RESULT_DIR="${AURORA_DOSSIER_DOCTOR_DIR:-$DEVLAB_ROOT/evidence/doctor}"

[[ -d "$DEVLAB_WORKTREE" ]] || fail "DevLab worktree missing; run worktrees.sh"
[[ -d "$DEVLAB_WORKTREE/.git" || -f "$DEVLAB_WORKTREE/.git" ]] || fail "DevLab worktree is not a git worktree"
[[ -d "$ANDROID_WORKTREE" ]] || fail "exact Android worktree missing; run worktrees.sh"
[[ -d "$EVIDENCE_DIR" && ! -L "$EVIDENCE_DIR" ]] || fail "finalized evidence directory is required"
[[ -f "$EVIDENCE_DIR/evidence-manifest.sha256" ]] || fail "finalized evidence-manifest.sha256 is required"
[[ -f "$EVIDENCE_DIR/reviewer-attestation.json" ]] || fail "independent reviewer-attestation.json is required"
[[ -f "$EVIDENCE_DIR/operator-attestation.json" ]] || fail "operator-attestation.json is required"
[[ -f "$EVIDENCE_DIR/wake-evidence.json" ]] || fail "wake-evidence.json is required"

devlab_head="$(git -C "$DEVLAB_WORKTREE" rev-parse HEAD)"
[[ "$devlab_head" =~ ^[0-9a-f]{40}$ ]] || fail "DevLab worktree HEAD is malformed"
[[ -z "$(git -C "$DEVLAB_WORKTREE" status --porcelain)" ]] || fail "DevLab worktree must remain clean"
[[ "$(git -C "$ANDROID_WORKTREE" rev-parse HEAD)" == "a45c349c840b6c5125867fee3c7294ad61998cc3" ]] || fail "Android worktree SHA drift"
[[ -z "$(git -C "$ANDROID_WORKTREE" status --porcelain)" ]] || fail "Android worktree must remain clean"

VALIDATOR="$ANDROID_WORKTREE/tools/acceptance/w15j-tablet-loopback-trusted-preflight.mjs"
[[ -f "$VALIDATOR" ]] || fail "tablet-loopback trusted preflight validator missing"

mkdir -p "$RESULT_DIR"
chmod 700 "$RESULT_DIR"
TUPLE="$RESULT_DIR/control-tower-tuple.json"
RESULT="$RESULT_DIR/trusted-preflight.json"
[[ ! -e "$TUPLE" ]] || fail "refusing to overwrite existing live control-tower tuple: $TUPLE"
[[ ! -e "$RESULT" ]] || fail "refusing to overwrite existing trusted-preflight result: $RESULT"

AURORA_CONTROL_TOWER_TUPLE="$TUPLE" bash "$DEVLAB_WORKTREE/tools/tablet-devlab/capture-control-tower-tuple.sh"

main_sha="$(jq -er '.reconciledMainSha' "$TUPLE")"
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
node "$VALIDATOR" "$EVIDENCE_DIR" "$TUPLE" "$RESULT"
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

manifest_sha="$(sha256sum "$EVIDENCE_DIR/evidence-manifest.sha256" | awk '{print $1}')"
tuple_sha="$(sha256sum "$TUPLE" | awk '{print $1}')"
result_sha="$(sha256sum "$RESULT" | awk '{print $1}')"
cat >"$RESULT_DIR/DOCTOR_STATUS.txt" <<EOF
status=LINT_READY_FOR_INDEPENDENT_CONTROL_TOWER_REVIEW_NOT_ACCEPTED
transport=LOCAL_TABLET_LOOPBACK
control_plane=SELF_ADB_WIRELESS_DEBUGGING
devlab_candidate_sha=$devlab_head
manifest_file_sha256=$manifest_sha
control_tower_tuple_sha256=$tuple_sha
trusted_preflight_sha256=$result_sha
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
printf 'devlab_candidate_sha=%s\n' "$devlab_head"
printf 'authorizes_execution=false\nphysical_acceptance=false\nretry_authorized=false\nw16_build_unblocked=false\n'
