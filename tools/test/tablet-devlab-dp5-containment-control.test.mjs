import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const script = readFileSync(
  resolve(root, 'tools/tablet-devlab/dp5-containment-control.sh'),
  'utf8',
);

test('DP5 containment control is local, exact-host-bound and non-authoritative', () => {
  assert.match(script, /hostInstanceId/);
  assert.match(script, /W03PostgresCurrentContainmentStateSource/);
  assert.match(script, /W03PostgresContainmentStateStore/);
  assert.match(script, /W03PostgresHalfOpenProbeLease/);
  assert.match(script, /createContainmentLifecycle/);
  assert.match(script, /ACTIVATE_KILL_SWITCH/);
  assert.match(script, /REQUEST_CANCELLATION/);
  assert.match(script, /BEGIN_IN_FLIGHT/);
  assert.match(script, /DEPENDENCY_UNAVAILABLE/);
  assert.match(script, /AURORA_DP5_RECOVERY_VALIDATED=YES/);
  assert.match(script, /AURORA_DP5_RECONCILIATION_COMPLETED=YES/);
  assert.match(script, /authorizes_execution=false/);
  assert.match(script, /proves_execution_success=false/);
  assert.match(script, /retry_authorized=false/);
  assert.doesNotMatch(script, /\/v1\/.*(?:kill|cancel|containment)/i);
});
