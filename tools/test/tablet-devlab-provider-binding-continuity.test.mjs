import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(
  resolve(repoRoot, 'tools/tablet-devlab/prepare-dp5-provider.sh'),
  'utf8',
);

function expectSource(value) {
  assert.equal(source.includes(value), true);
}

test('bound W14 provider refresh preserves the registered actor identity', () => {
  const required = [
    'secure_regular_file "$MATERIAL" || fail "existing DP5 material is insecure"',
    'def prior_bound_actor(path, current_binding):',
    "current_binding['mode'] != 'BOUND'",
    "previous.get('tenantId') != current_binding['tenantId']",
    "previous.get('deviceId') != current_binding['deviceId']",
    "previous.get('deviceSessionId') != current_binding['deviceSessionId']",
    "previous.get('authorizesExecution') is not False",
    "previous.get('canGrantPermission') is not False",
    "actor_identity_id = previous.get('actorIdentityId')",
    "'actorIdentityId': actor_identity_id",
    'refusing identity drift',
  ];
  for (const value of required) expectSource(value);
});

test('fresh install creates a new actor while consent remains non-authoritative', () => {
  const required = [
    'if actor_identity_id is None:',
    "actor_identity_id = f'idn_{crockford26()}'",
    "'operatorApprovalReference': consent['approvalReference']",
    "'authorizesExecution': False",
    "'canGrantPermission': False",
  ];
  for (const value of required) expectSource(value);
});
