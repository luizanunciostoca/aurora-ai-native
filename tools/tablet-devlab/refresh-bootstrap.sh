#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora W15-J bootstrap refresh failed: %s\n' "$*" >&2
  exit 2
}

secure_regular_file() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" ]] || return 1
  [[ "$(stat -c '%a' "$path")" == "600" ]] || return 1
  [[ "$(stat -c '%u' "$path")" == "$(id -u)" ]] || return 1
}

exact_value() {
  local path="$1" key="$2"
  local count value
  count="$(grep -c "^${key}=" "$path" || true)"
  [[ "$count" == "1" ]] || fail "expected exactly one $key entry in $path"
  value="$(sed -n "s/^${key}=//p" "$path")"
  [[ -n "$value" ]] || fail "$key is empty in $path"
  printf '%s\n' "$value"
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in curl jq kill stat grep sed date sleep; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"
done

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
STATE_DIR="$DEVLAB_ROOT/state"
READINESS_POINTER="$STATE_DIR/last-readiness-termux.txt"
REFRESH_FILE="$STATE_DIR/w15j-bootstrap-refresh.json"

secure_regular_file "$READINESS_POINTER" || fail "secure host readiness pointer is missing; start the host with run-host.sh"
READINESS_DIR="$(tr -d '\r\n' <"$READINESS_POINTER")"
[[ "$READINESS_DIR" == "$DEVLAB_ROOT"/host-readiness/* ]] || fail "host readiness pointer escaped the DevLab root"
[[ -d "$READINESS_DIR" && ! -L "$READINESS_DIR" ]] || fail "host readiness directory is missing or unsafe"
HOST_READY="$READINESS_DIR/host-ready-announcement.txt"
secure_regular_file "$HOST_READY" || fail "host-ready announcement is missing or insecure"

HOST_PID="$(exact_value "$HOST_READY" process_id)"
HOST_INSTANCE_ID="$(exact_value "$HOST_READY" host_instance_id)"
[[ "$HOST_PID" =~ ^[1-9][0-9]*$ ]] || fail "host process id is malformed"
[[ "$HOST_INSTANCE_ID" =~ ^whi_[0-9a-f]{64}$ ]] || fail "host instance id is malformed"
kill -0 "$HOST_PID" 2>/dev/null || fail "recorded host process is no longer alive"

INSTANCE_8080="$(curl --fail --silent --show-error --max-time 3 http://127.0.0.1:8080/v1/local-host/instance)" || \
  fail "device-gateway listener is unavailable"
INSTANCE_8081="$(curl --fail --silent --show-error --max-time 3 http://127.0.0.1:8081/v1/local-host/instance)" || \
  fail "bootstrap listener is unavailable"
for body in "$INSTANCE_8080" "$INSTANCE_8081"; do
  [[ "$(jq -er '.kind' <<<"$body")" == "LOCAL_HOST_INSTANCE" ]] || fail "unexpected host instance response"
  [[ "$(jq -er '.hostInstanceId' <<<"$body")" == "$HOST_INSTANCE_ID" ]] || fail "live host instance does not match readiness evidence"
  [[ "$(jq -er '.authorizesExecution' <<<"$body")" == "false" ]] || fail "host instance route illegally claims execution authority"
  [[ "$(jq -er '.provesExecutionSuccess' <<<"$body")" == "false" ]] || fail "host instance route illegally claims execution success"
  [[ "$(jq -er '.retryAuthorized' <<<"$body")" == "false" ]] || fail "host instance route illegally claims retry authority"
done
[[ "$(jq -er '.listenerRole' <<<"$INSTANCE_8080")" == "DEVICE_GATEWAY" ]] || fail "8080 listener role drifted"
[[ "$(jq -er '.listenerRole' <<<"$INSTANCE_8081")" == "BOOTSTRAP_EXCHANGE" ]] || fail "8081 listener role drifted"

if [[ -e "$REFRESH_FILE" ]]; then
  secure_regular_file "$REFRESH_FILE" || fail "existing bootstrap refresh output is insecure"
  rm -f -- "$REFRESH_FILE"
fi

kill -USR2 "$HOST_PID" || fail "could not signal the live host"

for _ in $(seq 1 50); do
  [[ -e "$REFRESH_FILE" ]] && break
  sleep 0.1
done
secure_regular_file "$REFRESH_FILE" || fail "no secure refresh output arrived; the provider principal may have expired"

jq -e \
  --arg host "$HOST_INSTANCE_ID" \
  '
    (keys | sort) == ([
      "authorizesExecution",
      "bootstrapExpiresAtMs",
      "bootstrapReference",
      "hostInstanceId",
      "kind",
      "physicalEvidenceStatus",
      "provesExecutionSuccess",
      "retryAuthorized"
    ] | sort) and
    .kind == "W15J_LOCAL_BOOTSTRAP_REFRESH_READY" and
    .hostInstanceId == $host and
    (.bootstrapReference | type == "string" and test("^gbr_[A-Za-z0-9_-]{43,128}$")) and
    (.bootstrapExpiresAtMs | type == "number" and floor == . and . > 0) and
    .physicalEvidenceStatus == "NOT_RUN" and
    .authorizesExecution == false and
    .provesExecutionSuccess == false and
    .retryAuthorized == false
  ' "$REFRESH_FILE" >/dev/null || fail "refresh output failed schema or authority validation"

BOOTSTRAP_REFERENCE="$(jq -er '.bootstrapReference' "$REFRESH_FILE")"
EXPIRES_AT_MS="$(jq -er '.bootstrapExpiresAtMs' "$REFRESH_FILE")"
NOW_MS="$(( $(date +%s) * 1000 ))"
REMAINING_MS="$(( EXPIRES_AT_MS - NOW_MS ))"
(( REMAINING_MS > 30_000 )) || fail "fresh bootstrap has less than 30 seconds remaining"
REMAINING_SECONDS="$(( REMAINING_MS / 1000 ))"

rm -f -- "$REFRESH_FILE"

cat <<EOF
W15J_BOOTSTRAP_REFRESH=READY_NOT_ACCEPTED
host_instance_id=$HOST_INSTANCE_ID
bootstrap_reference=$BOOTSTRAP_REFERENCE
expires_in_seconds=$REMAINING_SECONDS
authorizes_execution=false
proves_execution_success=false
retry_authorized=false
physical_acceptance=false

Paste only bootstrap_reference into Aurora immediately. This refresh does not grant authority or physical acceptance.
EOF
