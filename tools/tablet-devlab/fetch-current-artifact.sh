#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora tablet artifact fetch failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in gh sha256sum unzip; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"; done
gh auth status >/dev/null 2>&1 || fail "GitHub CLI is not authenticated; run: gh auth login"

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
DEST="$DEVLAB_ROOT/artifacts"
mkdir -p "$DEST"
chmod 700 "$DEST"

REPO="${AURORA_REPOSITORY:-luizanunciostoca/aurora-ai-native}"
PACKAGING_HEAD_SHA="${AURORA_PACKAGING_HEAD_SHA:-d36369f387ea06332f29073713556c4f793defcb}"
RUN_ID="${AURORA_PACKAGING_RUN_ID:-34923631152}"
ARTIFACT_ID="${AURORA_ARTIFACT_ID:-10379008397}"
ARTIFACT_NAME="${AURORA_ARTIFACT_NAME:-aurora-w15j-tablet-loopback-apk-4de5530a-host-c302e03e}"
EXPECTED_ZIP_SHA="${AURORA_ARTIFACT_ZIP_SHA256:-564eb61eb4e969a4b0e714d3d6acfd99f11f99afb93090cffd3a1d3b8b636bdb}"
EXPECTED_APK_SHA="${AURORA_APK_SHA256:-20cfeeec3406ee3c414e43ffd53cb62c0874743f7650fef5d465807a56877e66}"
EXPECTED_ANDROID_SHA="${AURORA_ANDROID_SHA:-4de5530a6f8b166b016b7d5dc547c38920f31f10}"
EXPECTED_HOST_SHA="${AURORA_HOST_SHA:-c302e03ea44a06b9b13a9e837d14720bde5b505c}"
EXPECTED_MAIN_SHA="${AURORA_MAIN_SHA:-a5af41c57ef08179197c7a94646bcd59af8eb5e1}"
EXPECTED_TRANSPORT_SCOPE="LOCAL_TABLET_LOOPBACK"

