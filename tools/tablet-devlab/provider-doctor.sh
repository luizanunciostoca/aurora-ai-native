#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora Tablet-Only provider doctor failed: %s\n' "$*" >&2
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

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
HOST_DIR="$DEVLAB_ROOT/worktrees/host"
STATE_DIR="$DEVLAB_ROOT/state"
WORKTREE_STATE="$STATE_DIR/worktrees.txt"
DB_ENV="$STATE_DIR/postgres.env"
PROVIDER="$DEVLAB_ROOT/config/trusted-w15j-provider.mjs"
MATERIAL="$DEVLAB_ROOT/config/w15j-dp5-material.json"
DOCTOR_STATE="$STATE_DIR/provider-doctor.txt"
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
  --user aurora \
  --bind "$DEVLAB_ROOT:/aurora-devlab" \
  -- bash -lc "
set -euo pipefail
export NVM_DIR=\"\$HOME/.nvm\"
# shellcheck disable=SC1090
source \"\$NVM_DIR/nvm.sh\"
nvm use $NODE_VERSION >/dev/null
[[ \"\$(node --version)\" == \"v$NODE_VERSION\" ]]
[[ \"\$(npm --version)\" == \"$NPM_VERSION\" ]]
cd /aurora-devlab/worktrees/host
[[ \"\$(git rev-parse HEAD)\" == '$EXPECTED_HOST_SHA' ]]
[[ -z \"\$(git status --porcelain)\" ]]

set -a
# shellcheck disable=SC1091
source /aurora-devlab/state/postgres.env
set +a
export AURORA_W15J_DP5_MATERIAL=/aurora-devlab/config/w15j-dp5-material.json

npm ci
npm run build --workspace @aurora/contracts
npm run build --workspace @aurora/events
npm run build --workspace @aurora/policy-core
./node_modules/.bin/tsc --project services/executors/tsconfig.build.json --pretty false
./node_modules/.bin/tsc --project services/mobile-gateway/tsconfig.runtime.json --pretty false

node --input-type=module <<'NODE'
const provider = await import('/aurora-devlab/config/trusted-w15j-provider.mjs');
if (typeof provider.createW15JLocalPhysicalHostOperatorInput !== 'function') process.exit(10);
const input = await provider.createW15JLocalPhysicalHostOperatorInput();
const keys = Object.keys(input).sort().join(',');
if (keys !== 'databaseUrl,dependencies,executionStateSeed,principal') process.exit(11);
if (!/^postgres(?:ql)?:\/\//u.test(input.databaseUrl)) process.exit(12);
if (input.principal?.authorizesExecution !== false || input.principal?.canGrantPermission !== false) {
  process.exit(13);
}
if (input.executionStateSeed?.authorizesExecution !== false) process.exit(14);
if (input.dependencies?.receiptEvidenceIngress?.observe === undefined) process.exit(15);
for (const name of ['createVoiceIntake', 'createContainmentLifecycle', 'createAttemptLifecycle']) {
  if (typeof input.dependencies?.[name] !== 'function') process.exit(16);
}
if ('authorize' in input.dependencies || 'mint' in input.dependencies || 'approve' in input.dependencies) {
  process.exit(17);
}
process.stdout.write('W15J_DP5_PROVIDER_DOCTOR=PASS\n');
NODE
"

cat >"$DOCTOR_STATE" <<EOF
status=PASS_SOFTWARE_ONLY
host_candidate_sha=$EXPECTED_HOST_SHA
node_version=$NODE_VERSION
npm_version=$NPM_VERSION
checked_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
authorizes_execution=false
proves_execution_success=false
retry_authorized=false
physical_acceptance=false
EOF
chmod 600 "$DOCTOR_STATE"

printf 'Aurora W15-J provider doctor: PASS_SOFTWARE_ONLY\nState: %s\n' "$DOCTOR_STATE"
