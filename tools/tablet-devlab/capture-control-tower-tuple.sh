#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora control-tower tuple capture failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in gh jq sha256sum mktemp sleep; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"; done
gh auth status >/dev/null 2>&1 || fail "GitHub CLI is not authenticated; run: gh auth login"

REPO="${AURORA_REPOSITORY:-luizanunciostoca/aurora-ai-native}"
MAIN_SHA="${AURORA_MAIN_SHA:-77f0f8532197025ee913dd02fcb56878d9d667a9}"
ANDROID_SHA="${AURORA_ANDROID_SHA:-54d9fd47e48736fde80e5963b28cdcc121989648}"
HOST_SHA="${AURORA_HOST_SHA:-7d9c9bebb8d12b00b8e0629387edd483e14638b6}"
PACKAGING_SHA="${AURORA_PACKAGING_HEAD_SHA:-3987ba0808512f5324fd13264f93ab155508b2b0}"
PACKAGING_BRANCH="prototype/w15j-physical-apk-artifact"
RUN_ID="${AURORA_PACKAGING_RUN_ID:-35022834461}"
ARTIFACT_ID="${AURORA_ARTIFACT_ID:-10417783170}"
ARTIFACT_NAME="${AURORA_ARTIFACT_NAME:-aurora-w15j-v017-presign-apk-54d9fd47-host-7d9c9beb}"
ZIP_SHA="${AURORA_ARTIFACT_ZIP_SHA256:-9aea4fed45dcb1da6e606f6d5e15e3193304a68060da8f6161c401b0a576fc7f}"
PRESIGN_SHA="${AURORA_PRESIGN_APK_SHA256:-99af33d2d786560fbb3351396706f6e1eb3185ebeebb4bb34f32721b736bbbc4}"
APK_SHA="${AURORA_APK_SHA256:-f1d390cc6743b0d235fd62451caf39c0f8bf169281dfbe734e5bc6300d4d657d}"
SIGNER_CERT_SHA="${AURORA_PHYSICAL_SIGNER_CERT_SHA256:-e1745e3d3940fc6b03aef0b609d43aa8c436901965966087c2366108ffe263fb}"
APPLICATION_ID="ai.aurora.device.local"
VARIANT="localDebug"
VERSION_CODE="4"
VERSION_NAME="0.17.0-dev.1-local"

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
ARTIFACT_DIR="$DEVLAB_ROOT/artifacts"
OUTPUT="${AURORA_CONTROL_TOWER_TUPLE:-$DEVLAB_ROOT/evidence/control-tower-tuple.json}"
LOCAL_ZIP="$ARTIFACT_DIR/$ARTIFACT_NAME.zip"
LOCAL_APK="$ARTIFACT_DIR/Aurora-W15J-Physical-localDebug.apk"
SIGNING_IDENTITY="$ARTIFACT_DIR/FINAL_SIGNING_IDENTITY.txt"

