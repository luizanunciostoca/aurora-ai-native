#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora Interactive v0.16 smoke preparation failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in gh adb sha256sum unzip cmp date sed awk; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"
done
gh auth status >/dev/null 2>&1 || fail "GitHub CLI is not authenticated"

REPO="${AURORA_REPOSITORY:-luizanunciostoca/aurora-ai-native}"
DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
ROOT="$DEVLAB_ROOT/interactive-v016-smoke"
ARTIFACT_DIR="$ROOT/artifact"
EVIDENCE_ROOT="$ROOT/evidence"
mkdir -p "$ARTIFACT_DIR" "$EVIDENCE_ROOT"
chmod 700 "$ROOT" "$ARTIFACT_DIR" "$EVIDENCE_ROOT"

PACKAGING_HEAD_SHA="4234fd9d904d3cfc015e2087f4e00639c916c8fb"
PACKAGING_RUN_ID="34692024379"
ARTIFACT_ID="10297460992"
ARTIFACT_NAME="aurora-interactive-v016-physical-bd9081d1-host-294e8754"
EXPECTED_ZIP_SHA="a9169ad4f9b9548924a8c17373f18ae48915c323acd82dbad1734236caab92e8"
EXPECTED_APK_SHA="efacae2cd43165dd81c176e085f58bbd0ec32525318a82aa5efc8dec42116d01"
EXPECTED_ANDROID_SHA="bd9081d1016bdf83af0a0ef0959ae97f59e0dc49"
EXPECTED_HOST_SHA="294e8754a568838ade40f1907546339385d7e599"
EXPECTED_DEVLAB_SHA="4924956abde3e0e312c54e97ac94191b8949679c"
EXPECTED_MAIN_SHA="d2089407e88480686b879928cf2863c0dc81718e"
EXPECTED_GATEWAY_ORIGIN="http://127.0.0.1:8080"
EXPECTED_BOOTSTRAP_ORIGIN="http://127.0.0.1:8081"
EXPECTED_TRANSPORT_SCOPE="LOCAL_TABLET_LOOPBACK"
PACKAGE_ID="ai.aurora.device.local"
LAUNCH_COMPONENT="$PACKAGE_ID/ai.aurora.device.MainActivity"

ZIP="$ARTIFACT_DIR/$ARTIFACT_NAME.zip"
TMP="$ARTIFACT_DIR/.extract-$$"
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
[[ "${#entries[@]}" -eq 4 ]] || fail "artifact must contain exactly four files"
for entry in "${entries[@]}"; do
  [[ "$entry" =~ ^[A-Za-z0-9._-]+$ ]] || fail "unsafe artifact path: $entry"
done
unzip -q "$ZIP" -d "$TMP"

APK="$TMP/Aurora-Interactive-v0.16-Physical-localDebug.apk"
IDENTITY="$TMP/BUILD_IDENTITY.txt"
SOURCE_TUPLE="$TMP/SOURCE_TUPLE.json"
SUMS="$TMP/SHA256SUMS.txt"
for file in "$APK" "$IDENTITY" "$SOURCE_TUPLE" "$SUMS"; do
  [[ -f "$file" && ! -L "$file" ]] || fail "artifact payload is incomplete"
done
[[ "$(wc -l < "$IDENTITY" | tr -d ' ')" == "25" ]] || fail "unexpected BUILD_IDENTITY shape"

field() { sed -n "s/^$1=//p" "$IDENTITY"; }
[[ "$(field source_candidate_sha)" == "$EXPECTED_ANDROID_SHA" ]] || fail "Android SHA drift"
[[ "$(field paired_local_host_candidate_sha)" == "$EXPECTED_HOST_SHA" ]] || fail "host SHA drift"
[[ "$(field devlab_candidate_sha)" == "$EXPECTED_DEVLAB_SHA" ]] || fail "DevLab SHA drift"
[[ "$(field reconciled_main_sha)" == "$EXPECTED_MAIN_SHA" ]] || fail "main SHA drift"
[[ "$(field packaging_head_sha)" == "$PACKAGING_HEAD_SHA" ]] || fail "packaging SHA drift"
[[ "$(field packaging_run_id)" == "$PACKAGING_RUN_ID" ]] || fail "packaging run drift"
[[ "$(field gateway_origin)" == "$EXPECTED_GATEWAY_ORIGIN" ]] || fail "gateway origin is not tablet loopback"
[[ "$(field bootstrap_origin)" == "$EXPECTED_BOOTSTRAP_ORIGIN" ]] || fail "bootstrap origin is not tablet loopback"
[[ "$(field gateway_transport_scope)" == "$EXPECTED_TRANSPORT_SCOPE" ]] || fail "transport scope drift"
[[ "$(field package_id)" == "$PACKAGE_ID" ]] || fail "package id drift"
[[ "$(field version_code)" == "3" ]] || fail "versionCode drift"
[[ "$(field version_name)" == "0.16.0-physical.1-local" ]] || fail "versionName drift"
grep -Fxq 'canonical_dp5_acceptance_artifact=false' "$IDENTITY" || fail "smoke artifact cannot self-declare DP5 acceptance"
grep -Fxq 'physical_acceptance_status=SMOKE_PENDING' "$IDENTITY" || fail "physical smoke status drift"
grep -Fxq 'dp5_status=INCOMPLETE' "$IDENTITY" || fail "DP5 status must remain INCOMPLETE"

