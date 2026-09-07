#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora control-tower tuple capture failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in gh jq sha256sum mktemp; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"; done
gh auth status >/dev/null 2>&1 || fail "GitHub CLI is not authenticated; run: gh auth login"

REPO="${AURORA_REPOSITORY:-luizanunciostoca/aurora-ai-native}"
MAIN_SHA="${AURORA_MAIN_SHA:-d2089407e88480686b879928cf2863c0dc81718e}"
ANDROID_SHA="${AURORA_ANDROID_SHA:-a45c349c840b6c5125867fee3c7294ad61998cc3}"
HOST_SHA="${AURORA_HOST_SHA:-e280e742321638a852c68346b26cd0cdd69010eb}"
PACKAGING_SHA="${AURORA_PACKAGING_HEAD_SHA:-12231a4070178d12c3812e05fa9e3179aefa68ac}"
PACKAGING_BRANCH="prototype/w15j-physical-apk-artifact"
RUN_ID="${AURORA_PACKAGING_RUN_ID:-34093517317}"
ARTIFACT_ID="${AURORA_ARTIFACT_ID:-10007765042}"
ARTIFACT_NAME="${AURORA_ARTIFACT_NAME:-aurora-w15j-tablet-loopback-apk-a45c349c-host-e280e742}"
ZIP_SHA="${AURORA_ARTIFACT_ZIP_SHA256:-2bc3fe221eb36a07146d2a9fb05f505e715c4a52e0b2488a9bc65d1b6cb005d5}"
APK_SHA="${AURORA_APK_SHA256:-5135a164d551c8f93e0dcfcfdf80ad66b60e69131d51d504ee7c000babbbb993}"
APPLICATION_ID="ai.aurora.device.local"
VARIANT="localDebug"
VERSION_CODE="1"
VERSION_NAME="0.15.0-alpha.1-local"

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
ARTIFACT_DIR="$DEVLAB_ROOT/artifacts"
OUTPUT="${AURORA_CONTROL_TOWER_TUPLE:-$DEVLAB_ROOT/evidence/control-tower-tuple.json}"
LOCAL_ZIP="$ARTIFACT_DIR/$ARTIFACT_NAME.zip"

for sha in "$MAIN_SHA" "$ANDROID_SHA" "$HOST_SHA" "$PACKAGING_SHA"; do
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "all tuple SHAs must be lowercase 40-hex"
done
[[ "$ZIP_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "artifact ZIP SHA must be lowercase 64-hex"
[[ "$APK_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "APK SHA must be lowercase 64-hex"
[[ "$RUN_ID" =~ ^[1-9][0-9]*$ ]] || fail "workflow run id must be positive"
[[ "$ARTIFACT_ID" =~ ^[1-9][0-9]*$ ]] || fail "artifact id must be positive"
[[ "$ARTIFACT_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || fail "artifact name contains unsafe characters"
[[ -f "$LOCAL_ZIP" && ! -L "$LOCAL_ZIP" ]] || fail "verified local artifact ZIP is required; run fetch-current-artifact.sh first"
[[ "$(sha256sum "$LOCAL_ZIP" | awk '{print $1}')" == "$ZIP_SHA" ]] || fail "local artifact ZIP digest drift"

mkdir -p "$(dirname "$OUTPUT")"
chmod 700 "$(dirname "$OUTPUT")"
[[ ! -e "$OUTPUT" ]] || fail "refusing to overwrite existing control-tower tuple: $OUTPUT"
[[ ! -L "$OUTPUT" ]] || fail "output path cannot be a symlink"

api() {
  gh api -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' "$1"
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
  --arg apkSha "$APK_SHA" \
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
      digestSourceRef: $artifactSourceRef
    },
    apk: {
      applicationId: $applicationId,
      variant: $variant,
      versionCode: $versionCode,
      versionName: $versionName,
      sha256: $apkSha
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
