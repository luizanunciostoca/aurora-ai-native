#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora DP5 dossier preparation failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in git node jq; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"; done

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
ANDROID_WORKTREE="$DEVLAB_ROOT/worktrees/android"
EVIDENCE_DIR="${AURORA_EVIDENCE_DIR:-$DEVLAB_ROOT/evidence/w15j-dp5}"
TUPLE="${AURORA_CONTROL_TOWER_TUPLE:-$DEVLAB_ROOT/evidence/control-tower-tuple.json}"
DOSSIER="${AURORA_W15J_DOSSIER:-$EVIDENCE_DIR/w15j-evidence.json}"
BINDING="${AURORA_W15J_GOVERNED_EXECUTION_BINDING:-$EVIDENCE_DIR/governed-execution-binding.json}"
BINDER="$ANDROID_WORKTREE/tools/acceptance/w15j-tablet-loopback-dossier-lifecycle.mjs"
TEMPLATE="$ANDROID_WORKTREE/apps/aurora-android/physical/W15J_EVIDENCE_TEMPLATE.json"
BINDING_TEMPLATE="$ANDROID_WORKTREE/apps/aurora-android/physical/W15J_GOVERNED_EXECUTION_BINDING_TEMPLATE.json"
PREFLIGHT="$EVIDENCE_DIR/preflight-metadata.txt"
APK_IDENTITY="$EVIDENCE_DIR/apk-identity.txt"

[[ -d "$ANDROID_WORKTREE" ]] || fail "Android worktree missing; run worktrees.sh"
[[ -f "$BINDER" ]] || fail "tablet dossier lifecycle binder missing from exact Android candidate"
[[ -f "$TEMPLATE" ]] || fail "canonical W15-J evidence template missing"
[[ -f "$BINDING_TEMPLATE" ]] || fail "canonical governed execution binding template missing"
[[ -d "$EVIDENCE_DIR" && ! -L "$EVIDENCE_DIR" ]] || fail "physical preflight evidence directory is required"
[[ -f "$TUPLE" && ! -L "$TUPLE" ]] || fail "independent Control Tower tuple is required"
[[ -f "$PREFLIGHT" && ! -L "$PREFLIGHT" ]] || fail "tablet preflight metadata is required"
[[ -f "$APK_IDENTITY" && ! -L "$APK_IDENTITY" ]] || fail "preflight APK identity is required"
[[ ! -e "$DOSSIER" ]] || fail "refusing to overwrite existing operator dossier: $DOSSIER"
[[ ! -L "$DOSSIER" ]] || fail "dossier output cannot be a symlink"
[[ ! -e "$BINDING" ]] || fail "refusing to overwrite existing governed execution binding: $BINDING"
[[ ! -L "$BINDING" ]] || fail "governed execution binding output cannot be a symlink"

android_sha="$(jq -er '.androidCandidateSha' "$TUPLE")"
[[ "$android_sha" =~ ^[0-9a-f]{40}$ ]] || fail "Control Tower Android SHA is malformed"
[[ "$(git -C "$ANDROID_WORKTREE" rev-parse HEAD)" == "$android_sha" ]] || \
  fail "Android worktree does not match the captured Control Tower tuple"
[[ -z "$(git -C "$ANDROID_WORKTREE" status --porcelain)" ]] || \
  fail "Android worktree must remain clean before dossier preparation"

node "$BINDER" prepare "$DOSSIER" "$TUPLE" "$PREFLIGHT" "$APK_IDENTITY" "$TEMPLATE"
cp -- "$BINDING_TEMPLATE" "$BINDING"
chmod 600 "$DOSSIER" "$BINDING"

jq -e \
  '.schemaVersion == "1.2.0" and
   .wave == "W15-J" and
   .authorityInvariant == "INTELLIGENCE != AUTHORITY != EXECUTION" and
   .dp5Status == "CLOSED_PHYSICAL_EVIDENCE_INCOMPLETE" and
   .environment.gatewayTransport == "LOCAL_TABLET_LOOPBACK" and
   .environment.adbReversePort == null and
   .environment.controlPlane == "SELF_ADB_WIRELESS_DEBUGGING" and
   .environment.finalizedAtUtc == "REQUIRED" and
   .device.physicalDeviceVerified == true' \
  "$DOSSIER" >/dev/null || fail "prepared dossier lost canonical tablet-loopback boundaries"

jq -e \
  '.schemaVersion == "w15j-governed-execution-binding-v1" and
   .authorityInvariant == "INTELLIGENCE != AUTHORITY != EXECUTION" and
   .semantics.kind == "EVIDENCE_BINDING_ONLY" and
   .semantics.authorizesExecution == false and
   .semantics.provesExecutionSuccess == false and
   .semantics.retryAuthorized == false and
   .semantics.physicalAcceptance == false and
   .semantics.w16BuildUnblocked == false' \
  "$BINDING" >/dev/null || fail "prepared governed execution binding lost canonical non-authority semantics"

printf 'DP5_DOSSIER_PREPARED_FOR_OPERATOR_MATRIX_NOT_ACCEPTED\n'
printf 'dossier=%s\nbinding=%s\nandroid_candidate_sha=%s\n' "$DOSSIER" "$BINDING" "$android_sha"
printf 'required_next=Populate all 48 physical scenarios, the seven-role governed execution binding, wake matrix, threats, resources and Risk Gates A-D before collector finalize.\n'
printf 'authorizes_execution=false\nphysical_acceptance=false\nretry_authorized=false\nw16_build_unblocked=false\n'
