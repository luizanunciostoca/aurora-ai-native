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
PACKAGING_HEAD_SHA="${AURORA_PACKAGING_HEAD_SHA:-524f28baf3eea1e7f9884ac7597187fcd12e740f}"
RUN_ID="${AURORA_PACKAGING_RUN_ID:-35114761659}"
ARTIFACT_ID="${AURORA_ARTIFACT_ID:-10455040637}"
ARTIFACT_NAME="${AURORA_ARTIFACT_NAME:-aurora-w15j-v017r2-presign-apk-19a6327a-host-56255f74}"
EXPECTED_ZIP_SHA="${AURORA_ARTIFACT_ZIP_SHA256:-df68fdad6db37f0d114a555274f2abf3196b12b0a845a46f78a1c72b3a01bf33}"
EXPECTED_PRESIGN_APK_SHA="${AURORA_PRESIGN_APK_SHA256:-1220a987974c2ee393ee958db314e5a31678b2f5c4d8c94fbc11b41ec674d5b2}"
EXPECTED_FINAL_APK_SHA="${AURORA_APK_SHA256:-d06881bc6a0af43876d1c05d5c82e03da30607a92373be4bee929846bce69ba3}"
EXPECTED_CERT_SHA="${AURORA_PHYSICAL_SIGNER_CERT_SHA256:-e1745e3d3940fc6b03aef0b609d43aa8c436901965966087c2366108ffe263fb}"
EXPECTED_ANDROID_SHA="${AURORA_ANDROID_SHA:-19a6327ae84f52aa911f81bf6cc70f057e7bb2a7}"
EXPECTED_HOST_SHA="${AURORA_HOST_SHA:-56255f74ae9a542ee017ca0f81047bc4d12f5580}"
EXPECTED_MAIN_SHA="${AURORA_MAIN_SHA:-77f0f8532197025ee913dd02fcb56878d9d667a9}"
EXPECTED_TRANSPORT_SCOPE="LOCAL_TABLET_LOOPBACK"

for sha in "$PACKAGING_HEAD_SHA" "$EXPECTED_ANDROID_SHA" "$EXPECTED_HOST_SHA" "$EXPECTED_MAIN_SHA"; do
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "candidate SHA must be lowercase 40-hex"
done
[[ "$RUN_ID" =~ ^[1-9][0-9]*$ ]] || fail "packaging run id must be positive"
[[ "$ARTIFACT_ID" =~ ^[1-9][0-9]*$ ]] || fail "artifact id must be positive"
[[ "$ARTIFACT_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || fail "artifact name contains unsafe characters"
[[ "$EXPECTED_ZIP_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "artifact ZIP SHA must be lowercase 64-hex"
[[ "$EXPECTED_PRESIGN_APK_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "pre-sign APK SHA must be lowercase 64-hex"
[[ "$EXPECTED_FINAL_APK_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "final APK SHA must be lowercase 64-hex"
[[ "$EXPECTED_CERT_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "signer certificate SHA must be lowercase 64-hex"

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
[[ "$(wc -l < "$TMP/BUILD_IDENTITY.txt" | tr -d ' ')" == "23" ]] || fail "BUILD_IDENTITY must contain exactly 23 lines"

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
grep -Fxq 'input_signing_profile=DEBUG_FALLBACK' "$TMP/BUILD_IDENTITY.txt" || fail "pre-sign input profile drift"
grep -Fxq 'final_signing_profile=PHYSICAL_DEV_STABLE_LOCAL' "$TMP/BUILD_IDENTITY.txt" || fail "final signing profile drift"
grep -Fxq 'local_signing_required=true' "$TMP/BUILD_IDENTITY.txt" || fail "local signing requirement missing"
grep -Fxq "expected_signer_cert_sha256=$EXPECTED_CERT_SHA" "$TMP/BUILD_IDENTITY.txt" || fail "expected signer certificate drift"

apk_name="$(awk 'NF >= 2 {print $2}' "$TMP/SHA256SUMS.txt")"
[[ "$apk_name" =~ ^[A-Za-z0-9._-]+\.apk$ ]] || fail "invalid embedded APK name"
[[ -f "$TMP/$apk_name" ]] || fail "embedded APK is missing"
actual_presign_sha="$(sha256sum "$TMP/$apk_name" | awk '{print $1}')"
[[ "$actual_presign_sha" == "$EXPECTED_PRESIGN_APK_SHA" ]] || fail "pre-sign APK digest drift: $actual_presign_sha"
cp "$TMP/$apk_name" "$DEST/Aurora-W15J-Physical-presign.apk"
rm -f "$DEST/Aurora-W15J-Physical-localDebug.apk" "$DEST/FINAL_SIGNING_IDENTITY.txt"
cp "$TMP/BUILD_IDENTITY.txt" "$DEST/BUILD_IDENTITY.txt"
cp "$TMP/SHA256SUMS.txt" "$DEST/SHA256SUMS.txt"

cat >"$DEST/ARTIFACT_METADATA.txt" <<EOF
packaging_head_sha=$PACKAGING_HEAD_SHA
packaging_run_id=$RUN_ID
artifact_id=$ARTIFACT_ID
artifact_name=$ARTIFACT_NAME
artifact_zip_sha256=$actual_zip_sha
presign_apk_sha256=$actual_presign_sha
expected_final_apk_sha256=$EXPECTED_FINAL_APK_SHA
expected_signer_cert_sha256=$EXPECTED_CERT_SHA
EOF
chmod 600 "$DEST/ARTIFACT_METADATA.txt" "$DEST/BUILD_IDENTITY.txt" "$DEST/SHA256SUMS.txt"

cat <<EOF
Artifact downloaded and verified on tablet.
artifact=$ARTIFACT_NAME
packaging_head_sha=$PACKAGING_HEAD_SHA
packaging_run_id=$RUN_ID
zip_sha256=$actual_zip_sha
presign_apk_sha256=$actual_presign_sha
expected_final_apk_sha256=$EXPECTED_FINAL_APK_SHA
embedded_transport_scope=$embedded_scope
path=$DEST/Aurora-W15J-Physical-presign.apk
next=bash tools/tablet-devlab/sign-current-artifact.sh
EOF
