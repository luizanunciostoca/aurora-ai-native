#!/usr/bin/env bash
set -euo pipefail

PHASE="preflight"
APK=""
EXPECTED_HEAD=""
OUT=""
PACKAGE="ai.aurora.device.local"

usage() {
  cat <<'EOF'
Usage:
  collect-wake-physical-evidence.sh --phase preflight --apk <apk> --expected-head <sha> --out <dir> [--package <id>]
  collect-wake-physical-evidence.sh --phase snapshot --out <dir> [--package <id>]
  collect-wake-physical-evidence.sh --phase finalize --out <dir> [--package <id>]

The collector never records microphone audio and never marks a scenario PASS.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase) PHASE="${2:?missing phase}"; shift 2 ;;
    --apk) APK="${2:?missing apk}"; shift 2 ;;
    --expected-head) EXPECTED_HEAD="${2:?missing expected head}"; shift 2 ;;
    --out) OUT="${2:?missing output directory}"; shift 2 ;;
    --package) PACKAGE="${2:?missing package}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$PHASE" in
  preflight|snapshot|finalize) ;;
  *) echo "Invalid --phase: $PHASE" >&2; exit 2 ;;
esac

[[ -n "$OUT" ]] || { echo "--out is required" >&2; exit 2; }
command -v adb >/dev/null || { echo "adb is required" >&2; exit 2; }
command -v sha256sum >/dev/null || { echo "sha256sum is required" >&2; exit 2; }
command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 2; }

