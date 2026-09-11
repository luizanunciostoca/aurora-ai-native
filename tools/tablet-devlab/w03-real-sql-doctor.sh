#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora Tablet-Only W03 real SQL doctor failed: %s\n' "$*" >&2
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
command -v psql >/dev/null 2>&1 || { echo 'W15J_W03_REAL_SQL_DOCTOR=FAIL code=PSQL_MISSING'; exit 21; }

for built in \
  services/mobile-gateway/dist/physical-host/local-physical-host-operator.js \
  services/mobile-gateway/dist/physical-host/w03-physical-execution-state-stage.js; do
  [[ -f \"\$built\" ]] || { echo 'W15J_W03_REAL_SQL_DOCTOR=FAIL code=RUNTIME_NOT_BUILT'; exit 22; }
done

node --input-type=module <<'NODE'
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const COMMAND_TAGS = new Set(['BEGIN', 'ROLLBACK', 'COMMIT']);
let lastSqlFailure = null;

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function classifyProcess(result) {
  if (result?.error?.code === 'ETIMEDOUT') return 'PROCESS_TIMEOUT';
  if (result?.error) return 'PROCESS_SPAWN_ERROR';
  if (result?.signal) return 'PROCESS_SIGNALLED';
  const stderr = typeof result?.stderr === 'string' ? result.stderr : '';
  const text = stderr.toLowerCase();
  if (/password authentication failed|authentication failed/u.test(text)) return 'DB_AUTHENTICATION_FAILED';
  if (/role .* does not exist/u.test(text)) return 'DB_ROLE_MISSING';
  if (/database .* does not exist/u.test(text)) return 'DB_DATABASE_MISSING';
  if (/permission denied/u.test(text)) return 'DB_PERMISSION_DENIED';
  if (/could not connect to server|connection refused|server closed the connection unexpectedly|connection to server at .* failed/u.test(text)) {
    return 'DB_CONNECTION_FAILURE';
  }
  if (/relation .* does not exist/u.test(text)) return 'RELATION_MISSING';
  if (/column .* does not exist/u.test(text)) return 'COLUMN_MISSING';
  if (/duplicate key value violates unique constraint/u.test(text)) return 'UNIQUE_VIOLATION';
  if (/violates not-null constraint/u.test(text)) return 'NOT_NULL_VIOLATION';
  if (/violates check constraint/u.test(text)) return 'CHECK_VIOLATION';
  if (/violates foreign key constraint/u.test(text)) return 'FK_VIOLATION';
  if (/invalid input syntax/u.test(text)) return 'INVALID_INPUT_SYNTAX';
  if (/syntax error at or near/u.test(text)) return 'SQL_SYNTAX_ERROR';
  return 'PSQL_PROCESS_REJECTED_UNCLASSIFIED';
}

function meaningfulLines(stdout) {
  return String(stdout ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !COMMAND_TAGS.has(line));
}

function runPsql(stage, sql, variables = {}) {
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
  for (const [key, value] of Object.entries(variables)) {
    args.push('--set', key + '=' + value);
  }
  args.push('--command', sql);

  const result = spawnSync('psql', args, {
    encoding: 'utf8',
    env: { ...process.env, PGDATABASE: process.env.AURORA_W15J_DATABASE_URL },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5000,
  });

  if (result.status !== 0 || result.signal !== null || result.error) {
    const stderr = typeof result.stderr === 'string' ? result.stderr : '';
    lastSqlFailure = Object.freeze({
      stage,
      classification: classifyProcess(result),
      status: Number.isInteger(result.status) ? String(result.status) : 'NONE',
      signal: typeof result.signal === 'string' ? result.signal : 'NONE',
      stderrSha256: sha256(stderr),
    });
    return Object.freeze({ ok: false, lines: [] });
  }

  return Object.freeze({ ok: true, lines: meaningfulLines(result.stdout) });
}

function emitFailure(code, failure = lastSqlFailure, status = 30) {
  if (failure) {
    process.stdout.write('sql_stage=' + failure.stage + '\n');
    process.stdout.write('sql_classification=' + failure.classification + '\n');
    process.stdout.write('psql_exit_status=' + failure.status + '\n');
    process.stdout.write('psql_signal=' + failure.signal + '\n');
    process.stdout.write('stderr_sha256=' + failure.stderrSha256 + '\n');
  }
  process.stdout.write('W15J_W03_REAL_SQL_DOCTOR=FAIL code=' + code + '\n');
  process.exit(status);
}

function codeForClassification(classification) {
  const map = new Map([
    ['PROCESS_TIMEOUT', 'W03_SQL_PROCESS_TIMEOUT'],
    ['PROCESS_SPAWN_ERROR', 'W03_SQL_PROCESS_SPAWN_ERROR'],
    ['PROCESS_SIGNALLED', 'W03_SQL_PROCESS_SIGNALLED'],
    ['DB_AUTHENTICATION_FAILED', 'W03_SQL_DB_AUTHENTICATION_FAILED'],
    ['DB_ROLE_MISSING', 'W03_SQL_DB_ROLE_MISSING'],
    ['DB_DATABASE_MISSING', 'W03_SQL_DB_DATABASE_MISSING'],
    ['DB_PERMISSION_DENIED', 'W03_SQL_DB_PERMISSION_DENIED'],
    ['DB_CONNECTION_FAILURE', 'W03_SQL_DB_CONNECTION_FAILURE'],
    ['RELATION_MISSING', 'W03_SQL_RELATION_MISSING'],
    ['COLUMN_MISSING', 'W03_SQL_COLUMN_MISSING'],
    ['UNIQUE_VIOLATION', 'W03_SQL_UNIQUE_VIOLATION'],
    ['NOT_NULL_VIOLATION', 'W03_SQL_NOT_NULL_VIOLATION'],
    ['CHECK_VIOLATION', 'W03_SQL_CHECK_VIOLATION'],
    ['FK_VIOLATION', 'W03_SQL_FK_VIOLATION'],
    ['INVALID_INPUT_SYNTAX', 'W03_SQL_INVALID_INPUT_SYNTAX'],
    ['SQL_SYNTAX_ERROR', 'W03_SQL_SYNTAX_ERROR'],
    ['PSQL_PROCESS_REJECTED_UNCLASSIFIED', 'W03_SQL_PROCESS_REJECTED_UNCLASSIFIED'],
  ]);
  return map.get(classification) ?? 'W03_SQL_PROCESS_REJECTED_UNCLASSIFIED';
}

const processProbe = runPsql('process_probe', 'BEGIN;\nSELECT 1;\nROLLBACK;');
if (!processProbe.ok) emitFailure(codeForClassification(lastSqlFailure.classification), lastSqlFailure, 31);
if (processProbe.lines.length !== 1 || processProbe.lines[0] !== '1') {
  emitFailure('W03_SQL_PROCESS_OUTPUT_AMBIGUOUS', Object.freeze({
    stage: 'process_probe',
    classification: 'OUTPUT_AMBIGUOUS',
    status: '0',
    signal: 'NONE',
    stderrSha256: sha256(''),
  }), 31);
}
process.stdout.write('psql_process=PASS\n');

const variableProbe = runPsql(
  'variable_probe',
  "BEGIN;\nSELECT :'probe_value';\nROLLBACK;",
  { probe_value: 'AURORA_W03_PROBE' },
);
if (!variableProbe.ok) emitFailure(codeForClassification(lastSqlFailure.classification), lastSqlFailure, 32);
if (variableProbe.lines.length !== 1 || variableProbe.lines[0] !== 'AURORA_W03_PROBE') {
  emitFailure('W03_SQL_VARIABLE_BINDING_OUTPUT_AMBIGUOUS', Object.freeze({
    stage: 'variable_probe',
    classification: 'OUTPUT_AMBIGUOUS',
    status: '0',
    signal: 'NONE',
    stderrSha256: sha256(''),
  }), 32);
}
process.stdout.write('psql_variable_binding=PASS\n');

let provider;
try {
  provider = await import('/aurora-devlab/config/trusted-w15j-provider.mjs');
} catch {
  emitFailure('PROVIDER_IMPORT_REJECTED', null, 33);
}
const operatorModule = await import(
  '/aurora-devlab/worktrees/host/services/mobile-gateway/dist/physical-host/local-physical-host-operator.js'
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
  emitFailure('PROVIDER_OR_OPERATOR_INPUT_REJECTED', null, 33);
}
if (captured === undefined || captured.executionStateSeed === undefined) {
  emitFailure('EXECUTION_STATE_SEED_MISSING', null, 33);
}

lastSqlFailure = null;
const rollbackSql = {
  query({ sql, variables }) {
    const result = runPsql('w03_seed', 'BEGIN;\n' + sql + ';\nROLLBACK;', variables);
    if (!result.ok) throw new Error('W03 rollback-only SQL probe rejected');
    if (result.lines.length !== 1) {
      lastSqlFailure = Object.freeze({
        stage: 'w03_seed',
        classification: 'OUTPUT_AMBIGUOUS',
        status: '0',
        signal: 'NONE',
        stderrSha256: sha256(''),
      });
      throw new Error('W03 rollback-only SQL output ambiguous');
    }
    return result.lines[0] + '\n';
  },
};

const stager = new stagerModule.W03PostgresPhysicalExecutionStateStager(rollbackSql);
const seedDryRun = stager.stage(captured.executionStateSeed);
if (!seedDryRun.ok) {
  process.stdout.write('w03_stager_code=' + seedDryRun.code + '\n');
  if (lastSqlFailure?.classification === 'OUTPUT_AMBIGUOUS') {
    emitFailure('W03_SQL_OUTPUT_AMBIGUOUS', lastSqlFailure, 34);
  }
  if (lastSqlFailure) emitFailure(codeForClassification(lastSqlFailure.classification), lastSqlFailure, 34);
  if (seedDryRun.code === 'ATTEMPT_ALREADY_EXISTS') emitFailure('W03_SEED_ALREADY_EXISTS', null, 34);
  if (seedDryRun.code === 'MALFORMED') emitFailure('W03_SEED_MALFORMED', null, 34);
  emitFailure('W03_SEED_REAL_DRY_RUN_REJECTED', null, 34);
}
if (seedDryRun.disposition !== 'STAGED') emitFailure('W03_SEED_UNEXPECTED_DISPOSITION', null, 34);

process.stdout.write('w03_seed_real_dry_run=PASS\n');
process.stdout.write('W15J_W03_REAL_SQL_DOCTOR=PASS_SOFTWARE_ONLY\n');
process.stdout.write(
  'persists_w03_state=false\nexecutes_physical_effect=false\nauthorizes_execution=false\nproves_execution_success=false\nretry_authorized=false\nphysical_acceptance=false\n',
);
NODE
"
