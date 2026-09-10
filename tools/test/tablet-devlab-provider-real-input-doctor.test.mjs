import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const doctor = readFileSync(
  resolve(repoRoot, 'tools/tablet-devlab/provider-real-input-doctor.sh'),
  'utf8',
);

test('real provider input doctor isolates factory and operator validation without physical effect', () => {
  assert.match(doctor, /proot-distro login debian/);
  assert.match(doctor, /export HOME=\/home\/aurora/);
  assert.match(doctor, /material_generated_at=/);
  assert.match(doctor, /material_expires_at=/);
  assert.match(doctor, /MATERIAL_BINDINGS_OR_STALE/);
  assert.match(doctor, /MATERIAL_OWNER_INVALID/);
  assert.match(doctor, /CANONICAL_OWNER_MODULE_NOT_FOUND/);
  assert.match(doctor, /provider_factory=PASS/);
  assert.match(doctor, /OPERATOR_PROVIDER_INPUT_INVALID/);
  assert.match(doctor, /operator_provider_input=PASS/);
  assert.match(doctor, /execution_state_seed_present=PASS/);
  assert.match(doctor, /startRunner: async \(input\) =>/);
  assert.match(doctor, /persists_w03_state=false/);
  assert.match(doctor, /executes_physical_effect=false/);
  assert.match(doctor, /authorizes_execution=false/);
  assert.match(doctor, /proves_execution_success=false/);
  assert.match(doctor, /retry_authorized=false/);
  assert.match(doctor, /physical_acceptance=false/);
});
