import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const doctor = readFileSync(resolve(repoRoot, 'tools/tablet-devlab/host-start-doctor.sh'), 'utf8');
const debian = readFileSync(resolve(repoRoot, 'tools/tablet-devlab/setup-debian.sh'), 'utf8');

test('host start doctor reproduces synthetic-root prerequisites without physical execution', () => {
  assert.match(doctor, /proot-distro login debian/);
  assert.doesNotMatch(doctor, /--user aurora/);
  assert.match(doctor, /export HOME=\/home\/aurora/);
  assert.match(doctor, /stat -c '%u' \/usr\/bin\/git/);
  assert.match(doctor, /command -v psql/);
  assert.match(doctor, /SELECT 1/);
  assert.match(doctor, /w03_execution_attempt_quota/);
  assert.match(doctor, /w03_execution_containment/);
  assert.match(doctor, /PROVIDER_OR_OPERATOR_INPUT_REJECTED/);
  assert.match(doctor, /W03PostgresPhysicalExecutionStateStager/);
  assert.match(doctor, /return 'STAGED\\tCONTAINMENT_INITIALIZED\\n'/);
  assert.match(doctor, /gatewayPort: 0, bootstrapPort: 0/);
  assert.match(doctor, /executionStateSeed: undefined/);
  assert.match(doctor, /EPHEMERAL_LOOPBACK_COMPOSITION_REJECTED/);
  assert.match(doctor, /W15J_HOST_START_DOCTOR=PASS_SOFTWARE_ONLY/);
  assert.match(doctor, /authorizes_execution=false/);
  assert.match(doctor, /proves_execution_success=false/);
  assert.match(doctor, /retry_authorized=false/);
  assert.match(doctor, /physical_acceptance=false/);
  assert.doesNotMatch(doctor, /gatewayPort: 8080/);
  assert.doesNotMatch(doctor, /bootstrapPort: 8081/);
});

test('Debian setup explicitly installs the psql client required by the W03 host adapter', () => {
  assert.match(debian, /postgresql-client/);
  assert.match(debian, /command -v psql/);
  assert.match(debian, /postgres_client=DEBIAN_PSQL_CLIENT/);
});
