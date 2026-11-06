#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora DP5 supervisor readiness export failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
command -v curl >/dev/null 2>&1 || fail "curl is missing"
command -v jq >/dev/null 2>&1 || fail "jq is missing"
command -v node >/dev/null 2>&1 || fail "node is missing"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
STATE="$DEVLAB_ROOT/state"
READINESS_PARENT="$DEVLAB_ROOT/host-readiness"
CLIENT="$SCRIPT_DIR/dp5-host-supervisor-client.mjs"
PIDFILE="$STATE/dp5-host-supervisor.pid"

STATUS="$(node "$CLIENT" status)"
[[ "$(jq -r '.ok' <<<"$STATUS")" == "true" ]] || fail "supervisor status unavailable"
[[ "$(jq -r '.value.active' <<<"$STATUS")" == "true" ]] || fail "supervisor host is inactive"
HOST_SHA="$(jq -r '.value.hostSha' <<<"$STATUS")"
HOST_INSTANCE_ID="$(jq -r '.value.hostInstanceId' <<<"$STATUS")"
[[ "$HOST_SHA" =~ ^[a-f0-9]{40}$ ]] || fail "host SHA malformed"
[[ "$HOST_INSTANCE_ID" =~ ^whi_[a-f0-9]{64}$ ]] || fail "host instance id malformed"

[[ -f "$PIDFILE" && ! -L "$PIDFILE" ]] || fail "supervisor pidfile missing"
PID="$(tr -d '\r\n' < "$PIDFILE")"
[[ "$PID" =~ ^[1-9][0-9]*$ ]] || fail "supervisor pid malformed"
kill -0 "$PID" 2>/dev/null || fail "supervisor process is not alive"

probe_instance() {
  local port="$1" role="$2" out="$3"
  local body
  body="$(curl --fail --silent --show-error --max-time 3 "http://127.0.0.1:$port/v1/local-host/instance")" ||     fail "instance probe failed on $port"
  [[ "$(jq -r '.kind' <<<"$body")" == "LOCAL_HOST_INSTANCE" ]] || fail "instance kind drift on $port"
  [[ "$(jq -r '.hostInstanceId' <<<"$body")" == "$HOST_INSTANCE_ID" ]] || fail "host instance drift on $port"
  [[ "$(jq -r '.listenerRole' <<<"$body")" == "$role" ]] || fail "listener role drift on $port"
  [[ "$(jq -r '.authorizesExecution' <<<"$body")" == "false" ]] || fail "authority drift on $port"
  printf '%s\n'     "probe=HTTP_LISTENER_INSTANCE_RESPONSE"     "host=127.0.0.1"     "port=$port"     "method=GET"     "path=/v1/local-host/instance"     "http_status=200"     "server_result_code=LOCAL_HOST_INSTANCE"     "host_instance_id=$HOST_INSTANCE_ID"     "listener_role=$role"     "authorizes_execution=false"     "physical_evidence_status=NOT_RUN" > "$out"
}

probe_health() {
  local port="$1" path="$2" field="$3" code="$4" out="$5"
  local body status
  body="$(mktemp)"
  status="$(curl --silent --show-error --max-time 3 -o "$body" -w '%{http_code}' "http://127.0.0.1:$port$path")" || {
    rm -f "$body"
    fail "health probe failed on $port"
  }
  [[ "$status" == "405" ]] || { rm -f "$body"; fail "unexpected health status on $port: $status"; }
  [[ "$(jq -r ".$field.code" "$body")" == "$code" ]] || { rm -f "$body"; fail "health code drift on $port"; }
  printf '%s\n'     "probe=HTTP_ROUTE_HEALTH_RESPONSE"     "host=127.0.0.1"     "port=$port"     "method=GET"     "path=$path"     "http_status=405"     "server_error_code=$code"     "authorizes_execution=false"     "physical_evidence_status=NOT_RUN" > "$out"
  rm -f "$body"
}

mkdir -p "$READINESS_PARENT" "$STATE"
chmod 700 "$READINESS_PARENT" "$STATE"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-supervisor-$PID"
DIR="$READINESS_PARENT/$RUN_ID"
[[ ! -e "$DIR" ]] || fail "readiness path already exists"
mkdir -m 700 "$DIR"

probe_instance 8080 DEVICE_GATEWAY "$DIR/host-listener-8080.txt"
probe_instance 8081 BOOTSTRAP_EXCHANGE "$DIR/host-listener-8081.txt"
probe_health 8080 /v1/gateway/sessions/open transportError METHOD_NOT_ALLOWED "$DIR/host-health-8080.txt"
probe_health 8081 /v1/gateway/bootstrap/exchange bootstrapError METHOD_NOT_ALLOWED "$DIR/host-health-8081.txt"

for f in   host-listener-8080.txt host-listener-8081.txt   host-health-8080.txt host-health-8081.txt; do
  printf '0\n' > "$DIR/$f.exit-code"
done

STARTED_AT_UTC="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
cat > "$DIR/host-ready-announcement.txt" <<EOF2
host_candidate_sha=$HOST_SHA
gateway_identity=aurora-w15j-local-host
gateway_version=git:$HOST_SHA
host_instance_id=$HOST_INSTANCE_ID
started_at_utc=$STARTED_AT_UTC
process_id=$PID
device_gateway_port=8080
bootstrap_port=8081
physical_evidence_status=NOT_RUN
EOF2

mapfile -t FILES < <(find "$DIR" -mindepth 1 -maxdepth 1 -type f -printf '%f\n' | sort)
[[ "${#FILES[@]}" -eq 9 ]] || fail "readiness file count drift"
chmod 600 "$DIR"/*
printf '%s\n' "$DIR" > "$STATE/last-readiness-termux.txt"
chmod 600 "$STATE/last-readiness-termux.txt"

printf 'DP5_SUPERVISOR_READINESS=READY_NOT_AUTHORITY\n'
printf 'host_instance_id=%s\n' "$HOST_INSTANCE_ID"
printf 'readiness_dir=%s\n' "$DIR"
printf 'authorizes_execution=false\n'
printf 'physical_acceptance=false\n'
