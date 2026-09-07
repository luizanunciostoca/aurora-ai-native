#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora DP5 dossier doctor failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in git node jq mktemp sha256sum; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"; done

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
DEVLAB_WORKTREE="$DEVLAB_ROOT/worktrees/devlab"
ANDROID_WORKTREE="$DEVLAB_ROOT/worktrees/android"
EVIDENCE_DIR="${AURORA_EVIDENCE_DIR:-$DEVLAB_ROOT/evidence/w15j-dp5}"
RESULT_DIR="${AURORA_DOSSIER_DOCTOR_DIR:-$DEVLAB_ROOT/evidence/doctor}"

[[ -d "$DEVLAB_WORKTREE" ]] || fail "DevLab worktree missing; run worktrees.sh"
[[ -d "$ANDROID_WORKTREE" ]] || fail "exact Android worktree missing; run worktrees.sh"
[[ -d "$EVIDENCE_DIR" && ! -L "$EVIDENCE_DIR" ]] || fail "finalized evidence directory is required"
[[ -f "$EVIDENCE_DIR/evidence-manifest.sha256" ]] || fail "finalized evidence-manifest.sha256 is required"
[[ -f "$EVIDENCE_DIR/reviewer-attestation.json" ]] || fail "independent reviewer-attestation.json is required"
[[ -f "$EVIDENCE_DIR/operator-attestation.json" ]] || fail "operator-attestation.json is required"
[[ -f "$EVIDENCE_DIR/wake-evidence.json" ]] || fail "wake-evidence.json is required"

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

set +e
node "$VALIDATOR" "$EVIDENCE_DIR" "$TUPLE" "$RESULT"
validator_status=$?
set -e
(( validator_status == 0 )) || fail "tablet-loopback trusted preflight blocked; preserve dossier and inspect validator output"

[[ -f "$RESULT" && ! -L "$RESULT" ]] || fail "trusted-preflight output missing"
chmod 600 "$RESULT" "$TUPLE"

schema="$(jq -er '.schemaVersion' "$RESULT")"
accepted="$(jq -er '.physicallyAccepted' "$RESULT")"
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
printf 'authorizes_execution=false\nphysical_acceptance=false\nretry_authorized=false\nw16_build_unblocked=false\n'