for sha in "$MAIN_SHA" "$ANDROID_SHA" "$HOST_SHA" "$PACKAGING_SHA"; do
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "all tuple SHAs must be lowercase 40-hex"
done
[[ "$ZIP_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "artifact ZIP SHA must be lowercase 64-hex"
[[ "$PRESIGN_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "pre-sign APK SHA must be lowercase 64-hex"
[[ "$APK_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "APK SHA must be lowercase 64-hex"
[[ "$SIGNER_CERT_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "signer certificate SHA must be lowercase 64-hex"
[[ "$RUN_ID" =~ ^[1-9][0-9]*$ ]] || fail "workflow run id must be positive"
[[ "$ARTIFACT_ID" =~ ^[1-9][0-9]*$ ]] || fail "artifact id must be positive"
[[ "$ARTIFACT_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || fail "artifact name contains unsafe characters"
[[ -f "$LOCAL_ZIP" && ! -L "$LOCAL_ZIP" ]] || fail "verified local artifact ZIP is required; run fetch-current-artifact.sh first"
[[ "$(sha256sum "$LOCAL_ZIP" | awk '{print $1}')" == "$ZIP_SHA" ]] || fail "local artifact ZIP digest drift"
[[ -f "$LOCAL_APK" && ! -L "$LOCAL_APK" ]] || fail "stable-signed local APK is required"
[[ "$(sha256sum "$LOCAL_APK" | awk '{print $1}')" == "$APK_SHA" ]] || fail "stable-signed local APK digest drift"
[[ -f "$SIGNING_IDENTITY" && ! -L "$SIGNING_IDENTITY" ]] || fail "FINAL_SIGNING_IDENTITY is required"
grep -Fxq "presign_apk_sha256=$PRESIGN_SHA" "$SIGNING_IDENTITY" || fail "pre-sign identity drift"
grep -Fxq "final_apk_sha256=$APK_SHA" "$SIGNING_IDENTITY" || fail "final APK identity drift"
grep -Fxq "signer_cert_sha256=$SIGNER_CERT_SHA" "$SIGNING_IDENTITY" || fail "signer certificate identity drift"
grep -Fxq 'signing_profile=PHYSICAL_DEV_STABLE_LOCAL' "$SIGNING_IDENTITY" || fail "stable signing profile missing"
grep -Fxq 'deterministic_signing=true' "$SIGNING_IDENTITY" || fail "deterministic signing proof missing"

mkdir -p "$(dirname "$OUTPUT")"
chmod 700 "$(dirname "$OUTPUT")"
[[ ! -e "$OUTPUT" ]] || fail "refusing to overwrite existing control-tower tuple: $OUTPUT"
[[ ! -L "$OUTPUT" ]] || fail "output path cannot be a symlink"

api() {
  local endpoint="$1" attempt output
  for attempt in 1 2 3 4; do
    if output="$(gh api -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' "$endpoint" 2>/dev/null)"; then
      printf '%s\n' "$output"
      return 0
    fi
    [[ "$attempt" -lt 4 ]] && sleep $((attempt * 2))
  done
  fail "GitHub API unavailable after bounded retries: $endpoint"
}

live_main="$(api "/repos/$REPO/branches/main" | jq -er '.commit.sha')"
[[ "$live_main" == "$MAIN_SHA" ]] || fail "main drift: expected $MAIN_SHA, observed $live_main"

validate_pr() {
  local number="$1" expected_head="$2" label="$3"
  local payload head base state draft merged_at
  payload="$(api "/repos/$REPO/pulls/$number")"
  head="$(jq -er '.head.sha' <<<"$payload")"
  base="$(jq -er '.base.sha' <<<"$payload")"
  state="$(jq -er '.state' <<<"$payload")"
  draft="$(jq -er '.draft' <<<"$payload")"
  merged_at="$(jq -r '.merged_at // ""' <<<"$payload")"
  [[ "$head" == "$expected_head" ]] || fail "$label head drift: $head"
  [[ "$base" == "$MAIN_SHA" ]] || fail "$label base drift: $base"
  [[ "$state" == "open" && "$draft" == "true" && -z "$merged_at" ]] || fail "$label must remain open/draft/unmerged before DP5 acceptance"

  local compare merge_base behind
  compare="$(api "/repos/$REPO/compare/$MAIN_SHA...$expected_head")"
  merge_base="$(jq -er '.merge_base_commit.sha' <<<"$compare")"
  behind="$(jq -er '.behind_by' <<<"$compare")"
  [[ "$merge_base" == "$MAIN_SHA" && "$behind" == "0" ]] || fail "$label no longer reconciles exactly to current main"
}

validate_pr 413 "$ANDROID_SHA" "Android #413"
validate_pr 462 "$HOST_SHA" "host #462"

run="$(api "/repos/$REPO/actions/runs/$RUN_ID")"
run_id="$(jq -er '.id' <<<"$run")"
run_url="$(jq -er '.html_url' <<<"$run")"
run_status="$(jq -er '.status' <<<"$run")"
run_conclusion="$(jq -er '.conclusion' <<<"$run")"
run_head="$(jq -er '.head_sha' <<<"$run")"
run_branch="$(jq -er '.head_branch' <<<"$run")"
run_event="$(jq -er '.event' <<<"$run")"
[[ "$run_id" == "$RUN_ID" ]] || fail "workflow run id drift"
[[ "$run_status" == "completed" && "$run_conclusion" == "success" ]] || fail "packaging workflow is not completed/success"
[[ "$run_head" == "$PACKAGING_SHA" ]] || fail "packaging workflow head drift"
[[ "$run_branch" == "$PACKAGING_BRANCH" ]] || fail "packaging workflow branch drift"
[[ "$run_event" == "push" ]] || fail "packaging workflow event must be push"

artifact="$(api "/repos/$REPO/actions/artifacts/$ARTIFACT_ID")"
artifact_id="$(jq -er '.id' <<<"$artifact")"
artifact_name="$(jq -er '.name' <<<"$artifact")"
artifact_expired="$(jq -r '.expired' <<<"$artifact")"
artifact_run_id="$(jq -er '.workflow_run.id' <<<"$artifact")"
artifact_digest="$(jq -r '.digest // ""' <<<"$artifact")"
[[ "$artifact_id" == "$ARTIFACT_ID" ]] || fail "artifact id drift"
[[ "$artifact_name" == "$ARTIFACT_NAME" ]] || fail "artifact name drift"
[[ "$artifact_expired" == "false" ]] || fail "artifact is expired"
[[ "$artifact_run_id" == "$RUN_ID" ]] || fail "artifact is not owned by the expected packaging run"
if [[ -n "$artifact_digest" ]]; then
  [[ "$artifact_digest" == "sha256:$ZIP_SHA" ]] || fail "GitHub artifact digest drift: $artifact_digest"
fi

run_source_ref="${run_url}#head-sha-${PACKAGING_SHA}"
artifact_source_ref="${run_url}#artifact-${ARTIFACT_ID}"

tmp="$(mktemp "$(dirname "$OUTPUT")/.control-tower-tuple.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
jq -n \
  --arg repository "$REPO" \
  --arg runId "$RUN_ID" \
  --arg runUrl "$run_url" \
  --arg packagingSha "$PACKAGING_SHA" \
  --arg packagingBranch "$PACKAGING_BRANCH" \
  --arg runSourceRef "$run_source_ref" \
  --arg androidSha "$ANDROID_SHA" \
  --arg hostSha "$HOST_SHA" \
  --arg mainSha "$MAIN_SHA" \
  --arg artifactId "$ARTIFACT_ID" \
  --arg artifactName "$ARTIFACT_NAME" \
  --arg zipSha "$ZIP_SHA" \
  --arg artifactSourceRef "$artifact_source_ref" \
  --arg applicationId "$APPLICATION_ID" \
  --arg variant "$VARIANT" \
  --arg versionCode "$VERSION_CODE" \
  --arg versionName "$VERSION_NAME" \
  --arg presignSha "$PRESIGN_SHA" \
  --arg apkSha "$APK_SHA" \
  --arg signerCertSha "$SIGNER_CERT_SHA" \
  '{
    schemaVersion: "w15j-control-tower-tuple-v1",
    repository: $repository,
    workflowRun: {
      id: $runId,
      url: $runUrl,
      status: "SUCCESS",
      headSha: $packagingSha,
      headBranch: $packagingBranch,
      eventName: "push",
      sourceRef: $runSourceRef
    },
    androidCandidateSha: $androidSha,
    hostCandidateSha: $hostSha,
    reconciledMainSha: $mainSha,
    packagingHeadSha: $packagingSha,
    artifact: {
      id: $artifactId,
      name: $artifactName,
      zipSha256: $zipSha,
      presignApkSha256: $presignSha,
      digestSourceRef: $artifactSourceRef
    },
    apk: {
      applicationId: $applicationId,
      variant: $variant,
      versionCode: $versionCode,
      versionName: $versionName,
      sha256: $apkSha
    },
    signing: {
      profile: "PHYSICAL_DEV_STABLE_LOCAL",
      signerCertSha256: $signerCertSha,
      deterministic: true,
      privateKeyExported: false
    }
  }' >"$tmp"
chmod 600 "$tmp"
mv "$tmp" "$OUTPUT"
trap - EXIT
chmod 600 "$OUTPUT"

printf 'CONTROL_TOWER_TUPLE_CAPTURED_READY_NOT_ACCEPTED\n'
printf 'path=%s\n' "$OUTPUT"
printf 'main=%s\nandroid=%s\nhost=%s\npackaging=%s\nrun=%s\nartifact=%s\n' \
  "$MAIN_SHA" "$ANDROID_SHA" "$HOST_SHA" "$PACKAGING_SHA" "$RUN_ID" "$ARTIFACT_ID"
printf 'authorizes_execution=false\nphysical_acceptance=false\nretry_authorized=false\n'
