import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(
  resolve(repoRoot, 'tools/tablet-devlab/dp5-physical-control.sh'),
  'utf8',
);

test('DP5 physical control is LOCAL-only, bounded and non-authoritative', () => {
  assert.match(source, /ai\.aurora\.device\.local/);
  assert.match(source, /DP5_PHYSICAL_ACCEPTANCE_CONTROL/);
  assert.match(source, /SESSION_REVOKE\|SESSION_ROTATE/);
  assert.match(source, /CAPABILITY_STALE/);
  assert.match(source, /OFFLINE_PREPARE/);
  assert.match(source, /OFFLINE_DRAIN/);
  assert.match(source, /OFFLINE_SNAPSHOT/);
  assert.match(source, /exactly one authorized self-ADB device is required/);
  assert.match(source, /physical tablet required/);
  assert.match(source, /authorizes_execution=false/);
  assert.match(source, /proves_execution_success=false/);
  assert.match(source, /retry_authorized=false/);
  assert.match(source, /physical_acceptance=false/);
});
