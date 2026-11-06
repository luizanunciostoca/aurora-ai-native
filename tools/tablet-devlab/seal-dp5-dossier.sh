#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora DP5 dossier sealing failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in git node jq sha256sum find sort sed awk realpath mktemp; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"
done

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
ANDROID_WORKTREE="$DEVLAB_ROOT/worktrees/android"
EVIDENCE_DIR="${AURORA_EVIDENCE_DIR:-$DEVLAB_ROOT/evidence/w15j-dp5}"
TUPLE="${AURORA_CONTROL_TOWER_TUPLE:-$DEVLAB_ROOT/evidence/control-tower-tuple.json}"
DOSSIER="${AURORA_W15J_DOSSIER:-$EVIDENCE_DIR/w15j-evidence.json}"
BINDING="${AURORA_W15J_GOVERNED_EXECUTION_BINDING:-$EVIDENCE_DIR/governed-execution-binding.json}"
BINDER="$ANDROID_WORKTREE/tools/acceptance/w15j-tablet-loopback-dossier-lifecycle.mjs"
PREFLIGHT="$EVIDENCE_DIR/preflight-metadata.txt"
FINALIZE="$EVIDENCE_DIR/finalize-metadata.txt"
APK_IDENTITY="$EVIDENCE_DIR/apk-identity.txt"
FINAL_MANIFEST="$EVIDENCE_DIR/evidence-manifest.sha256"
PRESEAL_MANIFEST="$EVIDENCE_DIR/collector-finalize-manifest.preseal.sha256"
SEAL_STATUS="$EVIDENCE_DIR/dossier-seal-status.txt"
REVIEWER="$EVIDENCE_DIR/reviewer-attestation.json"

[[ -d "$EVIDENCE_DIR" && ! -L "$EVIDENCE_DIR" ]] || fail "finalized collector evidence directory is required"
for path in "$TUPLE" "$DOSSIER" "$BINDING" "$BINDER" "$PREFLIGHT" "$FINALIZE" "$APK_IDENTITY" "$FINAL_MANIFEST"; do
  [[ -f "$path" && ! -L "$path" ]] || fail "required regular file missing: $path"
done
[[ ! -e "$PRESEAL_MANIFEST" ]] || fail "dossier was already sealed; refusing a second seal"
[[ ! -e "$SEAL_STATUS" ]] || fail "dossier seal status already exists"
[[ ! -e "$REVIEWER" ]] || fail "reviewer attestation must be created only after dossier sealing"

[[ "$(realpath "$(dirname "$DOSSIER")")" == "$(realpath "$EVIDENCE_DIR")" ]] || \
  fail "operator dossier must be a top-level file in the evidence directory"
[[ "$(basename "$DOSSIER")" == "w15j-evidence.json" ]] || \
  fail "canonical operator dossier must be named w15j-evidence.json"
[[ "$(realpath "$(dirname "$BINDING")")" == "$(realpath "$EVIDENCE_DIR")" ]] || \
  fail "governed execution binding must be a top-level file in the evidence directory"
[[ "$(basename "$BINDING")" == "governed-execution-binding.json" ]] || \
  fail "canonical semantic binding must be named governed-execution-binding.json"

jq -e \
  '.schemaVersion == "w15j-governed-execution-binding-v1" and
   .authorityInvariant == "INTELLIGENCE != AUTHORITY != EXECUTION" and
   .semantics.kind == "EVIDENCE_BINDING_ONLY" and
   .semantics.authorizesExecution == false and
   .semantics.provesExecutionSuccess == false and
   .semantics.retryAuthorized == false and
   .semantics.physicalAcceptance == false and
   .semantics.w16BuildUnblocked == false' \
  "$BINDING" >/dev/null || fail "governed execution binding lost canonical non-authority semantics"

android_sha="$(jq -er '.androidCandidateSha' "$TUPLE")"
[[ "$android_sha" =~ ^[0-9a-f]{40}$ ]] || fail "Control Tower Android SHA is malformed"
[[ "$(git -C "$ANDROID_WORKTREE" rev-parse HEAD)" == "$android_sha" ]] || \
  fail "Android worktree does not match the captured Control Tower tuple"
[[ -z "$(git -C "$ANDROID_WORKTREE" status --porcelain)" ]] || \
  fail "Android worktree must remain clean during dossier sealing"

verify_manifest_inventory() {
  local manifest="$1"
  local listed actual
  listed="$(sed -nE 's/^[a-f0-9]{64}  (.+)$/\1/p' "$manifest" | sort)"
  actual="$(
    find "$EVIDENCE_DIR" -mindepth 1 -maxdepth 1 -type f \
      ! -name 'evidence-manifest.sha256' \
      ! -name 'reviewer-attestation.json' \
      ! -name 'collector-finalize-manifest.preseal.sha256' \
      ! -name 'dossier-seal-status.txt' \
      -printf '%f\n' | sort
  )"
  [[ "$listed" == "$actual" ]] || fail "collector final manifest inventory does not exactly match pre-seal evidence"
  (
    cd "$EVIDENCE_DIR"
    sha256sum -c "$(basename "$manifest")" >/dev/null
  ) || fail "collector final manifest digest verification failed"
}

