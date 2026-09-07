#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora Tablet-Only DP5 provider preparation failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
command -v python >/dev/null 2>&1 || fail "python is missing"

# Preparing dependencies is automatic; emitting short-lived authority material for the positive
# physical side-effect scenario is not. A human operator must explicitly opt in for each window.
[[ "${AURORA_DP5_EFFECT_APPROVED:-}" == "YES" ]] || \
  fail "explicit physical-effect consent required: AURORA_DP5_EFFECT_APPROVED=YES"

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
HOST_DIR="$DEVLAB_ROOT/worktrees/host"
CONFIG_DIR="$DEVLAB_ROOT/config"
STATE_DIR="$DEVLAB_ROOT/state"
MATERIAL="$CONFIG_DIR/w15j-dp5-material.json"
PROVIDER="$CONFIG_DIR/trusted-w15j-provider.mjs"
DB_ENV="$STATE_DIR/postgres.env"
PROVIDER_STATE="$STATE_DIR/provider.txt"

[[ -d "$HOST_DIR/.git" || -f "$HOST_DIR/.git" ]] || fail "host worktree missing; run worktrees.sh"
[[ -f "$HOST_DIR/tools/physical/w15j-local-dp5-provider-runtime.mjs" ]] || \
  fail "host candidate does not contain the DP5 provider runtime"
[[ -f "$DB_ENV" && ! -L "$DB_ENV" ]] || fail "PostgreSQL state missing; run setup-postgres.sh"

mkdir -p "$CONFIG_DIR" "$STATE_DIR"
chmod 700 "$CONFIG_DIR" "$STATE_DIR"
umask 077

python - "$MATERIAL" <<'PY'
import base64
import json
import os
import secrets
import sys
from datetime import datetime, timedelta, timezone

path = sys.argv[1]
alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

def crockford26():
    value = int.from_bytes(secrets.token_bytes(16), 'big')
    chars = []
    for _ in range(26):
        chars.append(alphabet[value & 31])
        value >>= 5
    return ''.join(reversed(chars))

def opaque(prefix, n=18):
    raw = base64.urlsafe_b64encode(secrets.token_bytes(n)).decode('ascii').rstrip('=')
    return f'{prefix}_{raw}'

now = datetime.now(timezone.utc)
expires = now + timedelta(minutes=90)
iso = lambda value: value.isoformat(timespec='milliseconds').replace('+00:00', 'Z')

material = {
    'kind': 'W15J_LOCAL_DP5_OPERATOR_MATERIAL',
    'schemaVersion': '1.0.0',
    'generatedAt': iso(now),
    'expiresAt': iso(expires),
    'tenantId': f'ten_{crockford26()}',
    'actorIdentityId': f'idn_{crockford26()}',
    'subjectIdentityId': f'idn_{crockford26()}',
    'correlationId': f'cor_{crockford26()}',
    'deviceId': f'dvc_{crockford26()}',
    'deviceSessionId': opaque('dss'),
    'actionIntentId': f'act_{crockford26()}',
    'commandId': f'cmd_{crockford26()}',
    'executionId': f'exe_{crockford26()}',
    'causationId': f'cau_{crockford26()}',
    'policyTokenId': f'ptk_{crockford26()}',
    'idempotencyKey': opaque('idem'),
    'orderingKey': 'device:audio:volume',
    'orderingSequence': 1,
    'circuitKey': 'w15j:device:audio:volume',
    'operatorApprovalReference': opaque('apr'),
    'authorizesExecution': False,
    'canGrantPermission': False,
}

temporary = f'{path}.tmp-{os.getpid()}'
fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
try:
    with os.fdopen(fd, 'w', encoding='utf-8') as handle:
        json.dump(material, handle, indent=2, sort_keys=True)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)
    os.chmod(path, 0o600)
finally:
    try:
        os.unlink(temporary)
    except FileNotFoundError:
        pass
PY

cat >"$PROVIDER" <<'EOF'
import { createW15JLocalDp5OperatorInput } from '/aurora-devlab/worktrees/host/tools/physical/w15j-local-dp5-provider-runtime.mjs';

export async function createW15JLocalPhysicalHostOperatorInput() {
  const databaseUrl = process.env.AURORA_W15J_DATABASE_URL;
  const materialPath = process.env.AURORA_W15J_DP5_MATERIAL;
  if (typeof databaseUrl !== 'string' || typeof materialPath !== 'string') {
    throw new Error('W15J_DP5_PROVIDER_ENVIRONMENT_INCOMPLETE');
  }
  return createW15JLocalDp5OperatorInput({ databaseUrl, materialPath });
}
EOF
chmod 600 "$PROVIDER" "$MATERIAL"

python - "$MATERIAL" "$PROVIDER_STATE" "$(git -C "$HOST_DIR" rev-parse HEAD)" <<'PY'
import hashlib
import json
import os
import sys

material_path, state_path, host_sha = sys.argv[1:]
with open(material_path, 'rb') as handle:
    digest = hashlib.sha256(handle.read()).hexdigest()
with open(material_path, 'r', encoding='utf-8') as handle:
    material = json.load(handle)
state = '\n'.join([
    'status=READY_NOT_ACCEPTED',
    f'host_candidate_sha={host_sha}',
    f'material_sha256={digest}',
    f'material_expires_at={material["expiresAt"]}',
    f'device_id={material["deviceId"]}',
    f'device_session_id={material["deviceSessionId"]}',
    'effect_approval=EXPLICIT_OPERATOR_WINDOW',
    'provider_secrets_committed=false',
    'authorizes_execution=false',
    'physical_acceptance=false',
    '',
])
fd = os.open(state_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w', encoding='utf-8') as handle:
    handle.write(state)
os.chmod(state_path, 0o600)
PY
chmod 600 "$PROVIDER_STATE"

printf 'Aurora W15-J DP5 provider material: READY_NOT_ACCEPTED\nState: %s\n' "$PROVIDER_STATE"
