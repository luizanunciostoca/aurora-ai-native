#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora Tablet-Only real host start doctor failed: %s\n' "$*" >&2
  exit 2
}

secure_regular_file() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" ]] || return 1
  [[ "$(stat -c '%a' "$path")" == "600" ]] || return 1
  [[ "$(stat -c '%u' "$path")" == "$(id -u)" ]] || return 1
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
command -v proot-distro >/dev/null 2>&1 || fail "proot-distro is missing"
command -v git >/dev/null 2>&1 || fail "git is missing"

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
HOST_DIR="$DEVLAB_ROOT/worktrees/host"
STATE_DIR="$DEVLAB_ROOT/state"
WORKTREE_STATE="$STATE_DIR/worktrees.txt"
DB_ENV="$STATE_DIR/postgres.env"
PROVIDER="$DEVLAB_ROOT/config/trusted-w15j-provider.mjs"
MATERIAL="$DEVLAB_ROOT/config/w15j-dp5-material.json"
NODE_VERSION="22.16.0"
NPM_VERSION="10.9.2"

[[ -d "$HOST_DIR/.git" || -f "$HOST_DIR/.git" ]] || fail "host worktree missing"
for path in "$WORKTREE_STATE" "$DB_ENV" "$PROVIDER" "$MATERIAL"; do
  secure_regular_file "$path" || fail "required state is missing or insecure: $path"
done

EXPECTED_HOST_SHA="$(awk -F= '$1 == "host" {print $2}' "$WORKTREE_STATE")"
[[ "$EXPECTED_HOST_SHA" =~ ^[a-f0-9]{40}$ ]] || fail "host SHA in worktree state is malformed"
[[ "$(git -C "$HOST_DIR" rev-parse HEAD)" == "$EXPECTED_HOST_SHA" ]] || fail "host worktree drifted"
[[ -z "$(git -C "$HOST_DIR" status --porcelain)" ]] || fail "host worktree is dirty"

proot-distro login debian \
  --bind "$DEVLAB_ROOT:/aurora-devlab" \
  -- bash -lc "
