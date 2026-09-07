#!/usr/bin/env bash
set -euo pipefail

ADB_BIN="${ADB_BIN:-adb}"
PACKAGE_ID="${AURORA_PACKAGE_ID:-ai.aurora.device.local}"
ACTIVITY_CLASS="${AURORA_ACTIVITY_CLASS:-ai.aurora.device.MainActivity}"
MODE="${AURORA_EVIDENCE_MODE:-preflight}"
OUTPUT_DIR="${AURORA_EVIDENCE_DIR:-}"
CANDIDATE_SHA="${AURORA_CANDIDATE_SHA:-}"
APK_PATH="${AURORA_APK:-}"
APK_VARIANT="${AURORA_APK_VARIANT:-}"
OPERATOR="${AURORA_OPERATOR:-}"
ARTIFACT_ZIP="${AURORA_ARTIFACT_ZIP:-}"
ARTIFACT_METADATA="${AURORA_ARTIFACT_METADATA:-}"
HOST_READINESS_DIR="${AURORA_W15J_HOST_READINESS_DIR:-}"
DEVICE_GATEWAY_PORT=8080
BOOTSTRAP_PORT=8081
TRANSPORT_SCOPE="LOCAL_TABLET_LOOPBACK"
CONTROL_PLANE="SELF_ADB_WIRELESS_DEBUGGING"
GATEWAY_IDENTITY="aurora-w15j-local-host"

SERIAL=""
ARTIFACT_TMP=""
COLLECTION_SUCCEEDED=0

declare -A ARTIFACT_META=()
declare -A BUILD_META=()
declare -A HOST_READY=()

fail() {
  printf 'W15-J tablet-loopback collection failed: %s\n' "$*" >&2
  exit 2
}

cleanup() {
  local status=$?
  trap - EXIT
  [[ -n "$ARTIFACT_TMP" && -d "$ARTIFACT_TMP" ]] && rm -rf -- "$ARTIFACT_TMP"
  exit "$status"
}
trap cleanup EXIT

safe_value() {
  local label="$1" value="$2"
  [[ -n "$value" ]] || fail "$label is required"
  [[ "${#value}" -le 512 ]] || fail "$label exceeds 512 characters"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || fail "$label cannot contain newlines"
}

read_kv() {
  local path="$1" target_name="$2"
  local -n target="$target_name"
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -n "$line" ]] || continue
    [[ "$line" == *=* ]] || fail "invalid metadata line in $path"
    key="${line%%=*}"
    value="${line#*=}"
    [[ "$key" =~ ^[A-Za-z0-9._-]+$ ]] || fail "unsafe metadata key in $path"
    [[ -z "${target[$key]+present}" ]] || fail "duplicate metadata key $key in $path"
    safe_value "$path:$key" "$value"
    target["$key"]="$value"
  done <"$path"
}

required_kv() {
  local target_name="$1" key="$2"
  local -n target="$target_name"
  [[ -n "${target[$key]:-}" ]] || fail "$key missing from canonical metadata"
  printf '%s' "${target[$key]}"
}

capture() {
  local name="$1"
  shift
  set +e
  "$@" >"$OUTPUT_DIR/$name" 2>&1
  local status=$?
  set -e
  printf '%s\n' "$status" >"$OUTPUT_DIR/$name.exit-code"
  (( status == 0 )) || fail "required capture failed: $name"
}

adb_shell() {
  "$ADB_BIN" -s "$SERIAL" shell "$@"
}

assert_no_reverse_ports() {
  local file="$1"
  for port in "$DEVICE_GATEWAY_PORT" "$BOOTSTRAP_PORT"; do
    if grep -Eq "tcp:${port}[[:space:]]+tcp:[0-9]+|tcp:[0-9]+[[:space:]]+tcp:${port}" "$file"; then
      fail "tablet-loopback mode forbids adb reverse touching port $port"
    fi
  done
}

