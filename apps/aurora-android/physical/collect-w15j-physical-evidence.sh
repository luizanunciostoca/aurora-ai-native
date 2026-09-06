#!/usr/bin/env bash
set -euo pipefail

ADB_BIN="${ADB_BIN:-adb}"
PACKAGE_ID="${AURORA_PACKAGE_ID:-ai.aurora.device.local}"
ACTIVITY_CLASS="${AURORA_ACTIVITY_CLASS:-ai.aurora.device.MainActivity}"
MODE="${AURORA_EVIDENCE_MODE:-preflight}"
OUTPUT_DIR="${AURORA_EVIDENCE_DIR:-w15j-physical-evidence-$(date -u +%Y%m%dT%H%M%SZ)}"
GATEWAY_PORT="${AURORA_GATEWAY_PORT:-8080}"
CONFIGURE_ADB_REVERSE="${AURORA_CONFIGURE_ADB_REVERSE:-1}"
CANDIDATE_SHA="${AURORA_CANDIDATE_SHA:-}"
APK_PATH="${AURORA_APK:-}"
APK_VARIANT="${AURORA_APK_VARIANT:-}"
OPERATOR="${AURORA_OPERATOR:-}"
REQUESTED_GATEWAY_IDENTITY="${AURORA_GATEWAY_IDENTITY:-}"
REQUESTED_GATEWAY_VERSION="${AURORA_GATEWAY_VERSION:-}"
ARTIFACT_ZIP="${AURORA_ARTIFACT_ZIP:-}"
ARTIFACT_METADATA="${AURORA_ARTIFACT_METADATA:-}"
HOST_READINESS_DIR="${AURORA_W15J_HOST_READINESS_DIR:-}"

REVERSE_CONFIGURED_BY_SCRIPT=0
COLLECTION_SUCCEEDED=0
SERIAL=""
ARTIFACT_TMP=""
declare -A ARTIFACT_META=()
declare -A BUILD_META=()
declare -A HOST_READY_META=()
declare -A HOST_PROBE_META=()

fail() {
  printf 'W15-J physical evidence collection failed: %s\n' "$*" >&2
  exit 2
}

safe_metadata_value() {
  local label="$1"
  local value="$2"
  [[ -n "$value" ]] || fail "$label is required"
  [[ "${#value}" -le 256 ]] || fail "$label exceeds 256 characters"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || fail "$label cannot contain newlines"
}

cleanup_on_exit() {
  local status=$?
  trap - EXIT
  if [[ "$COLLECTION_SUCCEEDED" != "1" && "$REVERSE_CONFIGURED_BY_SCRIPT" == "1" && -n "$SERIAL" ]]; then
    "$ADB_BIN" -s "$SERIAL" reverse --remove "tcp:$GATEWAY_PORT" >/dev/null 2>&1 || true
  fi
  if [[ -n "$ARTIFACT_TMP" && -d "$ARTIFACT_TMP" ]]; then
    rm -rf -- "$ARTIFACT_TMP"
  fi
  exit "$status"
}
trap cleanup_on_exit EXIT

read_key_value_file() {
  local path="$1"
  local target_name="$2"
  local -n target="$target_name"
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -n "$line" ]] || continue
    [[ "$line" == *=* ]] || fail "invalid metadata line in $path"
    key="${line%%=*}"
    value="${line#*=}"
    [[ "$key" =~ ^[A-Za-z0-9._-]+$ ]] || fail "invalid metadata key in $path"
    [[ -z "${target[$key]+present}" ]] || fail "duplicate metadata key $key in $path"
    safe_metadata_value "$path:$key" "$value"
    target["$key"]="$value"
  done <"$path"
}

require_metadata_key() {
  local target_name="$1"
  local key="$2"
  local -n target="$target_name"
  [[ -n "${target[$key]:-}" ]] || fail "$key is required in metadata"
  printf '%s' "${target[$key]}"
}

[[ "$MODE" == "preflight" || "$MODE" == "finalize" ]] || \
  fail "AURORA_EVIDENCE_MODE must be preflight or finalize"
[[ "$GATEWAY_PORT" =~ ^[0-9]+$ ]] || fail "AURORA_GATEWAY_PORT must be numeric"
(( GATEWAY_PORT >= 1 && GATEWAY_PORT <= 65535 )) || fail "AURORA_GATEWAY_PORT is out of range"
[[ "$CONFIGURE_ADB_REVERSE" == "0" || "$CONFIGURE_ADB_REVERSE" == "1" ]] || \
  fail "AURORA_CONFIGURE_ADB_REVERSE must be 0 or 1"
