#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora W15-J DP5 containment control failed: %s\n' "$*" >&2
  exit 2
}

secure_regular_file() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" ]] || return 1
  [[ "$(stat -c '%a' "$path")" == "600" ]] || return 1
  [[ "$(stat -c '%u' "$path")" == "$(id -u)" ]] || return 1
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for bin in proot-distro git curl jq; do command -v "$bin" >/dev/null 2>&1 || fail "$bin is missing"; done

COMMAND="${1:-}"
case "$COMMAND" in
  ACTIVATE_KILL_SWITCH|REQUEST_CANCELLATION|BEGIN_IN_FLIGHT|END_IN_FLIGHT|DEPENDENCY_UNAVAILABLE|DEPENDENCY_HEALTHY) ;;
  DEACTIVATE_KILL_SWITCH_VALIDATED)
    [[ "${AURORA_DP5_RECOVERY_VALIDATED:-}" == "YES" ]] || fail "deactivation requires AURORA_DP5_RECOVERY_VALIDATED=YES"
    ;;
  CLEAR_CANCELLATION_RECONCILED)
    [[ "${AURORA_DP5_RECONCILIATION_COMPLETED:-}" == "YES" ]] || fail "clear requires AURORA_DP5_RECONCILIATION_COMPLETED=YES"
    ;;
  *) fail "unsupported command" ;;
esac

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
HOST_DIR="$DEVLAB_ROOT/worktrees/host"
STATE_DIR="$DEVLAB_ROOT/state"
WORKTREE_STATE="$STATE_DIR/worktrees.txt"
DB_ENV="$STATE_DIR/postgres.env"
PROVIDER="$DEVLAB_ROOT/config/trusted-w15j-provider.mjs"
MATERIAL="$DEVLAB_ROOT/config/w15j-dp5-material.json"
READINESS_POINTER="$STATE_DIR/last-readiness-termux.txt"
NODE_VERSION="22.16.0"
NPM_VERSION="10.9.2"

for path in "$WORKTREE_STATE" "$DB_ENV" "$PROVIDER" "$MATERIAL" "$READINESS_POINTER"; do
  secure_regular_file "$path" || fail "required state is missing or insecure: $path"
done

EXPECTED_HOST_SHA="$(awk -F= '$1 == "host" {print $2}' "$WORKTREE_STATE")"
[[ "$EXPECTED_HOST_SHA" =~ ^[a-f0-9]{40}$ ]] || fail "host SHA is malformed"
[[ "$(git -C "$HOST_DIR" rev-parse HEAD)" == "$EXPECTED_HOST_SHA" ]] || fail "host worktree drifted"
[[ -z "$(git -C "$HOST_DIR" status --porcelain)" ]] || fail "host worktree is dirty"

