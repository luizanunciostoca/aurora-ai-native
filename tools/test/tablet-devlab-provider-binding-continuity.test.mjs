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

test('bound W14 provider refresh preserves the registered actor identity', () => {
  assert.match(source, /secure_regular_file "\$MATERIAL" \|\| fail "existing DP5 material is insecure"/u);
  assert.match(source, /def prior_bound_actor\(path, current_binding\):/u);
  assert.match(source, /current_binding\['mode'\] != 'BOUND'/u);
  assert.match(source, /previous\.get\('tenantId'\) != current_binding\['tenantId'\]/u);
  assert.match(source, /previous\.get\('deviceId'\) != current_binding\['deviceId'\]/u);
  assert.match(
    source,
    /previous\.get\('deviceSessionId'\) != current_binding\['deviceSessionId'\]/u,
  );
  assert.match(source, /previous\.get\('authorizesExecution'\) is not False/u);
  assert.match(source, /previous\.get\('canGrantPermission'\) is not False/u);
  assert.match(source, /actor_identity_id = previous\.get\('actorIdentityId'\)/u);
  assert.match(source, /'actorIdentityId': actor_identity_id/u);
  assert.match(source, /refusing identity drift/u);
});

test('fresh install still creates a new bounded actor while consent stays non-authoritative', () => {
  assert.match(source, /if actor_identity_id is None:\n    actor_identity_id = f'idn_\{crockford26\(\)\}'/u);
  assert.match(source, /'operatorApprovalReference': consent\['approvalReference'\]/u);
  assert.match(source, /'authorizesExecution': False/u);
  assert.match(source, /'canGrantPermission': False/u);
});