mapfile -t DEVICES < <(adb devices | awk 'NR>1 && $2=="device" {print $1}')
[[ ${#DEVICES[@]} -eq 1 ]] || {
  echo "Exactly one authorized physical ADB device is required; found ${#DEVICES[@]}." >&2
  exit 3
}
SERIAL="${DEVICES[0]}"
ADB=(adb -s "$SERIAL")

qemu="$("${ADB[@]}" shell getprop ro.kernel.qemu 2>/dev/null | tr -d '\r')"
hardware="$("${ADB[@]}" shell getprop ro.hardware 2>/dev/null | tr -d '\r')"
product="$("${ADB[@]}" shell getprop ro.product.name 2>/dev/null | tr -d '\r')"
if [[ "$qemu" == "1" || "$hardware" =~ (goldfish|ranchu|qemu) || "$product" =~ (sdk|emulator) ]]; then
  echo "Emulators are rejected for wake physical evidence." >&2
  exit 4
fi

mkdir -p "$OUT"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/WAKE_EVIDENCE_TEMPLATE.json"
EVIDENCE="$OUT/WAKE_EVIDENCE.json"

capture() {
  local name="$1"; shift
  {
    printf '# captured_utc=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    printf '# command=adb shell'
    printf ' %q' "$@"
    printf '\n'
    "${ADB[@]}" shell "$@" 2>&1 || true
  } > "$OUT/${PHASE}-${name}.txt"
}

read_pref() {
  local file="$1"
  local key="$2"
  "${ADB[@]}" shell run-as "$PACKAGE" cat "shared_prefs/$file.xml" 2>/dev/null \
    | tr -d '\r' \
    | PREF_KEY="$key" python3 -c '
import os, sys, xml.etree.ElementTree as ET
try:
    root = ET.fromstring(sys.stdin.read())
    key = os.environ["PREF_KEY"]
    for node in root:
        if node.attrib.get("name") == key:
            value = node.attrib.get("value")
            if value is None:
                value = node.text or ""
            print(value)
            break
except Exception:
    pass
' || true
}

if [[ "$PHASE" == "preflight" ]]; then
  [[ -n "$APK" && -f "$APK" ]] || { echo "preflight requires --apk pointing to a file" >&2; exit 2; }
  [[ "$EXPECTED_HEAD" =~ ^[0-9a-f]{40}$ ]] || { echo "preflight requires a full 40-char --expected-head" >&2; exit 2; }
  [[ -f "$TEMPLATE" ]] || { echo "Missing template: $TEMPLATE" >&2; exit 2; }

  if command -v git >/dev/null && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    CHECKOUT_HEAD="$(git rev-parse HEAD)"
    [[ "$CHECKOUT_HEAD" == "$EXPECTED_HEAD" ]] || {
      echo "Checkout HEAD $CHECKOUT_HEAD does not match expected $EXPECTED_HEAD" >&2
      exit 5
    }
  fi

  APK_SHA="$(sha256sum "$APK" | awk '{print $1}')"
  printf '%s  %s\n' "$APK_SHA" "$(basename "$APK")" > "$OUT/APK_SHA256.txt"
  printf '%s\n' "$EXPECTED_HEAD" > "$OUT/GIT_HEAD.txt"
  "${ADB[@]}" install -r "$APK" > "$OUT/install.txt"

  PACKAGE_DUMP="$("${ADB[@]}" shell dumpsys package "$PACKAGE" 2>/dev/null || true)"
  [[ -n "$PACKAGE_DUMP" ]] || { echo "Installed package $PACKAGE not found" >&2; exit 6; }
  VERSION_NAME="$(printf '%s\n' "$PACKAGE_DUMP" | sed -n 's/^[[:space:]]*versionName=//p' | head -n1 | tr -d '\r')"
  VERSION_CODE="$(printf '%s\n' "$PACKAGE_DUMP" | sed -n 's/^[[:space:]]*versionCode=\([0-9][0-9]*\).*/\1/p' | head -n1)"
  MIC_PERMISSION="$(printf '%s\n' "$PACKAGE_DUMP" | grep -A1 -F 'android.permission.RECORD_AUDIO' | head -n2 | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' || true)"
  ANDROID_VERSION="$("${ADB[@]}" shell getprop ro.build.version.release | tr -d '\r')"
  SDK_INT="$("${ADB[@]}" shell getprop ro.build.version.sdk | tr -d '\r')"
  MANUFACTURER="$("${ADB[@]}" shell getprop ro.product.manufacturer | tr -d '\r')"
  MODEL="$("${ADB[@]}" shell getprop ro.product.model | tr -d '\r')"
  FINGERPRINT="$("${ADB[@]}" shell getprop ro.build.fingerprint | tr -d '\r')"
  SERIAL_HASH="$(printf '%s' "$SERIAL" | sha256sum | awk '{print $1}')"
  ASSISTANT_HOLDER="$("${ADB[@]}" shell cmd role get-role-holders android.app.role.ASSISTANT 2>/dev/null | tr -d '\r' | paste -sd ',' - || true)"
  WAKE_STATE="$(read_pref 'aurora.wake.runtime.v1' 'state')"
  WAKE_ENGINE="$(read_pref 'aurora.wake.runtime.v1' 'engine')"
  WAKE_MODEL="$(read_pref 'aurora.wake.runtime.v1' 'model_version')"
  WAKE_SENSITIVITY="$(read_pref 'aurora.ui.v1' 'wake_sensitivity')"
  PRIVACY_MODE="$(read_pref 'aurora.ui.v1' 'privacy_mode')"
  BATTERY_EXEMPT="$("${ADB[@]}" shell dumpsys deviceidle whitelist 2>/dev/null | grep -F "$PACKAGE" >/dev/null && echo true || echo false)"
  CAPTURED_AT="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

  cp "$TEMPLATE" "$EVIDENCE"
  EXPECTED_HEAD="$EXPECTED_HEAD" APK_SHA="$APK_SHA" PACKAGE="$PACKAGE" VERSION_NAME="$VERSION_NAME" \
  VERSION_CODE="$VERSION_CODE" ANDROID_VERSION="$ANDROID_VERSION" SDK_INT="$SDK_INT" MANUFACTURER="$MANUFACTURER" \
  MODEL="$MODEL" SERIAL_HASH="$SERIAL_HASH" FINGERPRINT="$FINGERPRINT" ASSISTANT_HOLDER="$ASSISTANT_HOLDER" \
  MIC_PERMISSION="$MIC_PERMISSION" WAKE_STATE="$WAKE_STATE" WAKE_ENGINE="$WAKE_ENGINE" WAKE_MODEL="$WAKE_MODEL" \
  WAKE_SENSITIVITY="$WAKE_SENSITIVITY" PRIVACY_MODE="$PRIVACY_MODE" BATTERY_EXEMPT="$BATTERY_EXEMPT" \
  CAPTURED_AT="$CAPTURED_AT" EVIDENCE="$EVIDENCE" python3 - <<'PY'
import json, os
path = os.environ["EVIDENCE"]
with open(path, "r", encoding="utf-8") as fh:
    data = json.load(fh)
i = data["identity"]
i.update({
    "gitHead": os.environ["EXPECTED_HEAD"],
    "apkSha256": os.environ["APK_SHA"],
    "packageName": os.environ["PACKAGE"],
    "versionName": os.environ["VERSION_NAME"] or None,
    "versionCode": os.environ["VERSION_CODE"] or None,
    "androidVersion": os.environ["ANDROID_VERSION"] or None,
    "sdkInt": os.environ["SDK_INT"] or None,
    "deviceManufacturer": os.environ["MANUFACTURER"] or None,
    "deviceModel": os.environ["MODEL"] or None,
    "deviceSerialHash": os.environ["SERIAL_HASH"],
    "buildFingerprint": os.environ["FINGERPRINT"] or None,
    "assistantRoleHolder": os.environ["ASSISTANT_HOLDER"] or None,
    "microphonePermission": os.environ["MIC_PERMISSION"] or None,
    "wakeRuntimeState": os.environ["WAKE_STATE"] or None,
    "wakeEngine": os.environ["WAKE_ENGINE"] or None,
    "wakeModelVersion": os.environ["WAKE_MODEL"] or None,
    "wakeSensitivity": os.environ["WAKE_SENSITIVITY"] or None,
    "privacyMode": os.environ["PRIVACY_MODE"] or None,
    "batteryOptimizationExempt": os.environ["BATTERY_EXEMPT"] == "true",
    "capturedAtUtc": os.environ["CAPTURED_AT"],
})
with open(path, "w", encoding="utf-8") as fh:
    json.dump(data, fh, indent=2, ensure_ascii=False)
    fh.write("\n")
PY
fi

[[ -f "$EVIDENCE" ]] || { echo "Evidence file missing: run preflight first" >&2; exit 7; }

capture "getprop" getprop
capture "package" dumpsys package "$PACKAGE"
capture "activity-services" dumpsys activity services "$PACKAGE"
capture "meminfo" dumpsys meminfo "$PACKAGE"
capture "battery" dumpsys battery
capture "power" dumpsys power
capture "deviceidle" dumpsys deviceidle
capture "thermal" dumpsys thermalservice
capture "audio" dumpsys audio
capture "media-audio-flinger" dumpsys media.audio_flinger
capture "appops" cmd appops get "$PACKAGE" RECORD_AUDIO
capture "role-assistant" cmd role get-role-holders android.app.role.ASSISTANT

{
  printf 'phase=%s\n' "$PHASE"
  printf 'captured_utc=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  printf 'package=%s\n' "$PACKAGE"
  printf 'device_serial_sha256=%s\n' "$(printf '%s' "$SERIAL" | sha256sum | awk '{print $1}')"
  printf 'wake_state=%s\n' "$(read_pref 'aurora.wake.runtime.v1' 'state')"
  printf 'wake_engine=%s\n' "$(read_pref 'aurora.wake.runtime.v1' 'engine')"
  printf 'wake_model_version=%s\n' "$(read_pref 'aurora.wake.runtime.v1' 'model_version')"
  printf 'confirmed_wakes=%s\n' "$(read_pref 'aurora.wake.runtime.v1' 'confirmed')"
  printf 'rejected_or_ignored=%s\n' "$(read_pref 'aurora.wake.runtime.v1' 'rejected')"
  printf 'wake_sensitivity=%s\n' "$(read_pref 'aurora.ui.v1' 'wake_sensitivity')"
  printf 'privacy_mode=%s\n' "$(read_pref 'aurora.ui.v1' 'privacy_mode')"
} > "$OUT/${PHASE}-wake-runtime.txt"

CHECKSUM_TMP="$OUT/.${PHASE}-SHA256SUMS.tmp"
find "$OUT" -maxdepth 1 -type f \
  ! -name '*-SHA256SUMS.txt' \
  ! -name '.*-SHA256SUMS.tmp' \
  -print0 \
  | sort -z \
  | xargs -0 sha256sum > "$CHECKSUM_TMP"
mv "$CHECKSUM_TMP" "$OUT/${PHASE}-SHA256SUMS.txt"

if [[ "$PHASE" == "finalize" ]]; then
  python3 - "$EVIDENCE" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as fh:
    data = json.load(fh)
assert data.get("finalDecision") == "NOT_EVALUATED", "collector must not overwrite reviewer decision"
assert all(s.get("status") in {"NOT_RUN", "PASS", "FAIL", "BLOCKED", "NOT_APPLICABLE"} for s in data.get("scenarios", []))
print("Evidence schema parse OK; physical scenario decisions remain operator/reviewer-owned.")
PY
fi

cat <<EOF
Wake physical evidence snapshot captured.
phase=$PHASE
out=$OUT
No microphone recording was performed.
No scenario status was auto-promoted to PASS.
EOF
