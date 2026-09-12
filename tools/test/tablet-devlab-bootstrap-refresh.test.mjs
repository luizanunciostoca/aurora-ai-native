import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runHost = readFileSync(resolve(repoRoot, 'tools/tablet-devlab/run-host.sh'), 'utf8');
const refresh = readFileSync(resolve(repoRoot, 'tools/tablet-devlab/refresh-bootstrap.sh'), 'utf8');

test('host launcher enables refresh only through protected DevLab state', () => {
  assert.match(runHost, /BOOTSTRAP_REFRESH_FILE=.*w15j-bootstrap-refresh\.json/);
  assert.match(runHost, /secure_regular_file.*BOOTSTRAP_REFRESH_FILE/s);
  assert.match(
    runHost,
    /AURORA_W15J_BOOTSTRAP_REFRESH_FILE=\/aurora-devlab\/state\/w15j-bootstrap-refresh\.json/,
  );
  assert.doesNotMatch(runHost, /adb reverse/);
});

test('bootstrap refresh binds signal output to the currently proven host instance', () => {
  assert.match(refresh, /last-readiness-termux\.txt/);
  assert.match(refresh, /host-ready-announcement\.txt/);
  assert.match(refresh, /process_id/);
  assert.match(refresh, /host_instance_id/);
  assert.match(refresh, /kill -0/);
  assert.match(refresh, /127\.0\.0\.1:8080\/v1\/local-host\/instance/);
  assert.match(refresh, /127\.0\.0\.1:8081\/v1\/local-host\/instance/);
  assert.match(refresh, /DEVICE_GATEWAY/);
  assert.match(refresh, /BOOTSTRAP_EXCHANGE/);
  assert.match(refresh, /kill -USR2/);
  assert.match(refresh, /W15J_LOCAL_BOOTSTRAP_REFRESH_READY/);
  assert.match(refresh, /\^gbr_\[A-Za-z0-9_-\]\{43,128\}\$/);
  assert.match(refresh, /REMAINING_MS > 30000/);
  assert.doesNotMatch(refresh, /REMAINING_MS > 30_000/);
});

test('refresh remains non-authoritative and never claims DP5 acceptance', () => {
  assert.match(refresh, /authorizesExecution == false/);
  assert.match(refresh, /provesExecutionSuccess == false/);
  assert.match(refresh, /retryAuthorized == false/);
  assert.match(refresh, /authorizes_execution=false/);
  assert.match(refresh, /proves_execution_success=false/);
  assert.match(refresh, /retry_authorized=false/);
  assert.match(refresh, /physical_acceptance=false/);
  assert.doesNotMatch(refresh, /physical_acceptance=true/);
  assert.doesNotMatch(refresh, /authorizes_execution=true/);
  assert.doesNotMatch(refresh, /retry_authorized=true/);
});
