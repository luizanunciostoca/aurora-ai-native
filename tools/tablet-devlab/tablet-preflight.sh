#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora tablet loopback preflight failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in adb curl jq sha256sum unzip cmp; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"; done

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
PACKAGE_ID="${AURORA_PACKAGE_ID:-ai.aurora.device.local}"
ARTIFACT_DIR="$DEVLAB_ROOT/artifacts"
APK="$ARTIFACT_DIR/Aurora-W15J-Physical-localDebug.apk"
BUILD_IDENTITY="$ARTIFACT_DIR/BUILD_IDENTITY.txt"
STATE_DIR="$DEVLAB_ROOT/state"
EVIDENCE_ROOT="$DEVLAB_ROOT/evidence"
READINESS_FILE="$STATE_DIR/last-readiness-termux.txt"
EXPECTED_APK_SHA="${AURORA_APK_SHA256:-371d23846475765d04b87d9ba6e923e8d34e24edb440fde3813237c36842cd14}"
EXPECTED_ANDROID_SHA="${AURORA_ANDROID_SHA:-e9bd9f0b7ac51844edc52214135992c305aa479e}"
EXPECTED_HOST_SHA="${AURORA_HOST_SHA:-3c7c3aa917c00d91d738121dee5fd32ed07b5444}"

[[ -f "$APK" && -f "$BUILD_IDENTITY" ]] || fail "artifact is missing; run fetch-current-artifact.sh"
[[ "$(sha256sum "$APK" | awk '{print $1}')" == "$EXPECTED_APK_SHA" ]] || fail "artifact APK hash drift"

mapfile -t DEVICES < <(adb devices | awk 'NR > 1 && $2 == "device" {print $1}')
[[ "${#DEVICES[@]}" -eq 1 ]] || fail "exactly one self-ADB device required; found ${#DEVICES[@]}"
SERIAL="${DEVICES[0]}"
ADB=(adb -s "$SERIAL")
QEMU="$("${ADB[@]}" shell getprop ro.kernel.qemu | tr -d '\r\n')"
[[ "$QEMU" != "1" && "$SERIAL" != emulator-* ]] || fail "emulator detected"

# Tablet-loopback transport must not be silently represented as adb reverse.
REVERSE_LIST="$("${ADB[@]}" reverse --list 2>/dev/null || true)"
if grep -Eq 'tcp:(8080|8081)[[:space:]]+tcp:(8080|8081)' <<<"$REVERSE_LIST"; then
  fail "8080/8081 adb reverse mapping exists; tablet loopback mode requires direct host listeners with no reverse"
fi

HOST_8080="$(curl --fail --silent --show-error --max-time 3 http://127.0.0.1:8080/v1/local-host/instance)"
HOST_8081="$(curl --fail --silent --show-error --max-time 3 http://127.0.0.1:8081/v1/local-host/instance)"
ID_8080="$(jq -er '.hostInstanceId' <<<"$HOST_8080")"
ID_8081="$(jq -er '.hostInstanceId' <<<"$HOST_8081")"
[[ "$ID_8080" == "$ID_8081" && "$ID_8080" =~ ^whi_[0-9a-f]{64}$ ]] || fail "host instance continuity mismatch"
[[ "$(jq -er '.listenerRole' <<<"$HOST_8080")" == "DEVICE_GATEWAY" ]] || fail "8080 listener role mismatch"
[[ "$(jq -er '.listenerRole' <<<"$HOST_8081")" == "BOOTSTRAP_EXCHANGE" ]] || fail "8081 listener role mismatch"
for body in "$HOST_8080" "$HOST_8081"; do
  [[ "$(jq -er '.authorizesExecution' <<<"$body")" == "false" ]] || fail "host instance route cannot authorize execution"
  [[ "$(jq -er '.provesExecutionSuccess' <<<"$body")" == "false" ]] || fail "host instance route cannot prove execution success"
  [[ "$(jq -er '.retryAuthorized' <<<"$body")" == "false" ]] || fail "host instance route cannot authorize retry"
done

[[ -f "$READINESS_FILE" ]] || fail "host readiness state missing; start host with run-host.sh"
READINESS_TERMUX="$(tr -d '\r\n' <"$READINESS_FILE")"
[[ -d "$READINESS_TERMUX" && ! -L "$READINESS_TERMUX" ]] || fail "readiness directory missing"
mapfile -t readiness_files < <(find "$READINESS_TERMUX" -mindepth 1 -maxdepth 1 -type f -printf '%f\n' | sort)
[[ "${#readiness_files[@]}" -eq 9 ]] || fail "host readiness directory must contain exactly nine files"

mapfile -t PM_PATHS < <("${ADB[@]}" shell pm path "$PACKAGE_ID" | tr -d '\r' | sed -n 's/^package://p')
[[ "${#PM_PATHS[@]}" -eq 1 ]] || fail "exactly one installed base APK is required; found ${#PM_PATHS[@]} paths"
INSTALLED_PATH="${PM_PATHS[0]}"
[[ "$INSTALLED_PATH" == */base.apk ]] || fail "installed package is split/non-canonical: $INSTALLED_PATH"

