import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const doctor = readFileSync(
  resolve(repoRoot, 'tools/tablet-devlab/w03-real-sql-doctor.sh'),
  'utf8',
);

test(
  'W03 real SQL doctor isolates psql process, variable binding and rollback-only seed staging',
  () => {
    assert.match(doctor, /proot-distro login debian/);
    assert.match(doctor, /export HOME=\/home\/aurora/);
    assert.match(doctor, /command -v psql/);
    assert.match(doctor, /new URL\(process\.env\.AURORA_W15J_DATABASE_URL\)/);
    assert.match(doctor, /env\.PGHOST = parsed\.hostname/);
    assert.match(doctor, /env\.PGPORT = parsed\.port \|\| '5432'/);
    assert.match(doctor, /env\.PGUSER = decodeURIComponent\(parsed\.username\)/);
    assert.match(doctor, /env\.PGDATABASE = decodeURIComponent\(parsed\.pathname\.slice\(1\)\)/);
    assert.match(doctor, /env\.PGPASSWORD = decodeURIComponent\(parsed\.password\)/);
    assert.doesNotMatch(doctor, /PGDATABASE: process\.env\.AURORA_W15J_DATABASE_URL/);
    assert.match(doctor, /BEGIN;\\nSELECT 1;\\nROLLBACK;/);
    assert.match(doctor, /SELECT :'probe_value'/);
    assert.match(doctor, /W03PostgresPhysicalExecutionStateStager/);
    assert.match(doctor, /BEGIN;\\n' \+ sql \+ ';\\nROLLBACK;/);
    assert.match(doctor, /psql_process=PASS/);
    assert.match(doctor, /psql_variable_binding=PASS/);
    assert.match(doctor, /w03_seed_real_dry_run=PASS/);
    assert.match(doctor, /W15J_W03_REAL_SQL_DOCTOR=PASS_SOFTWARE_ONLY/);
  },
);

test('W03 real SQL doctor streams SQL on stdin so psql variables are expanded client-side', () => {
  assert.match(doctor, /const input = sql\.endsWith\('\\n'\) \? sql : sql \+ '\\n'/);
  assert.match(doctor, /input,/);
  assert.match(doctor, /stdio: \['pipe', 'pipe', 'pipe'\]/);
  assert.doesNotMatch(doctor, /args\.push\('--command', sql\)/);
  assert.doesNotMatch(doctor, /stdio: \['ignore', 'pipe', 'pipe'\]/);
});

test('W03 real SQL doctor keeps the nested Node heredoc shell-safe', () => {
  assert.match(doctor, /\\"BEGIN;\\nSELECT :'probe_value';\\nROLLBACK;\\"/);
  assert.doesNotMatch(doctor, / {2}"BEGIN;\\nSELECT :'probe_value';\\nROLLBACK;",/);
});

test('W03 real SQL doctor emits bounded diagnostics without leaking stderr or authority', () => {
  for (const classification of [
    'PROCESS_TIMEOUT',
    'PROCESS_SPAWN_ERROR',
    'PROCESS_SIGNALLED',
    'DATABASE_URL_INVALID',
    'DB_AUTHENTICATION_FAILED',
    'DB_CONNECTION_FAILURE',
    'DB_PERMISSION_DENIED',
    'RELATION_MISSING',
    'COLUMN_MISSING',
    'UNIQUE_VIOLATION',
    'NOT_NULL_VIOLATION',
    'CHECK_VIOLATION',
    'FK_VIOLATION',
    'INVALID_INPUT_SYNTAX',
    'SQL_SYNTAX_ERROR',
    'PSQL_PROCESS_REJECTED_UNCLASSIFIED',
  ]) {
    assert.match(doctor, new RegExp(classification));
  }
  assert.match(doctor, /stderr_sha256=/);
  assert.doesNotMatch(doctor, /process\.stdout\.write\([^\n]*stderr/);
  assert.doesNotMatch(doctor, /console\.log\([^\n]*stderr/);
  assert.doesNotMatch(doctor, /run-host\.sh/);
  assert.doesNotMatch(doctor, /gatewayPort:\s*8080/);
  assert.doesNotMatch(doctor, /bootstrapPort:\s*8081/);
  assert.match(doctor, /persists_w03_state=false/);
  assert.match(doctor, /executes_physical_effect=false/);
  assert.match(doctor, /authorizes_execution=false/);
  assert.match(doctor, /proves_execution_success=false/);
  assert.match(doctor, /retry_authorized=false/);
  assert.match(doctor, /physical_acceptance=false/);
});