probe_host() {
  local phase="$1" port="$2" role="$3"
  local body="$ARTIFACT_TMP/probe-$phase-$port.json"
  local headers="$ARTIFACT_TMP/probe-$phase-$port.headers"
  local status curl_status bytes observed instance observed_role
  set +e
  status="$(curl --silent --show-error --noproxy '*' --max-time 5 \
    --dump-header "$headers" --output "$body" --write-out '%{http_code}' \
    "http://127.0.0.1:$port/v1/local-host/instance")"
  curl_status=$?
  set -e
  printf '%s\n' "$curl_status" >"$OUTPUT_DIR/collector-probe-$phase-$port.txt.exit-code"
  (( curl_status == 0 )) || fail "loopback host probe failed on $port"
  [[ "$status" == "200" ]] || fail "loopback host probe expected HTTP 200 on $port"
  bytes="$(wc -c <"$body" | tr -d ' ')"
  [[ "$bytes" =~ ^[1-9][0-9]*$ ]] || fail "host probe body is empty"
  (( bytes <= 65536 )) || fail "host probe exceeded 64 KiB"
  observed="$(node -e '
    const fs=require("node:fs");
    const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    const keys=Object.keys(value).sort().join(",");
    const expected=["authorizesExecution","hostInstanceId","kind","listenerRole","physicalEvidenceStatus","provesExecutionSuccess","retryAuthorized"].sort().join(",");
    if(keys!==expected || value.kind!=="LOCAL_HOST_INSTANCE" || !/^whi_[0-9a-f]{64}$/.test(value.hostInstanceId) || value.authorizesExecution!==false || value.provesExecutionSuccess!==false || value.retryAuthorized!==false || value.physicalEvidenceStatus!=="NOT_RUN") process.exit(2);
    process.stdout.write(`${value.hostInstanceId}\t${value.listenerRole}`);
  ' "$body")" || fail "host instance JSON is not canonical"
  IFS=$'\t' read -r instance observed_role <<<"$observed"
  [[ "$observed_role" == "$role" ]] || fail "listener role mismatch on $port"
  [[ "$instance" == "$HOST_INSTANCE_ID" ]] || fail "host instance drift on $port"
  grep -iq '^cache-control:[[:space:]]*no-store' "$headers" || fail "host probe lacks no-store"
  grep -iq '^pragma:[[:space:]]*no-cache' "$headers" || fail "host probe lacks no-cache"
  cat >"$OUTPUT_DIR/collector-probe-$phase-$port.txt" <<EOF
probe=COLLECTOR_HTTP_LISTENER_INSTANCE_RESPONSE
phase=$phase
observed_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
host=127.0.0.1
port=$port
method=GET
path=/v1/local-host/instance
http_status=200
server_result_code=LOCAL_HOST_INSTANCE
host_instance_id=$instance
listener_role=$observed_role
response_bytes=$bytes
cache_control=no-store
pragma=no-cache
authorizes_execution=false
proves_execution_success=false
retry_authorized=false
physical_evidence_status=NOT_RUN
EOF
}

pull_installed_apk() {
  local phase="$1" path_file="$2"
  mapfile -t paths < <(sed -n 's/^package://p' "$path_file")
  [[ "${#paths[@]}" -eq 1 ]] || fail "exactly one installed APK path required at $phase"
  [[ "${paths[0]}" == */base.apk ]] || fail "split/non-base APK detected at $phase"
  capture "installed-base-$phase-pull.txt" "$ADB_BIN" -s "$SERIAL" pull \
    "${paths[0]}" "$OUTPUT_DIR/installed-base-$phase.apk"
  [[ "$(sha256sum "$OUTPUT_DIR/installed-base-$phase.apk" | awk '{print $1}')" == "$EMBEDDED_APK_SHA" ]] || \
    fail "installed APK SHA drift at $phase"
  cmp -s "$APK_PATH" "$OUTPUT_DIR/installed-base-$phase.apk" || fail "installed APK byte drift at $phase"
}

