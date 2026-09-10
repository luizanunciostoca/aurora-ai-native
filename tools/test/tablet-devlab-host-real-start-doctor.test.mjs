import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const doctor = readFileSync(
  resolve(repoRoot, 'tools/tablet-devlab/host-real-start-doctor.sh'),
  'utf8',
);

test('real-start doctor isolates fixed-port and real-W03 startup without durable mutation', () => {
  assert.match(doctor, /proot-distro login debian/);
  assert.match(doctor, /export HOME=\/home\/aurora/);
  assert.match(doctor, /command -v psql/);
  assert.match(doctor, /W03PostgresPhysicalExecutionStateStager/);
  assert.match(doctor, /BEGIN;\\n/);
  assert.match(doctor, /ROLLBACK;/);
  assert.match(doctor, /ROLLBACK_COMMAND_TAGS/);
  assert.match(doctor, /OUTPUT_AMBIGUOUS/);
  assert.match(doctor, /W03_SEED_ALREADY_EXISTS/);
  assert.match(doctor, /W03_SEED_MALFORMED/);
  assert.match(doctor, /W03_SEED_SQL_UNAVAILABLE/);
  assert.match(doctor, /W03_SEED_OUTPUT_AMBIGUOUS/);
  assert.match(doctor, /W03_SEED_REAL_DRY_RUN_REJECTED/);
  assert.match(doctor, /FIXED_PORT_8080_OCCUPIED/);
  assert.match(doctor, /FIXED_PORT_8081_OCCUPIED/);
  assert.match(doctor, /gatewayPort: 8080, bootstrapPort: 8081/);
  assert.match(doctor, /executionStateSeed: undefined/);
  assert.match(doctor, /FIXED_PORT_COMPOSITION_REJECTED/);
  assert.match(doctor, /W15J_HOST_REAL_START_DOCTOR=PASS_SOFTWARE_ONLY/);
  assert.match(doctor, /persists_w03_state=false/);
  assert.match(doctor, /executes_physical_effect=false/);
  assert.match(doctor, /authorizes_execution=false/);
  assert.match(doctor, /proves_execution_success=false/);
  assert.match(doctor, /retry_authorized=false/);
  assert.match(doctor, /physical_acceptance=false/);
});
