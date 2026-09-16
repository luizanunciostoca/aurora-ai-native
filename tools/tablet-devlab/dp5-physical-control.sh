#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora DP5 physical control failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
command -v adb >/dev/null 2>&1 || fail "adb is missing"

PACKAGE_ID="ai.aurora.device.local"
ACTION="ai.aurora.device.DP5_PHYSICAL_ACCEPTANCE_CONTROL"
OPERATION="${1:-}"
ARGUMENT="${2:-}"

case "$OPERATION" in
  SESSION_REVOKE|SESSION_ROTATE|CAPABILITY_CURRENT|OFFLINE_DRAIN|OFFLINE_SNAPSHOT) ;;
  CAPABILITY_STALE) [[ "$ARGUMENT" =~ ^[A-Za-z0-9._:-]{1,128}$ ]] || fail "bounded capabilityId required" ;;
  OFFLINE_PREPARE) [[ "$ARGUMENT" =~ ^cmd_[0-9A-HJKMNP-TV-Z]{26}$ ]] || fail "canonical commandId required" ;;
  *) fail "unsupported physical control operation" ;;
esac

mapfile -t DEVICES < <(adb devices | awk 'NR>1 && $2=="device" {print $1}')
[[ "${#DEVICES[@]}" -eq 1 ]] || fail "exactly one authorized self-ADB device is required"
SERIAL="${DEVICES[0]}"
QEMU="$(adb -s "$SERIAL" shell getprop ro.kernel.qemu | tr -d '\r\n')"
[[ "$QEMU" != "1" && "$SERIAL" != emulator-* ]] || fail "physical tablet required"
ARGS=(shell am broadcast -a "$ACTION" -p "$PACKAGE_ID" --es operation "$OPERATION")
case "$OPERATION" in
  CAPABILITY_STALE) ARGS+=(--es capabilityId "$ARGUMENT") ;;
  OFFLINE_PREPARE) ARGS+=(--es commandId "$ARGUMENT") ;;
esac

OUTPUT="$(adb -s "$SERIAL" "${ARGS[@]}" 2>&1)" || fail "acceptance receiver invocation failed"
RESULT="$(printf '%s\n' "$OUTPUT" | sed -n 's/.*data="\([^"]*\)".*/\1/p' | tail -n 1)"
[[ -n "$RESULT" ]] || fail "acceptance receiver returned no bounded result"
[[ "$RESULT" =~ ^[A-Z0-9_]+$ ]] || fail "acceptance receiver returned malformed result"
[[ "$RESULT" == *_PASS ]] || fail "physical control rejected: $RESULT"

printf 'DP5_PHYSICAL_CONTROL=%s\n' "$RESULT"
printf 'authorizes_execution=false\n'
printf 'proves_execution_success=false\n'
printf 'retry_authorized=false\n'
printf 'physical_acceptance=false\n'