WINDOW="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="$EVIDENCE_ROOT/tablet-loopback-$WINDOW"
mkdir -p "$EVIDENCE_DIR"
chmod 700 "$EVIDENCE_DIR"
INSTALLED_APK="$EVIDENCE_DIR/installed-base.apk"
"${ADB[@]}" pull "$INSTALLED_PATH" "$INSTALLED_APK" >/dev/null
INSTALLED_SHA="$(sha256sum "$INSTALLED_APK" | awk '{print $1}')"
[[ "$INSTALLED_SHA" == "$EXPECTED_APK_SHA" ]] || fail "installed APK bytes do not match exact artifact"
cmp -s "$APK" "$INSTALLED_APK" || fail "installed APK differs byte-for-byte from artifact APK"

SERIAL_SHA="$(printf '%s' "$SERIAL" | sha256sum | awk '{print $1}')"
MANUFACTURER="$("${ADB[@]}" shell getprop ro.product.manufacturer | tr -d '\r\n')"
MODEL="$("${ADB[@]}" shell getprop ro.product.model | tr -d '\r\n')"
PRODUCT="$("${ADB[@]}" shell getprop ro.product.name | tr -d '\r\n')"
API="$("${ADB[@]}" shell getprop ro.build.version.sdk | tr -d '\r\n')"
FINGERPRINT="$("${ADB[@]}" shell getprop ro.build.fingerprint | tr -d '\r\n')"
ARTIFACT_SCOPE="$(sed -n 's/^gateway_transport_scope=//p' "$BUILD_IDENTITY")"
SOURCE_SHA="$(sed -n 's/^source_candidate_sha=//p' "$BUILD_IDENTITY")"
HOST_SHA="$(sed -n 's/^paired_local_host_candidate_sha=//p' "$BUILD_IDENTITY")"
[[ "$SOURCE_SHA" == "$EXPECTED_ANDROID_SHA" ]] || fail "embedded Android SHA drift"
[[ "$HOST_SHA" == "$EXPECTED_HOST_SHA" ]] || fail "embedded host SHA drift"

"${ADB[@]}" shell dumpsys meminfo "$PACKAGE_ID" >"$EVIDENCE_DIR/meminfo.txt"
"${ADB[@]}" shell dumpsys cpuinfo >"$EVIDENCE_DIR/cpuinfo.txt"
"${ADB[@]}" shell dumpsys battery >"$EVIDENCE_DIR/battery.txt"
"${ADB[@]}" shell dumpsys package "$PACKAGE_ID" >"$EVIDENCE_DIR/package.txt"
printf '%s\n' "$REVERSE_LIST" >"$EVIDENCE_DIR/adb-reverse-list.txt"
printf '%s\n' "$HOST_8080" >"$EVIDENCE_DIR/host-instance-8080.json"
printf '%s\n' "$HOST_8081" >"$EVIDENCE_DIR/host-instance-8081.json"

DISPOSITION="TABLET_LOOPBACK_TRANSPORT_CONTRACT_READY"
if [[ "$ARTIFACT_SCOPE" != "LOCAL_TABLET_LOOPBACK" ]]; then
  DISPOSITION="PRE_ACCEPTANCE_ONLY_TRANSPORT_CONTRACT_RECONCILIATION_REQUIRED"
fi

cat >"$EVIDENCE_DIR/tablet-loopback-preflight.json" <<EOF
{
  "kind": "AURORA_TABLET_ONLY_DEVLAB_PREFLIGHT",
  "observedAtUtc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "disposition": "$DISPOSITION",
  "authorityInvariant": "INTELLIGENCE != AUTHORITY != EXECUTION",
  "androidCandidateSha": "$SOURCE_SHA",
  "hostCandidateSha": "$HOST_SHA",
  "apkSha256": "$INSTALLED_SHA",
  "artifactTransportScope": "$ARTIFACT_SCOPE",
  "actualTransportScope": "LOCAL_TABLET_LOOPBACK",
  "selfAdbControlPlane": true,
  "adbReverse8080Or8081Present": false,
  "hostInstanceId": "$ID_8080",
  "device": {
    "serialSha256": "$SERIAL_SHA",
    "manufacturer": "$MANUFACTURER",
    "model": "$MODEL",
    "product": "$PRODUCT",
    "apiLevel": "$API",
    "buildFingerprint": "$FINGERPRINT",
    "physicalDeviceVerified": true
  },
  "authorizesExecution": false,
  "provesExecutionSuccess": false,
  "retryAuthorized": false
}
EOF

(
  cd "$EVIDENCE_DIR"
  sha256sum ./* >preflight-manifest.sha256.tmp
  grep -v 'preflight-manifest.sha256' preflight-manifest.sha256.tmp >preflight-manifest.sha256
  rm preflight-manifest.sha256.tmp
)
printf '%s\n' "$EVIDENCE_DIR" >"$STATE_DIR/last-tablet-preflight.txt"
chmod 600 "$STATE_DIR/last-tablet-preflight.txt"

cat <<EOF
Tablet-only preflight completed.
disposition=$DISPOSITION
evidence_dir=$EVIDENCE_DIR
installed_apk_sha256=$INSTALLED_SHA
host_instance_id=$ID_8080
artifact_transport_scope=$ARTIFACT_SCOPE
actual_transport_scope=LOCAL_TABLET_LOOPBACK

If disposition says TRANSPORT_CONTRACT_RECONCILIATION_REQUIRED, this evidence is useful for DevLab validation but cannot close DP5 yet.
EOF