READINESS_DIR="$(tr -d '\r\n' <"$READINESS_POINTER")"
[[ "$READINESS_DIR" == "$DEVLAB_ROOT"/host-readiness/* ]] || fail "readiness pointer escaped DevLab"
HOST_READY="$READINESS_DIR/host-ready-announcement.txt"
secure_regular_file "$HOST_READY" || fail "host readiness is missing or insecure"
HOST_INSTANCE_ID="$(sed -n 's/^host_instance_id=//p' "$HOST_READY")"
[[ "$HOST_INSTANCE_ID" =~ ^whi_[a-f0-9]{64}$ ]] || fail "host instance id is malformed"

for port in 8080 8081; do
  BODY="$(curl --fail --silent --show-error --max-time 3 "http://127.0.0.1:$port/v1/local-host/instance")" || fail "host listener $port unavailable"
  [[ "$(jq -r '.hostInstanceId' <<<"$BODY")" == "$HOST_INSTANCE_ID" ]] || fail "host instance drift on $port"
  [[ "$(jq -r '.authorizesExecution' <<<"$BODY")" == "false" ]] || fail "listener illegally claims authority"
done

proot-distro login debian \
  --bind "$DEVLAB_ROOT:/aurora-devlab" \
  -- bash -lc "
set -euo pipefail
export HOME=/home/aurora
export NVM_DIR=/home/aurora/.nvm
source \"\$NVM_DIR/nvm.sh\"
nvm use $NODE_VERSION >/dev/null
[[ \"\$(node --version)\" == \"v$NODE_VERSION\" ]]
[[ \"\$(npm --version)\" == \"$NPM_VERSION\" ]]
cd /aurora-devlab/worktrees/host
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0=safe.directory
export GIT_CONFIG_VALUE_0=/aurora-devlab/worktrees/host
[[ \"\$(git rev-parse HEAD)\" == '$EXPECTED_HOST_SHA' ]]
[[ -z \"\$(git status --porcelain)\" ]]
set -a
source /aurora-devlab/state/postgres.env
set +a
export AURORA_W15J_DP5_MATERIAL=/aurora-devlab/config/w15j-dp5-material.json
export AURORA_DP5_CONTROL_COMMAND='$COMMAND'
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';

const command = process.env.AURORA_DP5_CONTROL_COMMAND;
const material = JSON.parse(readFileSync('/aurora-devlab/config/w15j-dp5-material.json', 'utf8'));
const provider = await import('/aurora-devlab/config/trusted-w15j-provider.mjs');
const provided = await provider.createW15JLocalPhysicalHostOperatorInput();

const { PsqlW03SyncExecutor } = await import(
  '/aurora-devlab/worktrees/host/services/mobile-gateway/dist/physical-host/w03-postgres-reservations.js'
);
const { W03PostgresCurrentContainmentStateSource } = await import(
  '/aurora-devlab/worktrees/host/services/mobile-gateway/dist/physical-host/w03-containment-state.js'
);
const { W03PostgresContainmentStateStore } = await import(
  '/aurora-devlab/worktrees/host/services/mobile-gateway/dist/physical-host/w03-containment-state-write.js'
);
const { W03PostgresHalfOpenProbeLease } = await import(
  '/aurora-devlab/worktrees/host/services/mobile-gateway/dist/physical-host/w03-half-open-probe-lease.js'
);

if (typeof provided?.dependencies?.createContainmentLifecycle !== 'function') {
  throw new Error('CONTAINMENT_FACTORY_UNAVAILABLE');
}
const sql = new PsqlW03SyncExecutor({ databaseUrl: provided.databaseUrl });
const source = new W03PostgresCurrentContainmentStateSource(sql);
const store = new W03PostgresContainmentStateStore(sql);
const probe = new W03PostgresHalfOpenProbeLease(sql);
const lifecycle = provided.dependencies.createContainmentLifecycle(source, store, probe);
const tenantId = material.tenantId;
const circuitKey = material.circuitKey;
const now = new Date().toISOString();
const base = { tenantId, circuitKey };
let result;

switch (command) {
  case 'ACTIVATE_KILL_SWITCH':
    result = lifecycle.transitionKillSwitch({ ...base, changedAt: now, command: 'ACTIVATE', recoveryGate: 'NOT_REQUIRED' });
    break;
  case 'DEACTIVATE_KILL_SWITCH_VALIDATED':
    result = lifecycle.transitionKillSwitch({ ...base, changedAt: now, command: 'DEACTIVATE', recoveryGate: 'VALIDATED' });
    break;
  case 'REQUEST_CANCELLATION':
    result = lifecycle.transitionOperational({ ...base, observedAt: now, command: 'REQUEST_CANCELLATION', authorizesExecution: false });
    break;
  case 'CLEAR_CANCELLATION_RECONCILED':
    result = lifecycle.transitionOperational({ ...base, observedAt: now, command: 'CLEAR_CANCELLATION', reconciliationGate: 'COMPLETED', authorizesExecution: false });
    break;
  case 'BEGIN_IN_FLIGHT':
  case 'END_IN_FLIGHT':
    result = lifecycle.transitionOperational({ ...base, observedAt: now, command, authorizesExecution: false });
    break;
  case 'DEPENDENCY_UNAVAILABLE':
  case 'DEPENDENCY_HEALTHY': {
    const health = command === 'DEPENDENCY_UNAVAILABLE' ? 'UNAVAILABLE' : 'HEALTHY';
    result = lifecycle.transitionOperational({
      ...base,
      observedAt: now,
      command: 'UPDATE_DEPENDENCY_HEALTH',
      observation: {
        kind: 'SERVER_DEPENDENCY_HEALTH_OBSERVATION',
        ...base,
        observedAt: now,
        health,
        authorizesExecution: false,
      },
      authorizesExecution: false,
    });
    break;
  }
  default:
    throw new Error('CONTROL_COMMAND_UNREACHABLE');
}

const sanitized = {
  command,
  ok: result?.ok === true,
  status: typeof result?.status === 'string' ? result.status : undefined,
  disposition: typeof result?.disposition === 'string' ? result.disposition : undefined,
  code: typeof result?.code === 'string' ? result.code : undefined,
  version: Number.isSafeInteger(result?.version) ? result.version : undefined,
  authorizesExecution: result?.authorizesExecution === true,
  provesExecutionSuccess: result?.provesExecutionSuccess === true,
  retryAuthorized: result?.retryAuthorized === true,
};
if (sanitized.authorizesExecution || sanitized.provesExecutionSuccess || sanitized.retryAuthorized) {
  throw new Error('CONTROL_RESULT_ILLEGAL_AUTHORITY');
}
process.stdout.write(JSON.stringify(sanitized) + '\n');
NODE
"

printf 'W15J_DP5_CONTAINMENT_CONTROL=PASS_NON_AUTHORITATIVE\n'
printf 'host_instance_id=%s\n' "$HOST_INSTANCE_ID"
printf 'command=%s\n' "$COMMAND"
printf 'authorizes_execution=false\nproves_execution_success=false\nretry_authorized=false\nphysical_acceptance=false\n'