set -euo pipefail
export HOME=/home/aurora
export NVM_DIR=/home/aurora/.nvm
# shellcheck disable=SC1090
source \"\$NVM_DIR/nvm.sh\"
nvm use $NODE_VERSION >/dev/null
[[ \"\$(node --version)\" == \"v$NODE_VERSION\" ]]
[[ \"\$(npm --version)\" == \"$NPM_VERSION\" ]]
[[ \"\$(id -u)\" == \"0\" ]]
[[ \"\$(stat -c '%u' /usr/bin/git)\" == \"0\" ]]
command -v psql >/dev/null 2>&1 || { echo 'W15J_HOST_REAL_START_DOCTOR=FAIL code=PSQL_MISSING'; exit 21; }
cd /aurora-devlab/worktrees/host

export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0=safe.directory
export GIT_CONFIG_VALUE_0=/aurora-devlab/worktrees/host
[[ \"\$(git rev-parse HEAD)\" == '$EXPECTED_HOST_SHA' ]]
[[ -z \"\$(git status --porcelain)\" ]]

set -a
# shellcheck disable=SC1091
source /aurora-devlab/state/postgres.env
set +a
export AURORA_W15J_DP5_MATERIAL=/aurora-devlab/config/w15j-dp5-material.json
export AURORA_W15J_PROVIDER_MODULE=/aurora-devlab/config/trusted-w15j-provider.mjs

if ! [[ \"\$(psql --no-psqlrc --quiet --tuples-only --no-align \"\$AURORA_W15J_DATABASE_URL\" -c 'SELECT 1' 2>/dev/null | tr -d '[:space:]')\" == '1' ]]; then
  echo 'W15J_HOST_REAL_START_DOCTOR=FAIL code=DB_UNREACHABLE'
  exit 22
fi
required=\"\$(psql --no-psqlrc --quiet --tuples-only --no-align \"\$AURORA_W15J_DATABASE_URL\" -c \"SELECT ((to_regclass('public.w03_idempotency_key') IS NOT NULL)::int + (to_regclass('public.w03_execution_attempt_quota') IS NOT NULL)::int + (to_regclass('public.w03_execution_containment') IS NOT NULL)::int);\" 2>/dev/null | tr -d '[:space:]')\"
[[ \"\$required\" == '3' ]] || { echo 'W15J_HOST_REAL_START_DOCTOR=FAIL code=W03_SCHEMA_INCOMPLETE'; exit 23; }

for built in \
  services/mobile-gateway/dist/physical-host/local-physical-host-operator.js \
  services/mobile-gateway/dist/physical-host/local-physical-host-runner.js \
  services/mobile-gateway/dist/physical-host/w03-physical-execution-state-stage.js; do
  [[ -f \"\$built\" ]] || { echo 'W15J_HOST_REAL_START_DOCTOR=FAIL code=RUNTIME_NOT_BUILT'; exit 24; }
done

node --input-type=module <<'NODE'
import { spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { request } from 'node:http';

function fail(code, status = 30) {
  process.stdout.write('W15J_HOST_REAL_START_DOCTOR=FAIL code=' + code + '\n');
  process.exit(status);
}

function getJson(port, path) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, method: 'GET', path, headers: { accept: 'application/json' }, timeout: 2000 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 4096) req.destroy(new Error('oversize'));
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.once('timeout', () => req.destroy(new Error('timeout')));
    req.once('error', reject);
    req.end();
  });
}

function portOccupied(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    const done = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(700);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

let provider;
try {
  provider = await import('/aurora-devlab/config/trusted-w15j-provider.mjs');
  if (typeof provider.createW15JLocalPhysicalHostOperatorInput !== 'function') fail('PROVIDER_EXPORT_INVALID', 31);
} catch {
  fail('PROVIDER_IMPORT_REJECTED', 31);
}

const operatorModule = await import(
  '/aurora-devlab/worktrees/host/services/mobile-gateway/dist/physical-host/local-physical-host-operator.js'
);
const runnerModule = await import(
  '/aurora-devlab/worktrees/host/services/mobile-gateway/dist/physical-host/local-physical-host-runner.js'
);
const stagerModule = await import(
  '/aurora-devlab/worktrees/host/services/mobile-gateway/dist/physical-host/w03-physical-execution-state-stage.js'
);

let captured;
try {
  await operatorModule.startW15JLocalPhysicalHostOperator(provider, {
    startRunner: async (input) => {
      captured = input;
      return Object.freeze({ stop: async () => {} });
    },
  });
} catch {
  fail('PROVIDER_OR_OPERATOR_INPUT_REJECTED', 32);
}
if (captured === undefined || captured.executionStateSeed === undefined) {
  fail('OPERATOR_INPUT_INCOMPLETE', 33);
}

const rollbackSql = {
  query({ sql, variables }) {
    const args = [
      '--no-psqlrc',
      '--quiet',
      '--tuples-only',
      '--no-align',
      '--field-separator',
      '\t',
      '--set',
      'ON_ERROR_STOP=1',
    ];
    for (const [key, value] of Object.entries(variables)) args.push('--set', key + '=' + value);
    args.push('--command', 'BEGIN;\n' + sql + ';\nROLLBACK;');
    const result = spawnSync('psql', args, {
      encoding: 'utf8',
      env: { ...process.env, PGDATABASE: process.env.AURORA_W15J_DATABASE_URL },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    });
    if (result.status !== 0 || result.signal !== null) throw new Error('psql rollback dry-run failed');
    return result.stdout;
  },
};

const stager = new stagerModule.W03PostgresPhysicalExecutionStateStager(rollbackSql);
const seedDryRun = stager.stage(captured.executionStateSeed);
if (!seedDryRun.ok || seedDryRun.disposition !== 'STAGED') {
  fail('W03_SEED_REAL_DRY_RUN_REJECTED', 34);
}

if (await portOccupied(8080)) fail('FIXED_PORT_8080_OCCUPIED', 35);
if (await portOccupied(8081)) fail('FIXED_PORT_8081_OCCUPIED', 36);

let handle;
try {
  handle = await runnerModule.startW15JLocalPhysicalHostRunner({
    ...captured,
    host: Object.freeze({ ...captured.host, gatewayPort: 8080, bootstrapPort: 8081 }),
    executionStateSeed: undefined,
    hooks: {
      emit: () => {},
      registerSignal: () => () => {},
      cleanupFailed: () => {},
    },
  });
  const gateway = await getJson(8080, '/v1/local-host/instance');
  const bootstrap = await getJson(8081, '/v1/local-host/instance');
  if (
    gateway.status !== 200 ||
    bootstrap.status !== 200 ||
    gateway.body?.hostInstanceId !== handle.hostInstanceId ||
    bootstrap.body?.hostInstanceId !== handle.hostInstanceId ||
    gateway.body?.listenerRole !== 'DEVICE_GATEWAY' ||
    bootstrap.body?.listenerRole !== 'BOOTSTRAP_EXCHANGE'
  ) {
    fail('FIXED_PORT_PROBE_REJECTED', 37);
  }
} catch {
  fail('FIXED_PORT_COMPOSITION_REJECTED', 38);
} finally {
  try {
    await handle?.stop();
  } catch {
    fail('FIXED_PORT_CLEANUP_FAILED', 39);
  }
}

process.stdout.write('root_context=PASS\n');
process.stdout.write('postgres_connectivity=PASS\n');
process.stdout.write('w03_schema=PASS\n');
process.stdout.write('provider_operator_input=PASS\n');
process.stdout.write('w03_seed_real_dry_run=PASS\n');
process.stdout.write('fixed_ports_available=PASS\n');
process.stdout.write('fixed_port_composition=PASS\n');
process.stdout.write('W15J_HOST_REAL_START_DOCTOR=PASS_SOFTWARE_ONLY\n');
process.stdout.write('persists_w03_state=false\nexecutes_physical_effect=false\nauthorizes_execution=false\nproves_execution_success=false\nretry_authorized=false\nphysical_acceptance=false\n');
NODE
"
