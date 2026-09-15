#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora Tablet-Only DP5 provider preparation failed: %s\n' "$*" >&2
  exit 2
}

secure_regular_file() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" ]] || return 1
  [[ "$(stat -c '%a' "$path")" == "600" ]] || return 1
  [[ "$(stat -c '%u' "$path")" == "$(id -u)" ]] || return 1
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in python sha256sum stat git; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"; done

# The environment opt-in is intentionally necessary but no longer sufficient. The operator must
# first create a short-lived, exact-tuple consent record through authorize-dp5-effect.sh, which
# itself requires an interactive TTY and an exact challenge response.
[[ "${AURORA_DP5_EFFECT_APPROVED:-}" == "YES" ]] || \
  fail "explicit physical-effect opt-in required: AURORA_DP5_EFFECT_APPROVED=YES"

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
HOST_DIR="$DEVLAB_ROOT/worktrees/host"
CONFIG_DIR="$DEVLAB_ROOT/config"
STATE_DIR="$DEVLAB_ROOT/state"
MATERIAL="$CONFIG_DIR/w15j-dp5-material.json"
PROVIDER="$CONFIG_DIR/trusted-w15j-provider.mjs"
DB_ENV="$STATE_DIR/postgres.env"
PROVIDER_STATE="$STATE_DIR/provider.txt"
WORKTREE_STATE="$STATE_DIR/worktrees.txt"
CONSENT="$STATE_DIR/dp5-effect-consent.json"

[[ -d "$HOST_DIR/.git" || -f "$HOST_DIR/.git" ]] || fail "host worktree missing; run worktrees.sh"
[[ -f "$HOST_DIR/tools/physical/w15j-local-dp5-provider-runtime.mjs" ]] || \
  fail "host candidate does not contain the DP5 provider runtime"
for path in "$DB_ENV" "$WORKTREE_STATE" "$CONSENT"; do
  secure_regular_file "$path" || fail "required local state is missing or insecure: $path"
done

MAIN_SHA="$(awk -F= '$1 == "main" {print $2}' "$WORKTREE_STATE")"
ANDROID_SHA="$(awk -F= '$1 == "android" {print $2}' "$WORKTREE_STATE")"
HOST_SHA="$(awk -F= '$1 == "host" {print $2}' "$WORKTREE_STATE")"
for sha in "$MAIN_SHA" "$ANDROID_SHA" "$HOST_SHA"; do
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "worktree tuple contains malformed SHA"
done
[[ "$(git -C "$HOST_DIR" rev-parse HEAD)" == "$HOST_SHA" ]] || fail "host worktree drifted"
[[ -z "$(git -C "$HOST_DIR" status --porcelain)" ]] || fail "host worktree is dirty"

mkdir -p "$CONFIG_DIR" "$STATE_DIR"
chmod 700 "$CONFIG_DIR" "$STATE_DIR"
umask 077

python - "$MATERIAL" "$CONSENT" "$MAIN_SHA" "$ANDROID_SHA" "$HOST_SHA" <<'PY'
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

material_path, consent_path, main_sha, android_sha, host_sha = sys.argv[1:]
with open(consent_path, 'r', encoding='utf-8') as handle:
    consent = json.load(handle)

expected_keys = {
    'kind',
    'schemaVersion',
    'issuedAt',
    'expiresAt',
    'mainSha',
    'androidSha',
    'hostSha',
    'scope',
    'approvalReference',
    'authorizesExecution',
    'retryAuthorized',
    'physicalAcceptance',
}
if set(consent) != expected_keys:
    raise SystemExit('DP5 effect consent schema is invalid')
if consent['kind'] != 'W15J_DP5_PHYSICAL_EFFECT_CONSENT' or consent['schemaVersion'] != '1.0.0':
    raise SystemExit('DP5 effect consent identity is invalid')
if (
    consent['mainSha'] != main_sha
    or consent['androidSha'] != android_sha
    or consent['hostSha'] != host_sha
):
    raise SystemExit('DP5 effect consent tuple drifted')
if consent['scope'] != 'ONE_BOUNDED_MEDIA_VOLUME_STEP_UP':
    raise SystemExit('DP5 effect consent scope is invalid')
if (
    consent['authorizesExecution'] is not False
    or consent['retryAuthorized'] is not False
    or consent['physicalAcceptance'] is not False
):
    raise SystemExit('DP5 effect consent illegally claims authority')
if not re.fullmatch(r'apr_[A-Za-z0-9_-]{20,128}', consent['approvalReference']):
    raise SystemExit('DP5 effect approval reference is invalid')

def parse_iso(value):
    if not isinstance(value, str) or not value.endswith('Z'):
        raise SystemExit('DP5 effect consent timestamp is invalid')
    try:
        return datetime.fromisoformat(value[:-1] + '+00:00')
    except ValueError as error:
        raise SystemExit('DP5 effect consent timestamp is invalid') from error

now = datetime.now(timezone.utc)
issued = parse_iso(consent['issuedAt'])
expires = parse_iso(consent['expiresAt'])
if issued > now or now - issued > timedelta(minutes=10):
    raise SystemExit('DP5 effect consent is stale')
if expires <= now or expires - issued > timedelta(minutes=10):
    raise SystemExit('DP5 effect consent lifetime is invalid')

alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

def crockford26():
    value = int.from_bytes(os.urandom(16), 'big')
    chars = []
    for _ in range(26):
        chars.append(alphabet[value & 31])
        value >>= 5
    return ''.join(reversed(chars))

def opaque(prefix, n=18):
    import base64
    raw = base64.urlsafe_b64encode(os.urandom(n)).decode('ascii').rstrip('=')
    return f'{prefix}_{raw}'

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
    'operatorApprovalReference': consent['approvalReference'],
    'authorizesExecution': False,
    'canGrantPermission': False,
}

temporary = f'{material_path}.tmp-{os.getpid()}'
fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
try:
    with os.fdopen(fd, 'w', encoding='utf-8') as handle:
        json.dump(material, handle, indent=2, sort_keys=True)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, material_path)
    os.chmod(material_path, 0o600)
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

CONSENT_SHA="$(sha256sum "$CONSENT" | awk '{print $1}')"
MATERIAL_SHA="$(sha256sum "$MATERIAL" | awk '{print $1}')"
WINDOW="$(date -u +%Y%m%dT%H%M%SZ)"
CONSUMED_CONSENT="$STATE_DIR/dp5-effect-consent.consumed-$WINDOW.json"
mv "$CONSENT" "$CONSUMED_CONSENT"
chmod 600 "$CONSUMED_CONSENT"

python - "$MATERIAL" "$PROVIDER_STATE" "$HOST_SHA" "$CONSENT_SHA" "$CONSUMED_CONSENT" <<'PY'
import hashlib
import json
import os
import sys

material_path, state_path, host_sha, consent_sha, consumed_consent_path = sys.argv[1:]
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
    f'effect_consent_sha256={consent_sha}',
    f'effect_consent_record={consumed_consent_path}',
    'effect_approval=INTERACTIVE_EXACT_TUPLE_OPERATOR_WINDOW',
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

printf 'Aurora W15-J DP5 provider material: READY_NOT_ACCEPTED\nmaterial_sha256=%s\neffect_consent_sha256=%s\nState: %s\n' \
  "$MATERIAL_SHA" "$CONSENT_SHA" "$PROVIDER_STATE"