write_manifest() {
  local name="$1"
  (
    cd "$OUTPUT_DIR"
    : >"$name"
    while IFS= read -r -d '' file; do
      local rel="${file#./}"
      [[ "$rel" == "$name" || "$rel" == "reviewer-attestation.json" ]] && continue
      sha256sum "$rel" >>"$name"
    done < <(find . -maxdepth 1 -type f -print0 | sort -z)
  )
}

[[ "$MODE" == "preflight" || "$MODE" == "finalize" ]] || fail "mode must be preflight or finalize"
[[ -n "$OUTPUT_DIR" ]] || fail "AURORA_EVIDENCE_DIR is required"
[[ "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "candidate SHA must be lowercase 40-hex"
[[ -f "$APK_PATH" ]] || fail "exact APK is required"
[[ -f "$ARTIFACT_ZIP" ]] || fail "artifact ZIP is required"
[[ -f "$ARTIFACT_METADATA" ]] || fail "artifact metadata is required"
[[ -d "$HOST_READINESS_DIR" && ! -L "$HOST_READINESS_DIR" ]] || fail "exact host readiness directory is required"
safe_value "AURORA_APK_VARIANT" "$APK_VARIANT"
safe_value "AURORA_OPERATOR" "$OPERATOR"
for command in "$ADB_BIN" sha256sum unzip cmp realpath curl node; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done

mapfile -t DEVICES < <("$ADB_BIN" devices | awk 'NR>1 && $2=="device" {print $1}')
[[ "${#DEVICES[@]}" -eq 1 ]] || fail "exactly one authorized self-ADB device is required; found ${#DEVICES[@]}"
SERIAL="${DEVICES[0]}"
QEMU="$(adb_shell getprop ro.kernel.qemu | tr -d '\r\n')"
[[ "$QEMU" != "1" && "$SERIAL" != emulator-* ]] || fail "physical tablet required"

read_kv "$ARTIFACT_METADATA" ARTIFACT_META
[[ "${#ARTIFACT_META[@]}" -eq 5 ]] || fail "artifact metadata must have exactly five keys"
PACKAGING_HEAD_SHA="$(required_kv ARTIFACT_META packaging_head_sha)"
PACKAGING_RUN_ID="$(required_kv ARTIFACT_META packaging_run_id)"
ARTIFACT_ID="$(required_kv ARTIFACT_META artifact_id)"
ARTIFACT_NAME="$(required_kv ARTIFACT_META artifact_name)"
ARTIFACT_ZIP_SHA256="$(required_kv ARTIFACT_META artifact_zip_sha256)"
[[ "$PACKAGING_HEAD_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "packaging head invalid"
[[ "$PACKAGING_RUN_ID" =~ ^[1-9][0-9]*$ ]] || fail "packaging run invalid"
[[ "$ARTIFACT_ID" =~ ^[1-9][0-9]*$ ]] || fail "artifact id invalid"
[[ "$ARTIFACT_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || fail "artifact name invalid"
[[ "$ARTIFACT_ZIP_SHA256" =~ ^[0-9a-f]{64}$ ]] || fail "artifact ZIP SHA invalid"
[[ "$(sha256sum "$ARTIFACT_ZIP" | awk '{print $1}')" == "$ARTIFACT_ZIP_SHA256" ]] || fail "artifact ZIP SHA mismatch"

ARTIFACT_TMP="$(mktemp -d)"
mapfile -t ZIP_ENTRIES < <(unzip -Z1 "$ARTIFACT_ZIP")
[[ "${#ZIP_ENTRIES[@]}" -eq 3 ]] || fail "artifact ZIP must contain exactly three files"
for entry in "${ZIP_ENTRIES[@]}"; do [[ "$entry" =~ ^[A-Za-z0-9._-]+$ ]] || fail "unsafe ZIP path"; done
unzip -q "$ARTIFACT_ZIP" -d "$ARTIFACT_TMP"
read_kv "$ARTIFACT_TMP/BUILD_IDENTITY.txt" BUILD_META
[[ "${#BUILD_META[@]}" -eq 19 ]] || fail "BUILD_IDENTITY must contain exactly nineteen keys"
[[ "$(required_kv BUILD_META artifact_purpose)" == "W15-J-DP5-physical-evidence-input" ]] || fail "artifact purpose drift"
[[ "$(required_kv BUILD_META source_candidate_sha)" == "$CANDIDATE_SHA" ]] || fail "candidate SHA not bound by artifact"
[[ "$(required_kv BUILD_META source_branch)" == "wave/15j-physical-device-integration-acceptance" ]] || fail "source branch drift"
HOST_SHA="$(required_kv BUILD_META paired_local_host_candidate_sha)"
MAIN_SHA="$(required_kv BUILD_META reconciled_main_parent_sha)"
[[ "$HOST_SHA" =~ ^[0-9a-f]{40}$ && "$MAIN_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "host/main SHA invalid"
[[ "$(required_kv BUILD_META packaging_head_sha)" == "$PACKAGING_HEAD_SHA" ]] || fail "packaging head drift"
[[ "$(required_kv BUILD_META packaging_run_id)" == "$PACKAGING_RUN_ID" ]] || fail "packaging run drift"
[[ "$(required_kv BUILD_META packaging_branch)" == "prototype/w15j-physical-apk-artifact" ]] || fail "packaging branch drift"
[[ "$(required_kv BUILD_META gateway_environment)" == "LOCAL" ]] || fail "gateway environment must be LOCAL"
[[ "$(required_kv BUILD_META device_gateway_port)" == "8080" ]] || fail "device gateway port drift"
[[ "$(required_kv BUILD_META bootstrap_port)" == "8081" ]] || fail "bootstrap port drift"
[[ "$(required_kv BUILD_META gateway_transport_scope)" == "$TRANSPORT_SCOPE" ]] || fail "artifact is not tablet-loopback bound"
[[ "$(required_kv BUILD_META apk_variant)" == "$APK_VARIANT" ]] || fail "APK variant drift"
[[ "$(required_kv BUILD_META package_id)" == "$PACKAGE_ID" ]] || fail "package id drift"
[[ "$(required_kv BUILD_META canonical_acceptance)" == "false" ]] || fail "artifact cannot claim acceptance"
[[ "$(required_kv BUILD_META physical_evidence_required)" == "true" ]] || fail "artifact must require physical evidence"
[[ "$(required_kv BUILD_META dp5_status)" == "INCOMPLETE" ]] || fail "artifact DP5 must remain incomplete"

read -r EMBEDDED_APK_SHA EMBEDDED_APK_NAME <"$ARTIFACT_TMP/SHA256SUMS.txt"
[[ "$EMBEDDED_APK_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "embedded APK SHA invalid"
[[ "$EMBEDDED_APK_NAME" =~ ^[A-Za-z0-9._-]+\.apk$ ]] || fail "embedded APK name invalid"
[[ -f "$ARTIFACT_TMP/$EMBEDDED_APK_NAME" ]] || fail "embedded APK missing"
[[ "$(sha256sum "$ARTIFACT_TMP/$EMBEDDED_APK_NAME" | awk '{print $1}')" == "$EMBEDDED_APK_SHA" ]] || fail "embedded APK checksum mismatch"
cmp -s "$APK_PATH" "$ARTIFACT_TMP/$EMBEDDED_APK_NAME" || fail "supplied APK differs from artifact APK"

HOST_FILES=(
  host-ready-announcement.txt
  host-listener-8080.txt host-listener-8080.txt.exit-code
  host-listener-8081.txt host-listener-8081.txt.exit-code
  host-health-8080.txt host-health-8080.txt.exit-code
  host-health-8081.txt host-health-8081.txt.exit-code
)
mapfile -t ACTUAL_HOST_FILES < <(find "$HOST_READINESS_DIR" -mindepth 1 -maxdepth 1 -type f -printf '%f\n' | sort)
mapfile -t EXPECTED_HOST_FILES < <(printf '%s\n' "${HOST_FILES[@]}" | sort)
[[ "${ACTUAL_HOST_FILES[*]}" == "${EXPECTED_HOST_FILES[*]}" ]] || fail "host readiness directory is not exact"
for file in "${HOST_FILES[@]}"; do [[ -s "$HOST_READINESS_DIR/$file" ]] || fail "host readiness file empty: $file"; done
for file in host-listener-8080.txt host-listener-8081.txt host-health-8080.txt host-health-8081.txt; do
  [[ "$(tr -d '\r\n' <"$HOST_READINESS_DIR/$file.exit-code")" == "0" ]] || fail "host readiness probe failed: $file"
done
read_kv "$HOST_READINESS_DIR/host-ready-announcement.txt" HOST_READY
[[ "${#HOST_READY[@]}" -eq 9 ]] || fail "host announcement must contain exactly nine keys"
[[ "$(required_kv HOST_READY host_candidate_sha)" == "$HOST_SHA" ]] || fail "host readiness SHA drift"
[[ "$(required_kv HOST_READY gateway_identity)" == "$GATEWAY_IDENTITY" ]] || fail "host readiness identity drift"
[[ "$(required_kv HOST_READY gateway_version)" == "git:$HOST_SHA" ]] || fail "host readiness version drift"
[[ "$(required_kv HOST_READY device_gateway_port)" == "8080" ]] || fail "host readiness 8080 drift"
[[ "$(required_kv HOST_READY bootstrap_port)" == "8081" ]] || fail "host readiness 8081 drift"
[[ "$(required_kv HOST_READY physical_evidence_status)" == "NOT_RUN" ]] || fail "host cannot claim physical PASS"
HOST_INSTANCE_ID="$(required_kv HOST_READY host_instance_id)"
[[ "$HOST_INSTANCE_ID" =~ ^whi_[0-9a-f]{64}$ ]] || fail "host instance id invalid"

if [[ "$MODE" == "preflight" ]]; then
  [[ ! -e "$OUTPUT_DIR" ]] || fail "preflight evidence directory must be new"
  mkdir -p "$OUTPUT_DIR"
  cp -- "$ARTIFACT_ZIP" "$OUTPUT_DIR/artifact.zip"
  cp -- "$ARTIFACT_METADATA" "$OUTPUT_DIR/artifact-metadata.txt"
  cp -- "$ARTIFACT_TMP/BUILD_IDENTITY.txt" "$OUTPUT_DIR/BUILD_IDENTITY.txt"
  cp -- "$ARTIFACT_TMP/SHA256SUMS.txt" "$OUTPUT_DIR/SHA256SUMS.txt"
  cp -- "$ARTIFACT_TMP/$EMBEDDED_APK_NAME" "$OUTPUT_DIR/candidate.apk"
  for file in "${HOST_FILES[@]}"; do cp -- "$HOST_READINESS_DIR/$file" "$OUTPUT_DIR/$file"; done
else
  [[ -d "$OUTPUT_DIR" ]] || fail "finalize requires existing evidence directory"
  for pair in \
    "$ARTIFACT_ZIP:artifact.zip" \
    "$ARTIFACT_METADATA:artifact-metadata.txt" \
    "$ARTIFACT_TMP/BUILD_IDENTITY.txt:BUILD_IDENTITY.txt" \
    "$ARTIFACT_TMP/SHA256SUMS.txt:SHA256SUMS.txt" \
    "$APK_PATH:candidate.apk"; do
    source="${pair%%:*}"; target="${pair#*:}"
    cmp -s "$source" "$OUTPUT_DIR/$target" || fail "finalize drift: $target"
  done
  for file in "${HOST_FILES[@]}"; do cmp -s "$HOST_READINESS_DIR/$file" "$OUTPUT_DIR/$file" || fail "host readiness drift: $file"; done
fi

MODEL="$(adb_shell getprop ro.product.model | tr -d '\r\n')"
MANUFACTURER="$(adb_shell getprop ro.product.manufacturer | tr -d '\r\n')"
PRODUCT="$(adb_shell getprop ro.product.name | tr -d '\r\n')"
API_LEVEL="$(adb_shell getprop ro.build.version.sdk | tr -d '\r\n')"
FINGERPRINT="$(adb_shell getprop ro.build.fingerprint | tr -d '\r\n')"
SERIAL_HASH="$(printf '%s' "$SERIAL" | sha256sum | awk '{print $1}')"
APK_SHA256="$(sha256sum "$APK_PATH" | awk '{print $1}')"
for value in "$MODEL" "$MANUFACTURER" "$PRODUCT" "$API_LEVEL" "$FINGERPRINT"; do [[ -n "$value" ]] || fail "empty device identity"; done

if [[ "$MODE" == "preflight" ]]; then
  capture adb-control-preflight.txt "$ADB_BIN" -s "$SERIAL" get-state
  capture adb-reverse-list-preflight.txt "$ADB_BIN" -s "$SERIAL" reverse --list
  assert_no_reverse_ports "$OUTPUT_DIR/adb-reverse-list-preflight.txt"
  probe_host preflight 8080 DEVICE_GATEWAY
  probe_host preflight 8081 BOOTSTRAP_EXCHANGE

  capture apk-install.txt "$ADB_BIN" -s "$SERIAL" install -r "$APK_PATH"
  capture package-path.txt adb_shell pm path "$PACKAGE_ID"
  pull_installed_apk preflight "$OUTPUT_DIR/package-path.txt"
  capture package-dump.txt adb_shell dumpsys package "$PACKAGE_ID"
  VERSION_CODE="$(sed -n 's/.*versionCode=\([0-9][0-9]*\).*/\1/p' "$OUTPUT_DIR/package-dump.txt" | head -n 1)"
  VERSION_NAME="$(sed -n 's/^[[:space:]]*versionName=\(.*\)$/\1/p' "$OUTPUT_DIR/package-dump.txt" | head -n 1)"
  [[ "$VERSION_CODE" == "$(required_kv BUILD_META version_code)" ]] || fail "installed versionCode drift"
  [[ "$VERSION_NAME" == "$(required_kv BUILD_META version_name)" ]] || fail "installed versionName drift"

  cat >"$OUTPUT_DIR/apk-identity.txt" <<EOF
candidate_sha=$CANDIDATE_SHA
application_id=$PACKAGE_ID
variant=$APK_VARIANT
version_code=$VERSION_CODE
version_name=$VERSION_NAME
apk_sha256=$APK_SHA256
EOF

  cat >"$OUTPUT_DIR/transport-metadata.txt" <<EOF
transport_scope=$TRANSPORT_SCOPE
control_plane=$CONTROL_PLANE
device_gateway_port=$DEVICE_GATEWAY_PORT
bootstrap_port=$BOOTSTRAP_PORT
adb_reverse_8080_8081=ABSENT_REQUIRED
EOF

  cat >"$OUTPUT_DIR/preflight-metadata.txt" <<EOF
collected_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
candidate_sha=$CANDIDATE_SHA
host_candidate_sha=$HOST_SHA
reconciled_main_sha=$MAIN_SHA
packaging_head_sha=$PACKAGING_HEAD_SHA
packaging_run_id=$PACKAGING_RUN_ID
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
gateway_version=git:$HOST_SHA
host_instance_id=$HOST_INSTANCE_ID
gateway_port=$DEVICE_GATEWAY_PORT
transport_scope=$TRANSPORT_SCOPE
control_plane=$CONTROL_PLANE
operator=$OPERATOR
EOF

  capture battery-before.txt adb_shell dumpsys battery
  capture meminfo-before.txt adb_shell dumpsys meminfo "$PACKAGE_ID"
  capture cpuinfo-before.txt adb_shell dumpsys cpuinfo
  capture storage-before.txt adb_shell du -sk "/data/user/0/$PACKAGE_ID"
  capture services-before.txt adb_shell dumpsys activity services "$PACKAGE_ID"
  adb_shell am force-stop "$PACKAGE_ID"
  sleep 1
  capture cold-start.txt adb_shell am start -W -n "$PACKAGE_ID/$ACTIVITY_CLASS"
  sleep 2
  capture warm-start.txt adb_shell am start -W -n "$PACKAGE_ID/$ACTIVITY_CLASS"
  capture meminfo-after-warm-start.txt adb_shell dumpsys meminfo "$PACKAGE_ID"
  adb_shell am force-stop "$PACKAGE_ID"
  sleep 1
  capture restart-start.txt adb_shell am start -W -n "$PACKAGE_ID/$ACTIVITY_CLASS"
  sleep 2
  capture meminfo-after-restart.txt adb_shell dumpsys meminfo "$PACKAGE_ID"
  capture cpuinfo-after-restart.txt adb_shell dumpsys cpuinfo
  capture storage-after-restart.txt adb_shell du -sk "/data/user/0/$PACKAGE_ID"
  capture services-after-restart.txt adb_shell dumpsys activity services "$PACKAGE_ID"

  cat >"$OUTPUT_DIR/acceptance-status.txt" <<EOF
DP4_STATUS=OPEN
DP5_STATUS=INCOMPLETE_UNTIL_SCENARIO_MATRIX_SIGNED
PHYSICAL_DEVICE_PREFLIGHT=PASS
CANDIDATE_SHA=$CANDIDATE_SHA
APK_SHA256=$APK_SHA256
GATEWAY_TRANSPORT_SCOPE=$TRANSPORT_SCOPE
CONTROL_PLANE=$CONTROL_PLANE
ADB_REVERSE_8080_8081=ABSENT_REQUIRED
REQUIRED_NEXT=Execute all 48 W15-J scenarios and the wake matrix inside this collector window, then finalize with the same tuple.
EOF
  write_manifest evidence-manifest-preflight.sha256
  COLLECTION_SUCCEEDED=1
  printf 'W15-J tablet-loopback preflight ready in %s\n' "$OUTPUT_DIR"
else
  [[ -f "$OUTPUT_DIR/preflight-metadata.txt" ]] || fail "preflight metadata missing"
  for binding in \
    "candidate_sha=$CANDIDATE_SHA" "host_candidate_sha=$HOST_SHA" "reconciled_main_sha=$MAIN_SHA" \
    "packaging_head_sha=$PACKAGING_HEAD_SHA" "packaging_run_id=$PACKAGING_RUN_ID" \
    "artifact_id=$ARTIFACT_ID" "artifact_name=$ARTIFACT_NAME" "artifact_zip_sha256=$ARTIFACT_ZIP_SHA256" \
    "apk_path_sha256=$APK_SHA256" "apk_variant=$APK_VARIANT" "serial_sha256=$SERIAL_HASH" \
    "manufacturer=$MANUFACTURER" "model=$MODEL" "product=$PRODUCT" "api_level=$API_LEVEL" \
    "build_fingerprint=$FINGERPRINT" "package_id=$PACKAGE_ID" "gateway_identity=$GATEWAY_IDENTITY" \
    "gateway_version=git:$HOST_SHA" "host_instance_id=$HOST_INSTANCE_ID" "gateway_port=$DEVICE_GATEWAY_PORT" \
    "transport_scope=$TRANSPORT_SCOPE" "control_plane=$CONTROL_PLANE" "operator=$OPERATOR"; do
    grep -Fxq "$binding" "$OUTPUT_DIR/preflight-metadata.txt" || fail "finalize tuple drift: $binding"
  done

  capture adb-control-finalize.txt "$ADB_BIN" -s "$SERIAL" get-state
  capture adb-reverse-list-before-finalize.txt "$ADB_BIN" -s "$SERIAL" reverse --list
  assert_no_reverse_ports "$OUTPUT_DIR/adb-reverse-list-before-finalize.txt"
  probe_host finalize 8080 DEVICE_GATEWAY
  probe_host finalize 8081 BOOTSTRAP_EXCHANGE

  capture battery-after.txt adb_shell dumpsys battery
  capture meminfo-after.txt adb_shell dumpsys meminfo "$PACKAGE_ID"
  capture cpuinfo-after.txt adb_shell dumpsys cpuinfo
  capture storage-after.txt adb_shell du -sk "/data/user/0/$PACKAGE_ID"
  capture services-after.txt adb_shell dumpsys activity services "$PACKAGE_ID"
  capture package-path-finalize.txt adb_shell pm path "$PACKAGE_ID"
  pull_installed_apk finalize "$OUTPUT_DIR/package-path-finalize.txt"
  capture package-dump-finalize.txt adb_shell dumpsys package "$PACKAGE_ID"
  FINAL_VERSION_CODE="$(sed -n 's/.*versionCode=\([0-9][0-9]*\).*/\1/p' "$OUTPUT_DIR/package-dump-finalize.txt" | head -n 1)"
  FINAL_VERSION_NAME="$(sed -n 's/^[[:space:]]*versionName=\(.*\)$/\1/p' "$OUTPUT_DIR/package-dump-finalize.txt" | head -n 1)"
  grep -Fxq "version_code=$FINAL_VERSION_CODE" "$OUTPUT_DIR/apk-identity.txt" || fail "versionCode drift at finalize"
  grep -Fxq "version_name=$FINAL_VERSION_NAME" "$OUTPUT_DIR/apk-identity.txt" || fail "versionName drift at finalize"
  cat >"$OUTPUT_DIR/apk-identity-finalize.txt" <<EOF
candidate_sha=$CANDIDATE_SHA
application_id=$PACKAGE_ID
variant=$APK_VARIANT
version_code=$FINAL_VERSION_CODE
version_name=$FINAL_VERSION_NAME
apk_sha256=$APK_SHA256
EOF

  capture adb-reverse-list-after-finalize.txt "$ADB_BIN" -s "$SERIAL" reverse --list
  assert_no_reverse_ports "$OUTPUT_DIR/adb-reverse-list-after-finalize.txt"

  cat >"$OUTPUT_DIR/finalize-metadata.txt" <<EOF
finalized_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
candidate_sha=$CANDIDATE_SHA
host_candidate_sha=$HOST_SHA
reconciled_main_sha=$MAIN_SHA
packaging_head_sha=$PACKAGING_HEAD_SHA
packaging_run_id=$PACKAGING_RUN_ID
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
gateway_version=git:$HOST_SHA
host_instance_id=$HOST_INSTANCE_ID
gateway_port=$DEVICE_GATEWAY_PORT
transport_scope=$TRANSPORT_SCOPE
control_plane=$CONTROL_PLANE
operator=$OPERATOR
adb_reverse_8080_8081=ABSENT_VERIFIED
EOF

  cat >"$OUTPUT_DIR/acceptance-status.txt" <<EOF
DP4_STATUS=OPEN
DP5_STATUS=INCOMPLETE_UNTIL_SCENARIO_MATRIX_SIGNED
PHYSICAL_DEVICE_PREFLIGHT=PASS
PHYSICAL_WINDOW_FINALIZED=PASS
CANDIDATE_SHA=$CANDIDATE_SHA
APK_SHA256=$APK_SHA256
GATEWAY_TRANSPORT_SCOPE=$TRANSPORT_SCOPE
CONTROL_PLANE=$CONTROL_PLANE
ADB_REVERSE_8080_8081=ABSENT_VERIFIED
REQUIRED_NEXT=Independent review of the complete 48-scenario dossier, wake matrix, threats/resources and Risk Gates A-D. Collector output alone cannot close DP5.
EOF
  write_manifest evidence-manifest.sha256
  COLLECTION_SUCCEEDED=1
  printf 'W15-J tablet-loopback window finalized in %s; no adb reverse mapping was used.\n' "$OUTPUT_DIR"
fi