[[ "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]] || \
  fail "AURORA_CANDIDATE_SHA must be the exact lowercase 40-hex candidate SHA"
[[ "$PACKAGE_ID" =~ ^[A-Za-z0-9._]+$ ]] || fail "AURORA_PACKAGE_ID contains unsafe characters"
[[ "$ACTIVITY_CLASS" =~ ^[A-Za-z0-9._]+$ ]] || fail "AURORA_ACTIVITY_CLASS contains unsafe characters"
safe_metadata_value "AURORA_APK_VARIANT" "$APK_VARIANT"
safe_metadata_value "AURORA_OPERATOR" "$OPERATOR"
if [[ -n "$REQUESTED_GATEWAY_IDENTITY" ]]; then
  safe_metadata_value "AURORA_GATEWAY_IDENTITY" "$REQUESTED_GATEWAY_IDENTITY"
fi
if [[ -n "$REQUESTED_GATEWAY_VERSION" ]]; then
  safe_metadata_value "AURORA_GATEWAY_VERSION" "$REQUESTED_GATEWAY_VERSION"
fi
[[ -n "$APK_PATH" && -f "$APK_PATH" ]] || fail "AURORA_APK must point to the exact candidate APK"
[[ -n "$ARTIFACT_ZIP" && -f "$ARTIFACT_ZIP" ]] || \
  fail "AURORA_ARTIFACT_ZIP must point to the exact downloaded GitHub artifact ZIP"
[[ -n "$ARTIFACT_METADATA" && -f "$ARTIFACT_METADATA" ]] || \
  fail "AURORA_ARTIFACT_METADATA must point to the trusted artifact metadata file"
command -v "$ADB_BIN" >/dev/null 2>&1 || fail "adb is not installed or not on PATH"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is required"
command -v unzip >/dev/null 2>&1 || fail "unzip is required"
command -v cmp >/dev/null 2>&1 || fail "cmp is required"
command -v realpath >/dev/null 2>&1 || fail "realpath is required"
command -v curl >/dev/null 2>&1 || fail "curl is required for fresh host probes"
command -v node >/dev/null 2>&1 || fail "node is required for bounded host probe parsing"

mapfile -t DEVICES < <("$ADB_BIN" devices | awk 'NR > 1 && $2 == "device" {print $1}')
[[ "${#DEVICES[@]}" -eq 1 ]] || \
  fail "exactly one authorized Android device is required; found ${#DEVICES[@]}"
SERIAL="${DEVICES[0]}"
QEMU="$("$ADB_BIN" -s "$SERIAL" shell getprop ro.kernel.qemu | tr -d '\r\n')"
[[ "$QEMU" != "1" && "$SERIAL" != emulator-* ]] || \
  fail "emulator detected; DP5 requires representative physical hardware"
if [[ "$MODE" == "finalize" ]]; then
  set +e
  FINALIZE_ENTRY_MAPPINGS="$("$ADB_BIN" -s "$SERIAL" reverse --list 2>/dev/null)"
  FINALIZE_ENTRY_STATUS=$?
  set -e
  (( FINALIZE_ENTRY_STATUS == 0 )) || fail "could not inspect device-plane mapping at finalize entry"
  grep -q "tcp:$GATEWAY_PORT tcp:$GATEWAY_PORT" <<<"$FINALIZE_ENTRY_MAPPINGS" || \
    fail "device-plane mapping is absent at finalize entry"
  REVERSE_CONFIGURED_BY_SCRIPT=1
fi

read_key_value_file "$ARTIFACT_METADATA" ARTIFACT_META
[[ "${#ARTIFACT_META[@]}" -eq 4 ]] || fail "artifact metadata must contain exactly four canonical keys"
PACKAGING_HEAD_SHA="$(require_metadata_key ARTIFACT_META packaging_head_sha)"
ARTIFACT_ID="$(require_metadata_key ARTIFACT_META artifact_id)"
ARTIFACT_NAME="$(require_metadata_key ARTIFACT_META artifact_name)"
ARTIFACT_ZIP_SHA256="$(require_metadata_key ARTIFACT_META artifact_zip_sha256)"
[[ "$PACKAGING_HEAD_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "packaging_head_sha must be lowercase 40-hex"
[[ "$ARTIFACT_ID" =~ ^[1-9][0-9]*$ ]] || fail "artifact_id must be a positive integer"
[[ "$ARTIFACT_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || fail "artifact_name contains unsafe characters"
[[ "$ARTIFACT_ZIP_SHA256" =~ ^[0-9a-f]{64}$ ]] || fail "artifact_zip_sha256 must be lowercase 64-hex"
[[ "$(sha256sum "$ARTIFACT_ZIP" | awk '{print $1}')" == "$ARTIFACT_ZIP_SHA256" ]] || \
  fail "artifact ZIP digest does not match trusted artifact metadata"

ARTIFACT_TMP="$(mktemp -d)"
mapfile -t ARTIFACT_ENTRIES < <(unzip -Z1 "$ARTIFACT_ZIP")
[[ "${#ARTIFACT_ENTRIES[@]}" -eq 3 ]] || fail "artifact ZIP must contain exactly three files"
for artifact_entry in "${ARTIFACT_ENTRIES[@]}"; do
  [[ "$artifact_entry" =~ ^[A-Za-z0-9._-]+$ ]] || fail "artifact ZIP contains an unsafe path"
done
printf '%s\n' "${ARTIFACT_ENTRIES[@]}" | grep -Fxq 'BUILD_IDENTITY.txt' || fail "artifact ZIP lacks BUILD_IDENTITY.txt"
printf '%s\n' "${ARTIFACT_ENTRIES[@]}" | grep -Fxq 'SHA256SUMS.txt' || fail "artifact ZIP lacks SHA256SUMS.txt"
unzip -q "$ARTIFACT_ZIP" -d "$ARTIFACT_TMP"
ARTIFACT_TMP_REAL="$(realpath -- "$ARTIFACT_TMP")"
for artifact_entry in "${ARTIFACT_ENTRIES[@]}"; do
  [[ -f "$ARTIFACT_TMP/$artifact_entry" && ! -L "$ARTIFACT_TMP/$artifact_entry" ]] || \
    fail "artifact ZIP entry must extract as a regular non-symlink file: $artifact_entry"
  [[ "$(dirname -- "$(realpath -- "$ARTIFACT_TMP/$artifact_entry")")" == "$ARTIFACT_TMP_REAL" ]] || \
    fail "artifact ZIP entry escapes the extraction directory: $artifact_entry"
done
read_key_value_file "$ARTIFACT_TMP/BUILD_IDENTITY.txt" BUILD_META
ANDROID_SHA="$(require_metadata_key BUILD_META source_candidate_sha)"
HOST_SHA="$(require_metadata_key BUILD_META paired_local_host_candidate_sha)"
MAIN_SHA="$(require_metadata_key BUILD_META reconciled_main_parent_sha)"
[[ "$ANDROID_SHA" == "$CANDIDATE_SHA" ]] || fail "candidate SHA does not match embedded BUILD_IDENTITY"
[[ "$HOST_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "embedded host SHA must be lowercase 40-hex"
[[ "$MAIN_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "embedded main SHA must be lowercase 40-hex"
GATEWAY_IDENTITY="aurora-w15j-local-host"
GATEWAY_VERSION="git:$HOST_SHA"
[[ -z "$REQUESTED_GATEWAY_IDENTITY" || "$REQUESTED_GATEWAY_IDENTITY" == "$GATEWAY_IDENTITY" ]] || \
  fail "AURORA_GATEWAY_IDENTITY must equal the canonical derived local host identity"
[[ -z "$REQUESTED_GATEWAY_VERSION" || "$REQUESTED_GATEWAY_VERSION" == "$GATEWAY_VERSION" ]] || \
  fail "AURORA_GATEWAY_VERSION must equal git:<embedded host SHA>"
[[ "$(require_metadata_key BUILD_META apk_variant)" == "$APK_VARIANT" ]] || fail "APK variant does not match embedded BUILD_IDENTITY"
[[ "$(require_metadata_key BUILD_META package_id)" == "$PACKAGE_ID" ]] || fail "package id does not match embedded BUILD_IDENTITY"
[[ "$(require_metadata_key BUILD_META canonical_acceptance)" == "false" ]] || fail "artifact must not claim canonical acceptance"
[[ "$(require_metadata_key BUILD_META physical_evidence_required)" == "true" ]] || fail "artifact must require physical evidence"
[[ "$(require_metadata_key BUILD_META dp5_status)" == "INCOMPLETE" ]] || fail "artifact DP5 status must remain INCOMPLETE"
mapfile -t APK_SUM_LINES <"$ARTIFACT_TMP/SHA256SUMS.txt"
[[ "${#APK_SUM_LINES[@]}" -eq 1 ]] || fail "SHA256SUMS.txt must contain exactly one APK entry"
read -r EMBEDDED_APK_SHA EMBEDDED_APK_NAME <<<"${APK_SUM_LINES[0]}"
[[ "$EMBEDDED_APK_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "embedded APK digest is invalid"
[[ "$EMBEDDED_APK_NAME" =~ ^[A-Za-z0-9._-]+\.apk$ ]] || fail "embedded APK filename is invalid"
printf '%s\n' "${ARTIFACT_ENTRIES[@]}" | grep -Fxq "$EMBEDDED_APK_NAME" || fail "artifact ZIP lacks the SHA256SUMS APK"
[[ "$(sha256sum "$ARTIFACT_TMP/$EMBEDDED_APK_NAME" | awk '{print $1}')" == "$EMBEDDED_APK_SHA" ]] || fail "embedded APK digest does not match SHA256SUMS"
cmp -s "$APK_PATH" "$ARTIFACT_TMP/$EMBEDDED_APK_NAME" || fail "AURORA_APK differs from artifact ZIP APK"

[[ -n "$HOST_READINESS_DIR" && -d "$HOST_READINESS_DIR" && ! -L "$HOST_READINESS_DIR" ]] || \
  fail "AURORA_W15J_HOST_READINESS_DIR must be a real directory from the exact host runner"
HOST_READINESS_FILES=(
  host-ready-announcement.txt
  host-listener-8080.txt host-listener-8080.txt.exit-code
  host-listener-8081.txt host-listener-8081.txt.exit-code
  host-health-8080.txt host-health-8080.txt.exit-code
  host-health-8081.txt host-health-8081.txt.exit-code
)
mapfile -t HOST_READINESS_ACTUAL < <(find "$HOST_READINESS_DIR" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)
mapfile -t HOST_READINESS_EXPECTED < <(printf '%s\n' "${HOST_READINESS_FILES[@]}" | sort)
[[ "${HOST_READINESS_ACTUAL[*]}" == "${HOST_READINESS_EXPECTED[*]}" ]] || \
  fail "host readiness directory must contain exactly the nine canonical files"
for host_file in "${HOST_READINESS_FILES[@]}"; do
  [[ -f "$HOST_READINESS_DIR/$host_file" && ! -L "$HOST_READINESS_DIR/$host_file" ]] || \
    fail "host readiness file is missing, non-regular, or a symlink: $host_file"
  [[ -s "$HOST_READINESS_DIR/$host_file" ]] || fail "host readiness file is empty: $host_file"
done
for host_probe in host-listener-8080.txt host-listener-8081.txt host-health-8080.txt host-health-8081.txt; do
  [[ "$(tr -d '\r\n' <"$HOST_READINESS_DIR/$host_probe.exit-code")" == "0" ]] || \
    fail "host readiness probe failed: $host_probe"
done
read_key_value_file "$HOST_READINESS_DIR/host-ready-announcement.txt" HOST_READY_META
[[ "${#HOST_READY_META[@]}" -eq 9 ]] || fail "host ready announcement must contain exactly nine allowlisted keys"
[[ "$(require_metadata_key HOST_READY_META host_candidate_sha)" == "$HOST_SHA" ]] || fail "host ready SHA does not match artifact tuple"
[[ "$(require_metadata_key HOST_READY_META gateway_identity)" == "$GATEWAY_IDENTITY" ]] || fail "host ready gateway identity drift"
[[ "$(require_metadata_key HOST_READY_META gateway_version)" == "$GATEWAY_VERSION" ]] || fail "host ready gateway version drift"
[[ "$(require_metadata_key HOST_READY_META device_gateway_port)" == "$GATEWAY_PORT" ]] || fail "host ready device gateway port drift"
[[ "$(require_metadata_key HOST_READY_META bootstrap_port)" == "8081" ]] || fail "host ready bootstrap port must be 8081"
[[ "$(require_metadata_key HOST_READY_META physical_evidence_status)" == "NOT_RUN" ]] || fail "host ready announcement must preserve physical NOT_RUN"
HOST_READY_STARTED_AT="$(require_metadata_key HOST_READY_META started_at_utc)"
HOST_READY_PROCESS_ID="$(require_metadata_key HOST_READY_META process_id)"
HOST_INSTANCE_ID="$(require_metadata_key HOST_READY_META host_instance_id)"
[[ "$HOST_READY_PROCESS_ID" =~ ^[1-9][0-9]*$ ]] || fail "host ready process_id must be positive"
[[ "$HOST_INSTANCE_ID" =~ ^whi_[0-9a-f]{64}$ ]] || fail "host ready host_instance_id must be canonical"
node -e '
  const observed = Date.parse(process.argv[1]);
  const now = Date.now();
  const phase = process.argv[2];
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(process.argv[1])) process.exit(2);
  if (!Number.isFinite(observed)) process.exit(3);
  const input = process.argv[1].replace(/\.000Z$/, "Z");
  const canonical = new Date(observed).toISOString().replace(/\.000Z$/, "Z");
  if (input !== canonical || observed > now) process.exit(4);
  if (phase === "preflight" && now - observed > 300000) process.exit(5);
' "$HOST_READY_STARTED_AT" "$MODE" || fail "host ready started_at_utc is stale or invalid for $MODE"
for host_probe in host-listener-8080.txt host-listener-8081.txt host-health-8080.txt host-health-8081.txt; do
  HOST_PROBE_META=()
  read_key_value_file "$HOST_READINESS_DIR/$host_probe" HOST_PROBE_META
  probe_port="${host_probe#*-}"
  probe_port="${probe_port%.txt}"
  probe_port="${probe_port##*-}"
  if [[ "$host_probe" == host-listener-* ]]; then
    [[ "${#HOST_PROBE_META[@]}" -eq 16 ]] || fail "$host_probe must contain exactly sixteen canonical keys"
    expected_probe="HTTP_LISTENER_INSTANCE_RESPONSE"
    expected_path="/v1/local-host/instance"
    expected_http="200"
    expected_result="LOCAL_HOST_INSTANCE"
    if [[ "$probe_port" == "8080" ]]; then
      expected_role="DEVICE_GATEWAY"
    else
      expected_role="BOOTSTRAP_EXCHANGE"
    fi
    [[ "$(require_metadata_key HOST_PROBE_META server_result_code)" == "$expected_result" ]] || \
      fail "$host_probe server result drift"
    [[ "$(require_metadata_key HOST_PROBE_META host_instance_id)" == "$HOST_INSTANCE_ID" ]] || \
      fail "$host_probe host instance drift"
    [[ "$(require_metadata_key HOST_PROBE_META listener_role)" == "$expected_role" ]] || \
      fail "$host_probe listener role drift"
    [[ "$(require_metadata_key HOST_PROBE_META cache_control)" == "no-store" ]] || \
      fail "$host_probe cache control drift"
    [[ "$(require_metadata_key HOST_PROBE_META pragma)" == "no-cache" ]] || \
      fail "$host_probe pragma drift"
  else
    [[ "${#HOST_PROBE_META[@]}" -eq 12 ]] || fail "$host_probe must contain exactly twelve canonical keys"
    expected_probe="HTTP_ROUTE_HEALTH_RESPONSE"
    expected_http="405"
    expected_error="METHOD_NOT_ALLOWED"
    if [[ "$probe_port" == "8080" ]]; then
      expected_path="/v1/gateway/sessions/open"
    else
      expected_path="/v1/gateway/bootstrap/exchange"
    fi
    [[ "$(require_metadata_key HOST_PROBE_META server_error_code)" == "$expected_error" ]] || \
      fail "$host_probe server error drift"
  fi
  [[ "$(require_metadata_key HOST_PROBE_META probe)" == "$expected_probe" ]] || fail "$host_probe probe kind drift"
  [[ "$(require_metadata_key HOST_PROBE_META host)" == "127.0.0.1" ]] || fail "$host_probe host drift"
  [[ "$(require_metadata_key HOST_PROBE_META port)" == "$probe_port" ]] || fail "$host_probe port drift"
  [[ "$(require_metadata_key HOST_PROBE_META method)" == "GET" ]] || fail "$host_probe method drift"
  [[ "$(require_metadata_key HOST_PROBE_META path)" == "$expected_path" ]] || fail "$host_probe path drift"
  [[ "$(require_metadata_key HOST_PROBE_META http_status)" == "$expected_http" ]] || fail "$host_probe HTTP status drift"
  [[ "$(require_metadata_key HOST_PROBE_META response_bytes)" =~ ^[1-9][0-9]*$ ]] || fail "$host_probe response_bytes must be positive"
  [[ "$(require_metadata_key HOST_PROBE_META process_id)" == "$HOST_READY_PROCESS_ID" ]] || fail "$host_probe process_id drift"
  [[ "$(require_metadata_key HOST_PROBE_META authorizes_execution)" == "false" ]] || fail "$host_probe cannot authorize execution"
  [[ "$(require_metadata_key HOST_PROBE_META physical_evidence_status)" == "NOT_RUN" ]] || fail "$host_probe cannot claim physical evidence"
  host_probe_time="$(require_metadata_key HOST_PROBE_META observed_at_utc)"
  node -e '
    const observed = Date.parse(process.argv[1]);
    const started = Date.parse(process.argv[2]);
    const now = Date.now();
    const phase = process.argv[3];
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(process.argv[1])) process.exit(2);
    if (!Number.isFinite(observed) || !Number.isFinite(started)) process.exit(3);
    const input = process.argv[1].replace(/\.000Z$/, "Z");
    const canonical = new Date(observed).toISOString().replace(/\.000Z$/, "Z");
    if (input !== canonical || observed !== started || observed > now) process.exit(4);
    if (phase === "preflight" && now - observed > 300000) process.exit(5);
  ' "$host_probe_time" "$HOST_READY_STARTED_AT" "$MODE" || \
    fail "$host_probe is stale or has an invalid UTC timestamp for $MODE"
done

if [[ "$MODE" == "preflight" ]]; then
  [[ ! -e "$OUTPUT_DIR" ]] || fail "preflight evidence directory already exists: $OUTPUT_DIR"
  mkdir -p "$OUTPUT_DIR"
  cp -- "$ARTIFACT_ZIP" "$OUTPUT_DIR/artifact.zip"
  cp -- "$ARTIFACT_METADATA" "$OUTPUT_DIR/artifact-metadata.txt"
  cp -- "$ARTIFACT_TMP/BUILD_IDENTITY.txt" "$OUTPUT_DIR/BUILD_IDENTITY.txt"
  cp -- "$ARTIFACT_TMP/SHA256SUMS.txt" "$OUTPUT_DIR/SHA256SUMS.txt"
  cp -- "$ARTIFACT_TMP/$EMBEDDED_APK_NAME" "$OUTPUT_DIR/candidate.apk"
  for host_file in "${HOST_READINESS_FILES[@]}"; do
    cp -- "$HOST_READINESS_DIR/$host_file" "$OUTPUT_DIR/$host_file"
  done
else
  [[ -d "$OUTPUT_DIR" ]] || fail "finalize requires existing AURORA_EVIDENCE_DIR"
  [[ -f "$OUTPUT_DIR/preflight-metadata.txt" ]] || \
    fail "finalize requires preflight-metadata.txt in AURORA_EVIDENCE_DIR"
  cmp -s "$ARTIFACT_ZIP" "$OUTPUT_DIR/artifact.zip" || fail "finalize artifact ZIP differs from preflight"
  cmp -s "$ARTIFACT_METADATA" "$OUTPUT_DIR/artifact-metadata.txt" || fail "finalize artifact metadata differs from preflight"
  cmp -s "$ARTIFACT_TMP/BUILD_IDENTITY.txt" "$OUTPUT_DIR/BUILD_IDENTITY.txt" || fail "finalize BUILD_IDENTITY differs from preflight"
  cmp -s "$ARTIFACT_TMP/SHA256SUMS.txt" "$OUTPUT_DIR/SHA256SUMS.txt" || fail "finalize SHA256SUMS differs from preflight"
  cmp -s "$APK_PATH" "$OUTPUT_DIR/candidate.apk" || fail "finalize APK differs from immutable preflight APK"
  for host_file in "${HOST_READINESS_FILES[@]}"; do
    cmp -s "$HOST_READINESS_DIR/$host_file" "$OUTPUT_DIR/$host_file" || \
      fail "finalize host readiness evidence differs from preflight: $host_file"
  done
fi

adb_shell() {
  "$ADB_BIN" -s "$SERIAL" shell "$@"
}

capture_required() {
  local name="$1"
  shift
  set +e
  "$@" >"$OUTPUT_DIR/$name" 2>&1
  local status=$?
  set -e
  printf '%s\n' "$status" >"$OUTPUT_DIR/$name.exit-code"
  (( status == 0 )) || fail "required capture failed: $name"
}

capture_collector_host_probe() {
  local phase="$1"
  local port="$2"
  local listener_role="$3"
  local path="/v1/local-host/instance"
  local name="collector-probe-$phase-$port.txt"
  local body="$ARTIFACT_TMP/$name.body.json"
  local headers="$ARTIFACT_TMP/$name.headers.txt"
  local http_status curl_status response_bytes observed_at probe_identity host_instance_id observed_role
  set +e
  http_status="$(curl --silent --show-error --noproxy '*' --max-time 5 --dump-header "$headers" \
    --output "$body" --write-out '%{http_code}' \
    "http://127.0.0.1:$port$path")"
  curl_status=$?
  set -e
  printf '%s\n' "$curl_status" >"$OUTPUT_DIR/$name.exit-code"
  (( curl_status == 0 )) || fail "collector-owned host probe failed: $name"
  [[ "$http_status" == "200" ]] || fail "collector-owned host instance probe expected HTTP 200: $name"
  response_bytes="$(wc -c <"$body" | tr -d ' ')"
  [[ "$response_bytes" =~ ^[1-9][0-9]*$ ]] || fail "collector-owned host probe returned an empty body: $name"
  (( response_bytes <= 65536 )) || fail "collector-owned host probe exceeded 64 KiB: $name"
  probe_identity="$(node -e '
    const fs = require("node:fs");
    const bytes = fs.readFileSync(process.argv[1]);
    const headerBytes = fs.readFileSync(process.argv[2]);
    const expectedRole = process.argv[3];
    if (bytes.length === 0 || bytes.length > 65536 || headerBytes.length > 65536) process.exit(2);
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); } catch { process.exit(3); }
    const keys = value && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value).sort().join(",") : "";
    const expectedKeys = ["authorizesExecution", "hostInstanceId", "kind", "listenerRole",
      "physicalEvidenceStatus", "provesExecutionSuccess", "retryAuthorized"].sort().join(",");
    if (keys !== expectedKeys || value.kind !== "LOCAL_HOST_INSTANCE" ||
        !/^whi_[0-9a-f]{64}$/.test(value.hostInstanceId) ||
        value.listenerRole !== expectedRole || value.authorizesExecution !== false ||
        value.provesExecutionSuccess !== false || value.retryAuthorized !== false ||
        value.physicalEvidenceStatus !== "NOT_RUN") process.exit(4);
    const headerLines = headerBytes.toString("utf8").split(/\r?\n/);
    const values = (name) => headerLines
      .filter((line) => line.toLowerCase().startsWith(`${name}:`))
      .map((line) => line.slice(line.indexOf(":") + 1).trim().toLowerCase());
    const cacheControl = values("cache-control");
    const pragma = values("pragma");
    if (cacheControl.length !== 1 || cacheControl[0] !== "no-store" ||
        pragma.length !== 1 || pragma[0] !== "no-cache") process.exit(5);
    process.stdout.write(`${value.hostInstanceId}\t${value.listenerRole}`);
  ' "$body" "$headers" "$listener_role")" || \
    fail "collector-owned host instance probe returned malformed bounded identity or cache headers: $name"
  IFS=$'\t' read -r host_instance_id observed_role <<<"$probe_identity"
  [[ "$host_instance_id" == "$HOST_INSTANCE_ID" ]] || fail "collector-owned host instance drift: $name"
  [[ "$observed_role" == "$listener_role" ]] || fail "collector-owned listener role drift: $name"
  observed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cat >"$OUTPUT_DIR/$name" <<EOF_PROBE
probe=COLLECTOR_HTTP_LISTENER_INSTANCE_RESPONSE
phase=$phase
observed_at_utc=$observed_at
host=127.0.0.1
port=$port
method=GET
path=$path
http_status=$http_status
server_result_code=LOCAL_HOST_INSTANCE
host_instance_id=$host_instance_id
listener_role=$observed_role
response_bytes=$response_bytes
cache_control=no-store
pragma=no-cache
authorizes_execution=false
proves_execution_success=false
retry_authorized=false
physical_evidence_status=NOT_RUN
EOF_PROBE
}

pull_and_verify_installed_apk() {
  local phase="$1"
  local package_path_file="$2"
  local output_apk="$OUTPUT_DIR/installed-base-$phase.apk"
  local pull_log="installed-base-$phase-pull.txt"
  local -a package_lines=()
  local package_path
  mapfile -t package_lines < <(sed '/^[[:space:]]*$/d' "$package_path_file")
  [[ "${#package_lines[@]}" -eq 1 ]] || \
    fail "installed package must expose exactly one package line and no splits at $phase"
  [[ "${package_lines[0]}" =~ ^package:(/.*/base\.apk)$ ]] || \
    fail "installed package path must be exactly one base.apk at $phase"
  package_path="${BASH_REMATCH[1]}"
  capture_required "$pull_log" "$ADB_BIN" -s "$SERIAL" pull "$package_path" "$output_apk"
  [[ -f "$output_apk" && ! -L "$output_apk" ]] || fail "installed base APK readback is not a regular file at $phase"
  [[ "$(sha256sum "$output_apk" | awk '{print $1}')" == "$EMBEDDED_APK_SHA" ]] || \
    fail "installed base APK SHA-256 does not match artifact at $phase"
}

write_manifest() {
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

MODEL="$(adb_shell getprop ro.product.model | tr -d '\r\n')"
MANUFACTURER="$(adb_shell getprop ro.product.manufacturer | tr -d '\r\n')"
PRODUCT="$(adb_shell getprop ro.product.name | tr -d '\r\n')"
API_LEVEL="$(adb_shell getprop ro.build.version.sdk | tr -d '\r\n')"
FINGERPRINT="$(adb_shell getprop ro.build.fingerprint | tr -d '\r\n')"
SERIAL_HASH="$(printf '%s' "$SERIAL" | sha256sum | awk '{print $1}')"
APK_SHA256="$(sha256sum "$APK_PATH" | awk '{print $1}')"

for value in "$MODEL" "$MANUFACTURER" "$PRODUCT" "$API_LEVEL" "$FINGERPRINT"; do
  [[ -n "$value" ]] || fail "required physical device identity field is empty"
done

if [[ "$MODE" == "preflight" ]]; then
  cat >"$OUTPUT_DIR/preflight-metadata.txt" <<EOF_PREFLIGHT
collected_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
candidate_sha=$CANDIDATE_SHA
host_candidate_sha=$HOST_SHA
reconciled_main_sha=$MAIN_SHA
packaging_head_sha=$PACKAGING_HEAD_SHA
artifact_id=$ARTIFACT_ID
artifact_name=$ARTIFACT_NAME
artifact_zip_sha256=$ARTIFACT_ZIP_SHA256
apk_path_sha256=$APK_SHA256
apk_variant=$APK_VARIANT
serial_sha256=$SERIAL_HASH
manufacturer=$MANUFACTURER
model=$MODEL
product=$PRODUCT
api_level=$API_LEVEL
build_fingerprint=$FINGERPRINT
ro.kernel.qemu=$QEMU
package_id=$PACKAGE_ID
activity_class=$ACTIVITY_CLASS
gateway_identity=$GATEWAY_IDENTITY
gateway_version=$GATEWAY_VERSION
host_instance_id=$HOST_INSTANCE_ID
gateway_port=$GATEWAY_PORT
operator=$OPERATOR
EOF_PREFLIGHT

  sha256sum "$APK_PATH" >"$OUTPUT_DIR/apk-sha256.txt"
  capture_required apk-install.txt "$ADB_BIN" -s "$SERIAL" install -r "$APK_PATH"
  capture_required package-path.txt adb_shell pm path "$PACKAGE_ID"
  pull_and_verify_installed_apk preflight "$OUTPUT_DIR/package-path.txt"
  capture_required package-dump.txt adb_shell dumpsys package "$PACKAGE_ID"

  PACKAGE_DUMP="$OUTPUT_DIR/package-dump.txt"
  VERSION_CODE="$(sed -n 's/.*versionCode=\([0-9][0-9]*\).*/\1/p' "$PACKAGE_DUMP" | head -n 1)"
  VERSION_NAME="$(sed -n 's/^[[:space:]]*versionName=\(.*\)$/\1/p' "$PACKAGE_DUMP" | head -n 1)"
  [[ -n "$VERSION_CODE" ]] || fail "could not determine installed versionCode"
  [[ -n "$VERSION_NAME" ]] || fail "could not determine installed versionName"
  [[ "$VERSION_CODE" == "$(require_metadata_key BUILD_META version_code)" ]] || \
    fail "installed versionCode does not match embedded BUILD_IDENTITY"
  [[ "$VERSION_NAME" == "$(require_metadata_key BUILD_META version_name)" ]] || \
    fail "installed versionName does not match embedded BUILD_IDENTITY"

  cat >"$OUTPUT_DIR/apk-identity.txt" <<EOF_APK
candidate_sha=$CANDIDATE_SHA
application_id=$PACKAGE_ID
variant=$APK_VARIANT
version_code=$VERSION_CODE
version_name=$VERSION_NAME
apk_sha256=$APK_SHA256
EOF_APK

  REQUESTED_PERMISSIONS="$OUTPUT_DIR/requested-permissions.txt"
  sed -n '/requested permissions:/,/install permissions:/p' "$PACKAGE_DUMP" >"$REQUESTED_PERMISSIONS"
  grep -q 'android.permission.INTERNET' "$REQUESTED_PERMISSIONS" || \
    fail "candidate APK does not request android.permission.INTERNET"

  if [[ "$CONFIGURE_ADB_REVERSE" == "1" ]]; then
    capture_required adb-reverse-configure.txt \
      "$ADB_BIN" -s "$SERIAL" reverse "tcp:$GATEWAY_PORT" "tcp:$GATEWAY_PORT"
    REVERSE_CONFIGURED_BY_SCRIPT=1
  fi
  capture_required adb-reverse-list.txt "$ADB_BIN" -s "$SERIAL" reverse --list
  grep -q "tcp:$GATEWAY_PORT tcp:$GATEWAY_PORT" "$OUTPUT_DIR/adb-reverse-list.txt" || \
    fail "expected adb reverse mapping was not observed"
  capture_collector_host_probe preflight 8080 DEVICE_GATEWAY
  capture_collector_host_probe preflight 8081 BOOTSTRAP_EXCHANGE

  capture_required battery-before.txt adb_shell dumpsys battery
  capture_required meminfo-before.txt adb_shell dumpsys meminfo "$PACKAGE_ID"
  capture_required cpuinfo-before.txt adb_shell dumpsys cpuinfo
  capture_required storage-before.txt adb_shell du -sk "/data/user/0/$PACKAGE_ID"
  capture_required services-before.txt adb_shell dumpsys activity services "$PACKAGE_ID"

  adb_shell am force-stop "$PACKAGE_ID"
  sleep 1
  capture_required cold-start.txt adb_shell am start -W -n "$PACKAGE_ID/$ACTIVITY_CLASS"
  sleep 2
  capture_required warm-start.txt adb_shell am start -W -n "$PACKAGE_ID/$ACTIVITY_CLASS"
  capture_required meminfo-after-warm-start.txt adb_shell dumpsys meminfo "$PACKAGE_ID"

  adb_shell am force-stop "$PACKAGE_ID"
  sleep 1
  capture_required restart-start.txt adb_shell am start -W -n "$PACKAGE_ID/$ACTIVITY_CLASS"
  sleep 2
  capture_required meminfo-after-restart.txt adb_shell dumpsys meminfo "$PACKAGE_ID"
  capture_required cpuinfo-after-restart.txt adb_shell dumpsys cpuinfo
  capture_required storage-after-restart.txt adb_shell du -sk "/data/user/0/$PACKAGE_ID"
  capture_required services-after-restart.txt adb_shell dumpsys activity services "$PACKAGE_ID"

  cat >"$OUTPUT_DIR/acceptance-status.txt" <<EOF_STATUS
DP4_STATUS=OPEN
DP5_STATUS=INCOMPLETE_UNTIL_SCENARIO_MATRIX_SIGNED
PHYSICAL_DEVICE_PREFLIGHT=PASS
CANDIDATE_SHA=$CANDIDATE_SHA
APK_SHA256=$APK_SHA256
INTERNET_PERMISSION=PRESENT
ADB_REVERSE_STATUS=CONFIGURED_OR_OBSERVED_LOCAL_ONLY
GATEWAY_PORT=$GATEWAY_PORT
GATEWAY_TRANSPORT_SCOPE=LOCAL_ADB_REVERSE_ONLY
RAW_CAPTURE_EXIT_CODES=REVIEW_REQUIRED
REQUIRED_NEXT=Execute every W15J_PHYSICAL_ACCEPTANCE.md scenario, populate per-scenario records in W15J_EVIDENCE_TEMPLATE.json, then rerun this collector with AURORA_EVIDENCE_MODE=finalize and the same AURORA_EVIDENCE_DIR.
EOF_STATUS

  write_manifest evidence-manifest-preflight.sha256
  COLLECTION_SUCCEEDED=1
  printf 'W15-J physical preflight evidence collected in %s\n' "$OUTPUT_DIR"
  printf 'ADB reverse remains active only for the governed scenario window.\n'
  printf 'Finalize with the same evidence directory after scenarios complete.\n'
else
  grep -Fxq "candidate_sha=$CANDIDATE_SHA" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize candidate SHA does not match preflight"
  grep -Fxq "host_candidate_sha=$HOST_SHA" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize host SHA does not match preflight"
  grep -Fxq "reconciled_main_sha=$MAIN_SHA" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize main SHA does not match preflight"
  grep -Fxq "packaging_head_sha=$PACKAGING_HEAD_SHA" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize packaging SHA does not match preflight"
  grep -Fxq "artifact_id=$ARTIFACT_ID" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize artifact id does not match preflight"
  grep -Fxq "artifact_name=$ARTIFACT_NAME" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize artifact name does not match preflight"
  grep -Fxq "artifact_zip_sha256=$ARTIFACT_ZIP_SHA256" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize artifact ZIP digest does not match preflight"
  grep -Fxq "serial_sha256=$SERIAL_HASH" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize physical device does not match preflight"
  grep -Fxq "manufacturer=$MANUFACTURER" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize device manufacturer does not match preflight"
  grep -Fxq "model=$MODEL" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize device model does not match preflight"
  grep -Fxq "product=$PRODUCT" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize device product does not match preflight"
  grep -Fxq "api_level=$API_LEVEL" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize API level does not match preflight"
  grep -Fxq "build_fingerprint=$FINGERPRINT" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize build fingerprint does not match preflight"
  grep -Fxq "package_id=$PACKAGE_ID" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize package id does not match preflight"
  grep -Fxq "gateway_identity=$GATEWAY_IDENTITY" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize gateway identity does not match preflight"
  grep -Fxq "gateway_version=$GATEWAY_VERSION" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize gateway version does not match preflight"
  grep -Fxq "host_instance_id=$HOST_INSTANCE_ID" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize host instance does not match preflight"
  grep -Fxq "apk_path_sha256=$APK_SHA256" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize APK hash does not match preflight"
  grep -Fxq "apk_variant=$APK_VARIANT" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize APK variant does not match preflight"
  grep -Fxq "gateway_port=$GATEWAY_PORT" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize gateway port does not match preflight"
  grep -Fxq "operator=$OPERATOR" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize operator does not match preflight"

  capture_required adb-reverse-list-before-finalize.txt "$ADB_BIN" -s "$SERIAL" reverse --list
  grep -q "tcp:$GATEWAY_PORT tcp:$GATEWAY_PORT" "$OUTPUT_DIR/adb-reverse-list-before-finalize.txt" || \
    fail "expected governed adb reverse mapping is missing before finalize"
  # From this point the mapping is proven to belong to the same governed evidence window.
  # If finalize aborts, the EXIT trap must remove it.
  REVERSE_CONFIGURED_BY_SCRIPT=1

  capture_collector_host_probe finalize 8080 DEVICE_GATEWAY
  capture_collector_host_probe finalize 8081 BOOTSTRAP_EXCHANGE

  capture_required battery-after.txt adb_shell dumpsys battery
  capture_required meminfo-after.txt adb_shell dumpsys meminfo "$PACKAGE_ID"
  capture_required cpuinfo-after.txt adb_shell dumpsys cpuinfo
  capture_required storage-after.txt adb_shell du -sk "/data/user/0/$PACKAGE_ID"
  capture_required services-after.txt adb_shell dumpsys activity services "$PACKAGE_ID"
  capture_required package-path-finalize.txt adb_shell pm path "$PACKAGE_ID"
  pull_and_verify_installed_apk finalize "$OUTPUT_DIR/package-path-finalize.txt"
  capture_required package-dump-finalize.txt adb_shell dumpsys package "$PACKAGE_ID"
  FINAL_PACKAGE_DUMP="$OUTPUT_DIR/package-dump-finalize.txt"
  FINAL_VERSION_CODE="$(sed -n 's/.*versionCode=\([0-9][0-9]*\).*/\1/p' "$FINAL_PACKAGE_DUMP" | head -n 1)"
  FINAL_VERSION_NAME="$(sed -n 's/^[[:space:]]*versionName=\(.*\)$/\1/p' "$FINAL_PACKAGE_DUMP" | head -n 1)"
  [[ -n "$FINAL_VERSION_CODE" && -n "$FINAL_VERSION_NAME" ]] || fail "could not determine installed package identity at finalize"
  grep -Fxq "version_code=$FINAL_VERSION_CODE" "$OUTPUT_DIR/apk-identity.txt" || fail "installed versionCode drift at finalize"
  grep -Fxq "version_name=$FINAL_VERSION_NAME" "$OUTPUT_DIR/apk-identity.txt" || fail "installed versionName drift at finalize"
  cat >"$OUTPUT_DIR/apk-identity-finalize.txt" <<EOF_APK_FINAL
candidate_sha=$CANDIDATE_SHA
application_id=$PACKAGE_ID
variant=$APK_VARIANT
version_code=$FINAL_VERSION_CODE
version_name=$FINAL_VERSION_NAME
apk_sha256=$APK_SHA256
EOF_APK_FINAL

  capture_required adb-reverse-remove.txt \
    "$ADB_BIN" -s "$SERIAL" reverse --remove "tcp:$GATEWAY_PORT"
  capture_required adb-reverse-list-after-finalize.txt "$ADB_BIN" -s "$SERIAL" reverse --list
  if grep -q "tcp:$GATEWAY_PORT tcp:$GATEWAY_PORT" "$OUTPUT_DIR/adb-reverse-list-after-finalize.txt"; then
    fail "adb reverse mapping still exists after finalize"
  fi

  cat >"$OUTPUT_DIR/finalize-metadata.txt" <<EOF_FINAL
finalized_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
candidate_sha=$CANDIDATE_SHA
host_candidate_sha=$HOST_SHA
reconciled_main_sha=$MAIN_SHA
packaging_head_sha=$PACKAGING_HEAD_SHA
artifact_id=$ARTIFACT_ID
artifact_name=$ARTIFACT_NAME
artifact_zip_sha256=$ARTIFACT_ZIP_SHA256
apk_sha256=$APK_SHA256
apk_variant=$APK_VARIANT
package_id=$PACKAGE_ID
serial_sha256=$SERIAL_HASH
manufacturer=$MANUFACTURER
model=$MODEL
product=$PRODUCT
api_level=$API_LEVEL
build_fingerprint=$FINGERPRINT
gateway_identity=$GATEWAY_IDENTITY
gateway_version=$GATEWAY_VERSION
host_instance_id=$HOST_INSTANCE_ID
gateway_port=$GATEWAY_PORT
operator=$OPERATOR
adb_reverse_status=REMOVED
EOF_FINAL

  cat >"$OUTPUT_DIR/acceptance-status.txt" <<EOF_STATUS
DP4_STATUS=OPEN
DP5_STATUS=INCOMPLETE_UNTIL_SCENARIO_MATRIX_SIGNED
PHYSICAL_DEVICE_PREFLIGHT=PASS
PHYSICAL_WINDOW_FINALIZED=PASS
CANDIDATE_SHA=$CANDIDATE_SHA
APK_SHA256=$APK_SHA256
ADB_REVERSE_STATUS=REMOVED
GATEWAY_PORT=$GATEWAY_PORT
GATEWAY_TRANSPORT_SCOPE=LOCAL_ADB_REVERSE_ONLY
RAW_CAPTURE_EXIT_CODES=REVIEW_REQUIRED
REQUIRED_NEXT=Complete and independently review the per-scenario evidence matrix plus Risk Gates A-D. This collector output alone cannot close DP5.
EOF_STATUS

  write_manifest evidence-manifest.sha256
  COLLECTION_SUCCEEDED=1
  printf 'W15-J physical evidence window finalized in %s\n' "$OUTPUT_DIR"
  printf 'ADB reverse mapping removed. DP5 remains closed pending per-scenario evidence and Risk Gates A-D.\n'
fi
