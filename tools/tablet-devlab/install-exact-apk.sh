#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora exact APK install failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in adb sha256sum cmp date; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"; done

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
PACKAGE_ID="${AURORA_PACKAGE_ID:-ai.aurora.device.local}"
ARTIFACT_DIR="$DEVLAB_ROOT/artifacts"
APK="$ARTIFACT_DIR/Aurora-W15J-Physical-localDebug.apk"
BUILD_IDENTITY="$ARTIFACT_DIR/BUILD_IDENTITY.txt"
EXPECTED_APK_SHA="${AURORA_APK_SHA256:-a0f8ed0b3e5d461592873a522a75a42fd7c079bad2a78dfd2d9968c1763af7e6}"
EXPECTED_ANDROID_SHA="${AURORA_ANDROID_SHA:-6d44480eae9b99467b20df44290b5c9b17626c3e}"
EXPECTED_HOST_SHA="${AURORA_HOST_SHA:-294e8754a568838ade40f1907546339385d7e599}"
EXPECTED_MAIN_SHA="${AURORA_MAIN_SHA:-d2089407e88480686b879928cf2863c0dc81718e}"
EXPECTED_TRANSPORT_SCOPE="LOCAL_TABLET_LOOPBACK"
EVIDENCE_ROOT="$DEVLAB_ROOT/evidence"
STATE_DIR="$DEVLAB_ROOT/state"