actual_apk_sha="$(sha256sum "$APK" | awk '{print $1}')"
[[ "$actual_apk_sha" == "$EXPECTED_APK_SHA" ]] || fail "APK digest drift: $actual_apk_sha"
grep -Fxq "$EXPECTED_APK_SHA  Aurora-Interactive-v0.16-Physical-localDebug.apk" "$SUMS" || fail "embedded SHA256SUMS drift"

cp "$APK" "$ARTIFACT_DIR/Aurora-Interactive-v0.16-Physical-localDebug.apk"
cp "$IDENTITY" "$ARTIFACT_DIR/BUILD_IDENTITY.txt"
cp "$SOURCE_TUPLE" "$ARTIFACT_DIR/SOURCE_TUPLE.json"
cp "$SUMS" "$ARTIFACT_DIR/SHA256SUMS.txt"
chmod 600 "$ARTIFACT_DIR"/*.txt "$ARTIFACT_DIR"/*.json 2>/dev/null || true

mapfile -t DEVICES < <(adb devices | awk 'NR > 1 && $2 == "device" {print $1}')
[[ "${#DEVICES[@]}" -eq 1 ]] || fail "exactly one self-ADB physical device is required; found ${#DEVICES[@]}"
SERIAL="${DEVICES[0]}"
ADB=(adb -s "$SERIAL")
QEMU="$("${ADB[@]}" shell getprop ro.kernel.qemu | tr -d '\r\n')"
[[ "$QEMU" != "1" && "$SERIAL" != emulator-* ]] || fail "emulator detected"
MODEL="$("${ADB[@]}" shell getprop ro.product.model | tr -d '\r\n')"
[[ "$MODEL" == "SM-X820" ]] || fail "representative device must be SM-X820; observed $MODEL"

reverse_state="$("${ADB[@]}" reverse --list 2>/dev/null || true)"
if printf '%s\n' "$reverse_state" | grep -Eq 'tcp:(8080|8081)'; then
  fail "ADB reverse on 8080/8081 is forbidden for LOCAL_TABLET_LOOPBACK"
fi

WINDOW="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="$EVIDENCE_ROOT/install-$WINDOW"
mkdir -p "$EVIDENCE_DIR"
chmod 700 "$EVIDENCE_DIR"

mapfile -t PRE_PATHS < <("${ADB[@]}" shell pm path "$PACKAGE_ID" 2>/dev/null | tr -d '\r' | sed -n 's/^package://p')
[[ "${#PRE_PATHS[@]}" -le 1 ]] || fail "installed package is split/non-canonical"
prior_present=false
prior_sha="NOT_INSTALLED"
prior_exact=false
clean_install=false

if [[ "${#PRE_PATHS[@]}" -eq 1 ]]; then
  prior_present=true
  PRIOR_APK="$EVIDENCE_DIR/installed-before.apk"
  "${ADB[@]}" pull "${PRE_PATHS[0]}" "$PRIOR_APK" >"$EVIDENCE_DIR/pull-before.txt" 2>&1 || fail "installed APK readback failed"
  prior_sha="$(sha256sum "$PRIOR_APK" | awk '{print $1}')"
  if [[ "$prior_sha" == "$EXPECTED_APK_SHA" ]] && cmp -s "$APK" "$PRIOR_APK"; then
    prior_exact=true
  fi
fi

if [[ "$prior_exact" != "true" ]]; then
  if [[ "$prior_present" == "true" ]]; then
    if [[ "${AURORA_ALLOW_CLEAN_INSTALL:-NO}" != "YES" ]]; then
      cat >&2 <<EOF
A different Aurora APK is installed.
prior_apk_sha256=$prior_sha
required_apk_sha256=$EXPECTED_APK_SHA

A clean uninstall removes Aurora local app data and is therefore not performed automatically.
No mutation was performed.
If you intentionally authorize replacement, run:
  AURORA_ALLOW_CLEAN_INSTALL=YES bash tools/tablet-devlab/prepare-interactive-v016-smoke.sh
EOF
      exit 3
    fi
    clean_install=true
    "${ADB[@]}" uninstall "$PACKAGE_ID" >"$EVIDENCE_DIR/uninstall.txt" 2>&1 || fail "clean uninstall failed"
    grep -Fxq 'Success' "$EVIDENCE_DIR/uninstall.txt" || fail "uninstall did not report Success"
  fi

  "${ADB[@]}" install "$APK" >"$EVIDENCE_DIR/install.txt" 2>&1 || fail "APK install failed"
  grep -Fxq 'Success' "$EVIDENCE_DIR/install.txt" || fail "install did not report Success"
fi

mapfile -t POST_PATHS < <("${ADB[@]}" shell pm path "$PACKAGE_ID" | tr -d '\r' | sed -n 's/^package://p')
[[ "${#POST_PATHS[@]}" -eq 1 ]] || fail "exactly one installed base APK required"
POST_APK="$EVIDENCE_DIR/installed-after.apk"
"${ADB[@]}" pull "${POST_PATHS[0]}" "$POST_APK" >"$EVIDENCE_DIR/pull-after.txt" 2>&1 || fail "installed APK readback failed"
installed_sha="$(sha256sum "$POST_APK" | awk '{print $1}')"
[[ "$installed_sha" == "$EXPECTED_APK_SHA" ]] || fail "installed APK SHA drift"
cmp -s "$APK" "$POST_APK" || fail "installed APK differs byte-for-byte from final candidate"

SERIAL_SHA="$(printf '%s' "$SERIAL" | sha256sum | awk '{print $1}')"
cat >"$EVIDENCE_DIR/install-evidence.json" <<EOF
{
  "kind": "AURORA_INTERACTIVE_V016_SMOKE_INSTALL_EVIDENCE",
  "observedAtUtc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deviceModel": "$MODEL",
  "deviceSerialSha256": "$SERIAL_SHA",
  "mainSha": "$EXPECTED_MAIN_SHA",
  "androidSha": "$EXPECTED_ANDROID_SHA",
  "hostSha": "$EXPECTED_HOST_SHA",
  "devlabSha": "$EXPECTED_DEVLAB_SHA",
  "packagingSha": "$PACKAGING_HEAD_SHA",
  "packagingRun": "$PACKAGING_RUN_ID",
  "artifactId": "$ARTIFACT_ID",
  "artifactZipSha256": "$actual_zip_sha",
  "apkSha256": "$installed_sha",
  "gatewayOrigin": "$EXPECTED_GATEWAY_ORIGIN",
  "bootstrapOrigin": "$EXPECTED_BOOTSTRAP_ORIGIN",
  "transportScope": "$EXPECTED_TRANSPORT_SCOPE",
  "priorPackagePresent": $prior_present,
  "priorApkSha256": "$prior_sha",
  "cleanInstallPerformed": $clean_install,
  "physicalAcceptanceStatus": "SMOKE_INSTALLED_NOT_ACCEPTED",
  "dp5Status": "INCOMPLETE",
  "authorizesExecution": false,
  "provesExecutionSuccess": false,
  "retryAuthorized": false
}
EOF

"${ADB[@]}" shell am force-stop "$PACKAGE_ID" >/dev/null 2>&1 || true
"${ADB[@]}" shell am start -n "$LAUNCH_COMPONENT" >"$EVIDENCE_DIR/launch.txt" 2>&1 || fail "Aurora launch failed"

grep -q 'Status: ok\|Starting:' "$EVIDENCE_DIR/launch.txt" || true

cat <<EOF
Aurora Interactive v0.16 FINAL physical smoke candidate is installed and launched.
model=$MODEL
android_sha=$EXPECTED_ANDROID_SHA
host_sha=$EXPECTED_HOST_SHA
packaging_run=$PACKAGING_RUN_ID
artifact_id=$ARTIFACT_ID
apk_sha256=$installed_sha
gateway_origin=$EXPECTED_GATEWAY_ORIGIN
bootstrap_origin=$EXPECTED_BOOTSTRAP_ORIGIN
transport_scope=$EXPECTED_TRANSPORT_SCOPE
evidence_dir=$EVIDENCE_DIR

Next physical observation: use the visible onboarding flow. This tooling does not grant authority, prove execution success, close DP5, or unblock W16.
EOF
