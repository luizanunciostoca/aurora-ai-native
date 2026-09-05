#!/usr/bin/env bash
set -euo pipefail

ADB_BIN="${ADB_BIN:-adb}"
MODE="${AURORA_EVIDENCE_MODE:-preflight}"
OUTPUT_DIR="${AURORA_EVIDENCE_DIR:-}"
DEVICE_GATEWAY_PORT="${AURORA_DEVICE_GATEWAY_PORT:-8080}"
BOOTSTRAP_PORT="${AURORA_BOOTSTRAP_PORT:-8081}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COLLECTOR="$SCRIPT_DIR/collect-w15j-physical-evidence.sh"
SERIAL=""
BOOTSTRAP_MAPPING_OWNED=0
COMPLETED=0

fail() {
  printf 'W15-J dual-port physical window failed: %s\n' "$*" >&2
  exit 2
}

cleanup_on_exit() {
  local status=$?
  trap - EXIT
  if [[ "$COMPLETED" != "1" && "$BOOTSTRAP_MAPPING_OWNED" == "1" && -n "$SERIAL" ]]; then
    "$ADB_BIN" -s "$SERIAL" reverse --remove "tcp:$BOOTSTRAP_PORT" >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap cleanup_on_exit EXIT

[[ "$MODE" == "preflight" || "$MODE" == "finalize" ]] || fail "AURORA_EVIDENCE_MODE must be preflight or finalize"
[[ -n "$OUTPUT_DIR" ]] || fail "AURORA_EVIDENCE_DIR is required for the dual-port governed window"
[[ "$DEVICE_GATEWAY_PORT" =~ ^[0-9]+$ ]] || fail "AURORA_DEVICE_GATEWAY_PORT must be numeric"
[[ "$BOOTSTRAP_PORT" =~ ^[0-9]+$ ]] || fail "AURORA_BOOTSTRAP_PORT must be numeric"
(( DEVICE_GATEWAY_PORT >= 1 && DEVICE_GATEWAY_PORT <= 65535 )) || fail "device gateway port is out of range"
(( BOOTSTRAP_PORT >= 1 && BOOTSTRAP_PORT <= 65535 )) || fail "bootstrap port is out of range"
[[ "$DEVICE_GATEWAY_PORT" != "$BOOTSTRAP_PORT" ]] || fail "device gateway and bootstrap ports must be distinct"
[[ -x "$COLLECTOR" ]] || fail "canonical W15-J collector is not executable: $COLLECTOR"
command -v "$ADB_BIN" >/dev/null 2>&1 || fail "adb is not installed or not on PATH"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is required"

mapfile -t DEVICES < <("$ADB_BIN" devices | awk 'NR > 1 && $2 == "device" {print $1}')
[[ "${#DEVICES[@]}" -eq 1 ]] || fail "exactly one authorized Android device is required; found ${#DEVICES[@]}"
SERIAL="${DEVICES[0]}"

mapping_present() {
  local port="$1"
  local file="$2"
  grep -q "tcp:$port tcp:$port" "$file"
}

rewrite_manifest() {
  local target="$1"
  (
    cd "$OUTPUT_DIR"
    : >"$target"
    while IFS= read -r -d '' file; do
      local_file="${file#./}"
      [[ "$local_file" == "$target" ]] && continue
      sha256sum "$local_file" >>"$target"
    done < <(find . -maxdepth 1 -type f -print0 | sort -z)
  )
}

if [[ "$MODE" == "preflight" ]]; then
  "$ADB_BIN" -s "$SERIAL" reverse "tcp:$BOOTSTRAP_PORT" "tcp:$BOOTSTRAP_PORT"
  BOOTSTRAP_MAPPING_OWNED=1

  AURORA_GATEWAY_PORT="$DEVICE_GATEWAY_PORT" \
    AURORA_CONFIGURE_ADB_REVERSE=1 \
    "$COLLECTOR"

  "$ADB_BIN" -s "$SERIAL" reverse --list >"$OUTPUT_DIR/adb-reverse-dual-port-preflight.txt"
  mapping_present "$DEVICE_GATEWAY_PORT" "$OUTPUT_DIR/adb-reverse-dual-port-preflight.txt" || \
    fail "authenticated device-plane reverse mapping is missing after preflight"
  mapping_present "$BOOTSTRAP_PORT" "$OUTPUT_DIR/adb-reverse-dual-port-preflight.txt" || \
    fail "bootstrap reverse mapping is missing after preflight"

  cat >"$OUTPUT_DIR/dual-port-metadata.txt" <<EOF_PORTS
device_gateway_port=$DEVICE_GATEWAY_PORT
bootstrap_port=$BOOTSTRAP_PORT
transport_scope=LOCAL_ADB_REVERSE_ONLY
EOF_PORTS
  rewrite_manifest evidence-manifest-preflight.sha256
  COMPLETED=1
  printf 'W15-J dual-port preflight ready in %s; both reverse mappings remain active for the governed physical window.\n' "$OUTPUT_DIR"
else
  [[ -d "$OUTPUT_DIR" ]] || fail "finalize requires an existing evidence directory"
  "$ADB_BIN" -s "$SERIAL" reverse --list >"$OUTPUT_DIR/adb-reverse-dual-port-before-finalize.txt"
  mapping_present "$DEVICE_GATEWAY_PORT" "$OUTPUT_DIR/adb-reverse-dual-port-before-finalize.txt" || \
    fail "authenticated device-plane reverse mapping is missing before finalize"
  mapping_present "$BOOTSTRAP_PORT" "$OUTPUT_DIR/adb-reverse-dual-port-before-finalize.txt" || \
    fail "bootstrap reverse mapping is missing before finalize"
  BOOTSTRAP_MAPPING_OWNED=1

  AURORA_GATEWAY_PORT="$DEVICE_GATEWAY_PORT" \
    AURORA_CONFIGURE_ADB_REVERSE=0 \
    "$COLLECTOR"

  "$ADB_BIN" -s "$SERIAL" reverse --remove "tcp:$BOOTSTRAP_PORT"
  BOOTSTRAP_MAPPING_OWNED=0
  "$ADB_BIN" -s "$SERIAL" reverse --list >"$OUTPUT_DIR/adb-reverse-dual-port-after-finalize.txt"
  if mapping_present "$DEVICE_GATEWAY_PORT" "$OUTPUT_DIR/adb-reverse-dual-port-after-finalize.txt"; then
    fail "authenticated device-plane reverse mapping still exists after finalize"
  fi
  if mapping_present "$BOOTSTRAP_PORT" "$OUTPUT_DIR/adb-reverse-dual-port-after-finalize.txt"; then
    fail "bootstrap reverse mapping still exists after finalize"
  fi

  cat >>"$OUTPUT_DIR/finalize-metadata.txt" <<EOF_PORTS
device_gateway_port=$DEVICE_GATEWAY_PORT
bootstrap_port=$BOOTSTRAP_PORT
dual_port_cleanup=REMOVED
EOF_PORTS
  rewrite_manifest evidence-manifest.sha256
  COMPLETED=1
  printf 'W15-J dual-port physical window finalized; both ADB reverse mappings are removed. DP5 remains evidence-gated.\n'
fi
