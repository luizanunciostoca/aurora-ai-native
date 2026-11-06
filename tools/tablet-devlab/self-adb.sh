#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora self-ADB failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
command -v adb >/dev/null 2>&1 || fail "adb is missing; run bootstrap-termux.sh first"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is missing"

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
STATE_DIR="$DEVLAB_ROOT/state"
ENDPOINT_FILE="$STATE_DIR/self-adb-endpoint.txt"
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

connected_devices() {
  adb devices | awk 'NR > 1 && $2 == "device" {print $1}'
}

require_one_device() {
  mapfile -t devices < <(connected_devices)
  [[ "${#devices[@]}" -eq 1 ]] || fail "exactly one self-ADB device must be connected; found ${#devices[@]}"
  printf '%s' "${devices[0]}"
}

cmd="${1:-status}"
case "$cmd" in
  discover)
    printf '%s\n' 'Android Wireless Debugging discovery:'
    adb mdns services || true
    cat <<'EOF'

If discovery is empty, open:
  Settings > Developer options > Wireless debugging

For pairing, tap "Pair device with pairing code" and use the temporary IP:pairing-port.
For normal connection, use the IP:port shown on the main Wireless debugging screen.
On a tablet, split-screen Settings + Termux is convenient.
EOF
    ;;
  pair)
    endpoint="${2:-}"
    [[ "$endpoint" =~ ^[^[:space:]]+:[0-9]+$ ]] || fail "usage: self-adb.sh pair <ip:pairing-port>"
    printf 'Android will ask for the 6-digit pairing code.\n'
    adb pair "$endpoint"
    ;;
  connect)
    endpoint="${2:-}"
    [[ "$endpoint" =~ ^[^[:space:]]+:[0-9]+$ ]] || fail "usage: self-adb.sh connect <ip:debug-port>"
    adb connect "$endpoint"
    printf '%s\n' "$endpoint" >"$ENDPOINT_FILE"
    chmod 600 "$ENDPOINT_FILE"
    "$0" status
    ;;
  reconnect)
    [[ -f "$ENDPOINT_FILE" ]] || fail "no saved debug endpoint; run connect <ip:debug-port> first"
    endpoint="$(tr -d '\r\n' <"$ENDPOINT_FILE")"
    adb connect "$endpoint" || true
    "$0" status
    ;;
  status)
    serial="$(require_one_device)"
    serial_sha="$(printf '%s' "$serial" | sha256sum | awk '{print $1}')"
    qemu="$(adb -s "$serial" shell getprop ro.kernel.qemu | tr -d '\r\n')"
    [[ "$qemu" != "1" && "$serial" != emulator-* ]] || fail "emulator detected; physical tablet required"
    manufacturer="$(adb -s "$serial" shell getprop ro.product.manufacturer | tr -d '\r\n')"
    model="$(adb -s "$serial" shell getprop ro.product.model | tr -d '\r\n')"
    product="$(adb -s "$serial" shell getprop ro.product.name | tr -d '\r\n')"
    api="$(adb -s "$serial" shell getprop ro.build.version.sdk | tr -d '\r\n')"
    fingerprint="$(adb -s "$serial" shell getprop ro.build.fingerprint | tr -d '\r\n')"
    cat <<EOF
self_adb=CONNECTED
serial_sha256=$serial_sha
manufacturer=$manufacturer
model=$model
product=$product
api_level=$api
build_fingerprint=$fingerprint
physical_device_verified=true
EOF
    ;;
  shell)
    shift
    serial="$(require_one_device)"
    adb -s "$serial" shell "$@"
    ;;
  disconnect)
    if [[ -f "$ENDPOINT_FILE" ]]; then
      endpoint="$(tr -d '\r\n' <"$ENDPOINT_FILE")"
      adb disconnect "$endpoint" || true
    else
      adb disconnect || true
    fi
    ;;
  *)
    fail "usage: self-adb.sh {discover|pair <endpoint>|connect <endpoint>|reconnect|status|shell ...|disconnect}"
    ;;
esac
