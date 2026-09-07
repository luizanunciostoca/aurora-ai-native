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
PACKAGING_HEAD_SHA="${AURORA_PACKAGING_HEAD_SHA:-47f549e0ffb03ef8c34627221391a828f60f6d89}"
RUN_ID="${AURORA_PACKAGING_RUN_ID:-34075400036}"
ARTIFACT_ID="${AURORA_ARTIFACT_ID:-10001890639}"
ARTIFACT_NAME="${AURORA_ARTIFACT_NAME:-aurora-w15j-physical-apk-e9bd9f0b-host-3c7c3aa9}"
EXPECTED_ZIP_SHA="${AURORA_ARTIFACT_ZIP_SHA256:-526e8a1226a1fa3e3498015214f3acb6a1f26c3db3b69affee4c56d1d60b074b}"
EXPECTED_APK_SHA="${AURORA_APK_SHA256:-371d23846475765d04b87d9ba6e923e8d34e24edb440fde3813237c36842cd14}"

[[ "$PACKAGING_HEAD_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "packaging head SHA must be lowercase 40-hex"
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

embedded_head="$(sed -n 's/^packaging_head_sha=//p' "$TMP/BUILD_IDENTITY.txt")"
embedded_run="$(sed -n 's/^packaging_run_id=//p' "$TMP/BUILD_IDENTITY.txt")"
[[ "$embedded_head" == "$PACKAGING_HEAD_SHA" ]] || fail "embedded packaging head drift"
[[ "$embedded_run" == "$RUN_ID" ]] || fail "embedded packaging run drift"

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

scope="$(sed -n 's/^gateway_transport_scope=//p' "$DEST/BUILD_IDENTITY.txt")"
cat <<EOF
Artifact downloaded and verified on tablet.
artifact=$ARTIFACT_NAME
packaging_head_sha=$PACKAGING_HEAD_SHA
packaging_run_id=$RUN_ID
zip_sha256=$actual_zip_sha
apk_sha256=$actual_apk_sha
embedded_transport_scope=$scope
path=$DEST/Aurora-W15J-Physical-localDebug.apk
EOF