[[ -f "$APK" && ! -L "$APK" ]] || fail "exact APK is missing; run fetch-current-artifact.sh first"
[[ -f "$BUILD_IDENTITY" && ! -L "$BUILD_IDENTITY" ]] || fail "BUILD_IDENTITY is missing"
[[ "$EXPECTED_APK_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "expected APK SHA must be lowercase 64-hex"
[[ "$(sha256sum "$APK" | awk '{print $1}')" == "$EXPECTED_APK_SHA" ]] || fail "artifact APK hash drift"
[[ "$(wc -l < "$BUILD_IDENTITY" | tr -d ' ')" == "19" ]] || fail "BUILD_IDENTITY must contain exactly 19 lines"

embedded_android="$(sed -n 's/^source_candidate_sha=//p' "$BUILD_IDENTITY")"
embedded_host="$(sed -n 's/^paired_local_host_candidate_sha=//p' "$BUILD_IDENTITY")"
embedded_main="$(sed -n 's/^reconciled_main_parent_sha=//p' "$BUILD_IDENTITY")"
embedded_scope="$(sed -n 's/^gateway_transport_scope=//p' "$BUILD_IDENTITY")"
[[ "$embedded_android" == "$EXPECTED_ANDROID_SHA" ]] || fail "embedded Android SHA drift"
[[ "$embedded_host" == "$EXPECTED_HOST_SHA" ]] || fail "embedded host SHA drift"
[[ "$embedded_main" == "$EXPECTED_MAIN_SHA" ]] || fail "embedded main SHA drift"
[[ "$embedded_scope" == "$EXPECTED_TRANSPORT_SCOPE" ]] || fail "embedded transport scope must be LOCAL_TABLET_LOOPBACK"
grep -Fxq 'canonical_acceptance=false' "$BUILD_IDENTITY" || fail "artifact cannot self-declare acceptance"
grep -Fxq 'physical_evidence_required=true' "$BUILD_IDENTITY" || fail "physical evidence requirement missing"
grep -Fxq 'dp5_status=INCOMPLETE' "$BUILD_IDENTITY" || fail "artifact must remain DP5 incomplete before physical evidence"

mapfile -t DEVICES < <(adb devices | awk 'NR > 1 && $2 == "device" {print $1}')
[[ "${#DEVICES[@]}" -eq 1 ]] || fail "exactly one self-ADB device required; found ${#DEVICES[@]}"
SERIAL="${DEVICES[0]}"
ADB=(adb -s "$SERIAL")
QEMU="$("${ADB[@]}" shell getprop ro.kernel.qemu | tr -d '\r\n')"
[[ "$QEMU" != "1" && "$SERIAL" != emulator-* ]] || fail "emulator detected"

SERIAL_SHA="$(printf '%s' "$SERIAL" | sha256sum | awk '{print $1}')"
MANUFACTURER="$("${ADB[@]}" shell getprop ro.product.manufacturer | tr -d '\r\n')"
MODEL="$("${ADB[@]}" shell getprop ro.product.model | tr -d '\r\n')"
PRODUCT="$("${ADB[@]}" shell getprop ro.product.name | tr -d '\r\n')"
API="$("${ADB[@]}" shell getprop ro.build.version.sdk | tr -d '\r\n')"
FINGERPRINT="$("${ADB[@]}" shell getprop ro.build.fingerprint | tr -d '\r\n')"

WINDOW="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="$EVIDENCE_ROOT/exact-apk-install-$WINDOW"
mkdir -p "$EVIDENCE_DIR" "$STATE_DIR"
chmod 700 "$EVIDENCE_DIR" "$STATE_DIR"

mapfile -t PRE_PATHS < <("${ADB[@]}" shell pm path "$PACKAGE_ID" 2>/dev/null | tr -d '\r' | sed -n 's/^package://p')
[[ "${#PRE_PATHS[@]}" -le 1 ]] || fail "installed package is split/non-canonical; found ${#PRE_PATHS[@]} paths"

prior_present=false
prior_sha="NOT_INSTALLED"
prior_exact=false
clean_install=false

if [[ "${#PRE_PATHS[@]}" -eq 1 ]]; then
  prior_present=true
  PRIOR_PATH="${PRE_PATHS[0]}"
  [[ "$PRIOR_PATH" == */base.apk ]] || fail "installed package is split/non-canonical: $PRIOR_PATH"
  PRIOR_APK="$EVIDENCE_DIR/installed-base-before.apk"
  "${ADB[@]}" pull "$PRIOR_PATH" "$PRIOR_APK" >"$EVIDENCE_DIR/pull-before.txt" 2>&1 || fail "installed APK readback failed before any mutation"
  prior_sha="$(sha256sum "$PRIOR_APK" | awk '{print $1}')"
  printf '%s\n' "$prior_sha" >"$EVIDENCE_DIR/installed-base-before.sha256"

  if [[ "$prior_sha" == "$EXPECTED_APK_SHA" ]] && cmp -s "$APK" "$PRIOR_APK"; then
    prior_exact=true
  fi
fi

if [[ "$prior_exact" == "true" ]]; then
  installed_sha="$prior_sha"
  disposition="EXACT_APK_ALREADY_INSTALLED_READY_NOT_ACCEPTED"
else
  if [[ "$prior_present" == "true" ]]; then
    if [[ "${AURORA_ALLOW_CLEAN_INSTALL:-NO}" != "YES" ]]; then
      cat >&2 <<EOF
A different Aurora APK is installed on the tablet.
prior_apk_sha256=$prior_sha
required_apk_sha256=$EXPECTED_APK_SHA

Replacing it requires a clean uninstall because the exact DP5 artifact uses a different CI debug signing identity.
A clean uninstall removes Aurora's local application data.

No mutation was performed.
To explicitly authorize replacement, run:
  AURORA_ALLOW_CLEAN_INSTALL=YES bash tools/tablet-devlab/install-exact-apk.sh
EOF
      exit 3
    fi

    clean_install=true
    "${ADB[@]}" shell dumpsys package "$PACKAGE_ID" >"$EVIDENCE_DIR/package-before-uninstall.txt" 2>&1 || true
    uninstall_output="$("${ADB[@]}" uninstall "$PACKAGE_ID" 2>&1)" || fail "clean uninstall failed"
    printf '%s\n' "$uninstall_output" >"$EVIDENCE_DIR/uninstall.txt"
    grep -Fxq 'Success' "$EVIDENCE_DIR/uninstall.txt" || fail "clean uninstall did not report Success"

    mapfile -t AFTER_UNINSTALL_PATHS < <("${ADB[@]}" shell pm path "$PACKAGE_ID" 2>/dev/null | tr -d '\r' | sed -n 's/^package://p')
    [[ "${#AFTER_UNINSTALL_PATHS[@]}" -eq 0 ]] || fail "package still present after uninstall"
  fi

  install_output="$("${ADB[@]}" install "$APK" 2>&1)" || fail "exact APK install failed"
  printf '%s\n' "$install_output" >"$EVIDENCE_DIR/install.txt"
  grep -Fxq 'Success' "$EVIDENCE_DIR/install.txt" || fail "APK install did not report Success"

  mapfile -t POST_PATHS < <("${ADB[@]}" shell pm path "$PACKAGE_ID" | tr -d '\r' | sed -n 's/^package://p')
  [[ "${#POST_PATHS[@]}" -eq 1 ]] || fail "exactly one installed base APK required after install; found ${#POST_PATHS[@]} paths"
  POST_PATH="${POST_PATHS[0]}"
  [[ "$POST_PATH" == */base.apk ]] || fail "installed package is split/non-canonical after install: $POST_PATH"

  POST_APK="$EVIDENCE_DIR/installed-base-after.apk"
  "${ADB[@]}" pull "$POST_PATH" "$POST_APK" >"$EVIDENCE_DIR/pull-after.txt" 2>&1 || fail "installed APK readback failed after install"
  installed_sha="$(sha256sum "$POST_APK" | awk '{print $1}')"
  [[ "$installed_sha" == "$EXPECTED_APK_SHA" ]] || fail "installed APK SHA does not match exact artifact"
  cmp -s "$APK" "$POST_APK" || fail "installed APK differs byte-for-byte from exact artifact"
  disposition="EXACT_APK_INSTALLED_READY_NOT_ACCEPTED"
fi

cat >"$EVIDENCE_DIR/install-evidence.json" <<EOF
{
  "kind": "AURORA_W15J_EXACT_APK_INSTALL_EVIDENCE",
  "observedAtUtc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "disposition": "$disposition",
  "authorityInvariant": "INTELLIGENCE != AUTHORITY != EXECUTION",
  "packageId": "$PACKAGE_ID",
  "androidCandidateSha": "$embedded_android",
  "hostCandidateSha": "$embedded_host",
  "reconciledMainSha": "$embedded_main",
  "transportScope": "$embedded_scope",
  "expectedApkSha256": "$EXPECTED_APK_SHA",
  "installedApkSha256": "$installed_sha",
  "priorPackagePresent": $prior_present,
  "priorApkSha256": "$prior_sha",
  "priorExactArtifact": $prior_exact,
  "cleanInstallPerformed": $clean_install,
  "device": {
    "serialSha256": "$SERIAL_SHA",
    "manufacturer": "$MANUFACTURER",
    "model": "$MODEL",
    "product": "$PRODUCT",
    "apiLevel": "$API",
    "buildFingerprint": "$FINGERPRINT"
  },
  "authorizesExecution": false,
  "provesExecutionSuccess": false,
  "retryAuthorized": false
}
EOF

(
  cd "$EVIDENCE_DIR"
  sha256sum ./* >install-manifest.sha256.tmp
  grep -v 'install-manifest.sha256' install-manifest.sha256.tmp >install-manifest.sha256
  rm install-manifest.sha256.tmp
)
printf '%s\n' "$EVIDENCE_DIR" >"$STATE_DIR/last-exact-apk-install.txt"
chmod 600 "$STATE_DIR/last-exact-apk-install.txt"

cat <<EOF
Aurora exact APK state verified.
disposition=$disposition
installed_apk_sha256=$installed_sha
clean_install_performed=$clean_install
evidence_dir=$EVIDENCE_DIR
device_serial_sha256=$SERIAL_SHA

This proves exact installation state only. It does not close DP5 or grant execution authority.
EOF