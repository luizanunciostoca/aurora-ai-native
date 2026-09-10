#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora Tablet-Only real provider input doctor failed: %s\n' "$*" >&2
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

for built in \
  services/mobile-gateway/dist/physical-host/local-physical-host-operator.js \
  services/executors/dist/voice-intake/physical-host-ports.js \
  services/executors/dist/voice-intake/preissued-authority-source.js \
  services/mobile-gateway/dist/physical-host/voice-projection-intake-adapter.js; do
  [[ -f \"\$built\" ]] || { echo 'W15J_PROVIDER_REAL_INPUT_DOCTOR=FAIL code=RUNTIME_NOT_BUILT'; exit 24; }
done

node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';

function fail(code, status = 30) {
  process.stdout.write('W15J_PROVIDER_REAL_INPUT_DOCTOR=FAIL code=' + code + '\n');
  process.exit(status);
}

function classifyFactoryError(error) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('AURORA_W15J_DATABASE_URL is missing or invalid')) return 'DATABASE_URL_INVALID';
  if (message.includes('DP5 material path must be absolute')) return 'MATERIAL_PATH_INVALID';
  if (message.includes('DP5 material file is not a direct regular file')) return 'MATERIAL_FILE_INVALID';
  if (message.includes('DP5 material must not be group/other accessible')) return 'MATERIAL_PERMISSIONS_INVALID';
  if (message.includes('DP5 material must be owned by the current operator uid')) return 'MATERIAL_OWNER_INVALID';
  if (message.includes('DP5 material size is invalid')) return 'MATERIAL_SIZE_INVALID';
  if (message.includes('DP5 material JSON is invalid')) return 'MATERIAL_JSON_INVALID';
  if (message.includes('DP5 material schema is invalid')) return 'MATERIAL_SCHEMA_INVALID';
  if (message.includes('DP5 material bindings are invalid or stale')) return 'MATERIAL_BINDINGS_OR_STALE';
  if (message.includes('Canonical W02/W07/W14 provider owners are unavailable')) return 'CANONICAL_OWNER_IMPORT_INVALID';
  if (message.includes('Cannot find package') || message.includes('Cannot find module')) return 'CANONICAL_OWNER_MODULE_NOT_FOUND';
  return 'PROVIDER_FACTORY_REJECTED';
}

let material;
try {
  material = JSON.parse(readFileSync('/aurora-devlab/config/w15j-dp5-material.json', 'utf8'));
  process.stdout.write('material_generated_at=' + String(material.generatedAt ?? 'UNKNOWN') + '\n');
  process.stdout.write('material_expires_at=' + String(material.expiresAt ?? 'UNKNOWN') + '\n');
  process.stdout.write('diagnostic_now=' + new Date().toISOString() + '\n');
} catch {
  fail('MATERIAL_JSON_INVALID', 31);
}

let provider;
try {
  provider = await import('/aurora-devlab/config/trusted-w15j-provider.mjs');
} catch {
  fail('PROVIDER_IMPORT_REJECTED', 32);
}
if (typeof provider.createW15JLocalPhysicalHostOperatorInput !== 'function') {
  fail('PROVIDER_EXPORT_INVALID', 32);
}

let provided;
try {
  provided = await provider.createW15JLocalPhysicalHostOperatorInput();
} catch (error) {
  fail(classifyFactoryError(error), 33);
}
process.stdout.write('provider_factory=PASS\n');

const operatorModule = await import(
  '/aurora-devlab/worktrees/host/services/mobile-gateway/dist/physical-host/local-physical-host-operator.js'
);
let captured;
try {
  await operatorModule.startW15JLocalPhysicalHostOperator(
    {
      createW15JLocalPhysicalHostOperatorInput: async () => provided,
    },
    {
      startRunner: async (input) => {
        captured = input;
        return Object.freeze({ stop: async () => {} });
      },
    },
  );
} catch (error) {
  const operatorCode =
    error !== null && typeof error === 'object' && typeof error.code === 'string'
      ? error.code
      : 'UNKNOWN';
  process.stdout.write('operator_rejection=' + operatorCode + '\n');
  if (operatorCode === 'PROVIDER_INPUT_INVALID') fail('OPERATOR_PROVIDER_INPUT_INVALID', 34);
  if (operatorCode === 'PROVIDER_FACTORY_FAILED') fail('OPERATOR_PROVIDER_FACTORY_FAILED', 34);
  if (operatorCode === 'PROVIDER_MODULE_INVALID') fail('OPERATOR_PROVIDER_MODULE_INVALID', 34);
  if (operatorCode === 'HOST_START_FAILED') fail('OPERATOR_HOST_START_FAILED', 34);
  fail('OPERATOR_INPUT_REJECTED', 34);
}

if (captured === undefined) fail('OPERATOR_CAPTURE_MISSING', 35);
if (captured.executionStateSeed === undefined) fail('EXECUTION_STATE_SEED_MISSING', 35);
if (captured.executionStateSeed.authorizesExecution !== false) fail('EXECUTION_STATE_SEED_AUTHORITY_INVALID', 35);
if (captured.principal?.authorizesExecution !== false || captured.principal?.canGrantPermission !== false) {
  fail('PRINCIPAL_AUTHORITY_INVALID', 35);
}

process.stdout.write('operator_provider_input=PASS\n');
process.stdout.write('execution_state_seed_present=PASS\n');
process.stdout.write('W15J_PROVIDER_REAL_INPUT_DOCTOR=PASS_SOFTWARE_ONLY\n');
process.stdout.write(
  'persists_w03_state=false\nexecutes_physical_effect=false\nauthorizes_execution=false\nproves_execution_success=false\nretry_authorized=false\nphysical_acceptance=false\n',
);
NODE
"