verify_manifest_inventory "$FINAL_MANIFEST"
for required in "$(basename "$DOSSIER")" "$(basename "$BINDING")"; do
  [[ "$(awk -v name="$required" '$2 == name {count++} END {print count+0}' "$FINAL_MANIFEST")" -eq 1 ]] || \
    fail "collector final manifest must contain exactly one $required entry"
done
cp -- "$FINAL_MANIFEST" "$PRESEAL_MANIFEST"
chmod 600 "$PRESEAL_MANIFEST"

preseal_manifest_sha="$(sha256sum "$PRESEAL_MANIFEST" | awk '{print $1}')"
dossier_preseal_sha="$(
  awk '$2 == "w15j-evidence.json" {print $1}' "$PRESEAL_MANIFEST"
)"
[[ "$dossier_preseal_sha" =~ ^[0-9a-f]{64}$ ]] || fail "collector manifest did not bind w15j-evidence.json"
[[ "$(sha256sum "$DOSSIER" | awk '{print $1}')" == "$dossier_preseal_sha" ]] || \
  fail "operator dossier changed after collector finalization"
binding_preseal_sha="$(awk '$2 == "governed-execution-binding.json" {print $1}' "$PRESEAL_MANIFEST")"
[[ "$binding_preseal_sha" =~ ^[0-9a-f]{64}$ ]] || fail "collector manifest did not bind governed-execution-binding.json"
[[ "$(sha256sum "$BINDING" | awk '{print $1}')" == "$binding_preseal_sha" ]] || \
  fail "governed execution binding changed after collector finalization"

node "$BINDER" finalize "$DOSSIER" "$TUPLE" "$PREFLIGHT" "$APK_IDENTITY" "$FINALIZE"
chmod 600 "$DOSSIER"
dossier_sealed_sha="$(sha256sum "$DOSSIER" | awk '{print $1}')"
[[ "$dossier_sealed_sha" =~ ^[0-9a-f]{64}$ ]] || fail "sealed dossier SHA is malformed"
[[ "$dossier_sealed_sha" != "$dossier_preseal_sha" ]] || \
  fail "dossier sealing did not bind the collector-owned finalization timestamp"

finalized_at="$(sed -n 's/^finalized_at_utc=//p' "$FINALIZE")"
[[ -n "$finalized_at" ]] || fail "finalize metadata lacks finalized_at_utc"
[[ "$(jq -er '.environment.finalizedAtUtc' "$DOSSIER")" == "$finalized_at" ]] || \
  fail "sealed dossier timestamp differs from collector finalize metadata"

cat >"$SEAL_STATUS" <<EOF
schema=w15j-tablet-loopback-dossier-seal-v1
collector_manifest_sha256=$preseal_manifest_sha
dossier_preseal_sha256=$dossier_preseal_sha
dossier_sealed_sha256=$dossier_sealed_sha
governed_execution_binding_sha256=$binding_preseal_sha
finalized_at_utc=$finalized_at
authorizes_execution=false
proves_execution_success=false
retry_authorized=false
physical_acceptance=false
w16_build_unblocked=false
EOF
chmod 600 "$SEAL_STATUS"

tmp_manifest="$(mktemp "$(dirname "$EVIDENCE_DIR")/.w15j-final-manifest.XXXXXX")"
trap 'rm -f -- "$tmp_manifest"' EXIT
(
  cd "$EVIDENCE_DIR"
  while IFS= read -r -d '' file; do
    rel="${file#./}"
    [[ "$rel" == "evidence-manifest.sha256" || "$rel" == "reviewer-attestation.json" ]] && continue
    sha256sum "$rel"
  done < <(find . -maxdepth 1 -type f -print0 | sort -z)
) >"$tmp_manifest"
chmod 600 "$tmp_manifest"
mv "$tmp_manifest" "$FINAL_MANIFEST"
trap - EXIT
chmod 600 "$FINAL_MANIFEST"

(
  cd "$EVIDENCE_DIR"
  sha256sum -c "$(basename "$FINAL_MANIFEST")" >/dev/null
) || fail "sealed final manifest digest verification failed"
for required in \
  "$(basename "$PRESEAL_MANIFEST")" \
  "$(basename "$SEAL_STATUS")" \
  "$(basename "$DOSSIER")" \
  "$(basename "$BINDING")"; do
  grep -Eq "^[a-f0-9]{64}  ${required//./\\.}$" "$FINAL_MANIFEST" || \
    fail "sealed final manifest is missing $required"
done

printf 'DP5_DOSSIER_SEALED_READY_FOR_REVIEWER_NOT_ACCEPTED\n'
printf 'dossier=%s\nbinding=%s\nfinal_manifest=%s\n' "$DOSSIER" "$BINDING" "$FINAL_MANIFEST"
printf 'collector_manifest_sha256=%s\ndossier_sealed_sha256=%s\ngoverned_execution_binding_sha256=%s\n' \
  "$preseal_manifest_sha" "$dossier_sealed_sha" "$binding_preseal_sha"
printf 'required_next=Independent reviewer must bind reviewer-attestation.json to this sealed final manifest digest without regenerating the manifest.\n'
printf 'authorizes_execution=false\nphysical_acceptance=false\nretry_authorized=false\nw16_build_unblocked=false\n'