for sha in "$PACKAGING_HEAD_SHA" "$EXPECTED_ANDROID_SHA" "$EXPECTED_HOST_SHA" "$EXPECTED_MAIN_SHA"; do
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "candidate SHA must be lowercase 40-hex"
done
[[ "$RUN_ID" =~ ^[1-9][0-9]*$ ]] || fail "packaging run id must be positive"
[[ "$ARTIFACT_ID" =~ ^[1-9][0-9]*$ ]] || fail "artifact id must be positive"
[[ "$ARTIFACT_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || fail "artifact name contains unsafe characters"
[[ "$EXPECTED_ZIP_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "artifact ZIP SHA must be lowercase 64-hex"
[[ "$EXPECTED_APK_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "APK SHA must be lowercase 64-hex"

ZIP="$DEST/$ARTIFACT_NAME.zip"
TMP="$DEST/.extract-$ARTIFACT_ID-$$"
rm -rf "$TMP"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

gh api \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "/repos/$REPO/actions/artifacts/$ARTIFACT_ID/zip" >"$ZIP"

actual_zip_sha="$(sha256sum "$ZIP" | awk '{print $1}')"
[[ "$actual_zip_sha" == "$EXPECTED_ZIP_SHA" ]] || fail "artifact ZIP digest drift: $actual_zip_sha"

mapfile -t entries < <(unzip -Z1 "$ZIP")
[[ "${#entries[@]}" -eq 3 ]] || fail "artifact must contain exactly three files"
for e in "${entries[@]}"; do [[ "$e" =~ ^[A-Za-z0-9._-]+$ ]] || fail "unsafe artifact path: $e"; done
unzip -q "$ZIP" -d "$TMP"
[[ -f "$TMP/BUILD_IDENTITY.txt" && -f "$TMP/SHA256SUMS.txt" ]] || fail "artifact identity files missing"
[[ "$(wc -l < "$TMP/BUILD_IDENTITY.txt" | tr -d ' ')" == "19" ]] || fail "BUILD_IDENTITY must contain exactly 19 lines"

embedded_head="$(sed -n 's/^packaging_head_sha=//p' "$TMP/BUILD_IDENTITY.txt")"
embedded_run="$(sed -n 's/^packaging_run_id=//p' "$TMP/BUILD_IDENTITY.txt")"
embedded_android="$(sed -n 's/^source_candidate_sha=//p' "$TMP/BUILD_IDENTITY.txt")"
embedded_host="$(sed -n 's/^paired_local_host_candidate_sha=//p' "$TMP/BUILD_IDENTITY.txt")"
embedded_main="$(sed -n 's/^reconciled_main_parent_sha=//p' "$TMP/BUILD_IDENTITY.txt")"
embedded_scope="$(sed -n 's/^gateway_transport_scope=//p' "$TMP/BUILD_IDENTITY.txt")"
[[ "$embedded_head" == "$PACKAGING_HEAD_SHA" ]] || fail "embedded packaging head drift"
[[ "$embedded_run" == "$RUN_ID" ]] || fail "embedded packaging run drift"
[[ "$embedded_android" == "$EXPECTED_ANDROID_SHA" ]] || fail "embedded Android SHA drift"
[[ "$embedded_host" == "$EXPECTED_HOST_SHA" ]] || fail "embedded host SHA drift"
[[ "$embedded_main" == "$EXPECTED_MAIN_SHA" ]] || fail "embedded main SHA drift"
[[ "$embedded_scope" == "$EXPECTED_TRANSPORT_SCOPE" ]] || fail "embedded transport scope drift: $embedded_scope"

grep -Fxq 'canonical_acceptance=false' "$TMP/BUILD_IDENTITY.txt" || fail "artifact cannot self-declare acceptance"
grep -Fxq 'physical_evidence_required=true' "$TMP/BUILD_IDENTITY.txt" || fail "artifact physical evidence requirement missing"
grep -Fxq 'dp5_status=INCOMPLETE' "$TMP/BUILD_IDENTITY.txt" || fail "artifact must remain DP5 incomplete before physical evidence"

apk_name="$(awk 'NF >= 2 {print $2}' "$TMP/SHA256SUMS.txt")"
[[ "$apk_name" =~ ^[A-Za-z0-9._-]+\.apk$ ]] || fail "invalid embedded APK name"
[[ -f "$TMP/$apk_name" ]] || fail "embedded APK is missing"
actual_apk_sha="$(sha256sum "$TMP/$apk_name" | awk '{print $1}')"
[[ "$actual_apk_sha" == "$EXPECTED_APK_SHA" ]] || fail "APK digest drift: $actual_apk_sha"
cp "$TMP/$apk_name" "$DEST/Aurora-W15J-Physical-localDebug.apk"
cp "$TMP/BUILD_IDENTITY.txt" "$DEST/BUILD_IDENTITY.txt"
cp "$TMP/SHA256SUMS.txt" "$DEST/SHA256SUMS.txt"

cat >"$DEST/ARTIFACT_METADATA.txt" <<EOF
packaging_head_sha=$PACKAGING_HEAD_SHA
packaging_run_id=$RUN_ID
artifact_id=$ARTIFACT_ID
artifact_name=$ARTIFACT_NAME
artifact_zip_sha256=$actual_zip_sha
EOF
chmod 600 "$DEST/ARTIFACT_METADATA.txt" "$DEST/BUILD_IDENTITY.txt" "$DEST/SHA256SUMS.txt"

cat <<EOF
Artifact downloaded and verified on tablet.
artifact=$ARTIFACT_NAME
packaging_head_sha=$PACKAGING_HEAD_SHA
packaging_run_id=$RUN_ID
zip_sha256=$actual_zip_sha
apk_sha256=$actual_apk_sha
embedded_transport_scope=$embedded_scope
path=$DEST/Aurora-W15J-Physical-localDebug.apk
EOF
