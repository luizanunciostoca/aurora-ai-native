import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const setup = readFileSync(resolve(repoRoot, 'tools/tablet-devlab/setup-postgres.sh'), 'utf8');
const bootstrap = readFileSync(
  resolve(repoRoot, 'tools/tablet-devlab/bootstrap-termux.sh'),
  'utf8',
);

test('tablet PostgreSQL runs natively in Termux and never inside PRoot', () => {
  assert.match(bootstrap, /postgresql/);
  assert.match(setup, /TERMUX_NATIVE_PRIVATE_CLUSTER/);
  assert.match(setup, /TERMUX_NATIVE_ANDROID/);
  assert.match(setup, /initdb/);
  assert.match(setup, /pg_ctl/);
  assert.match(setup, /pg_isready/);
  assert.match(setup, /127\.0\.0\.1/);
  assert.doesNotMatch(setup, /proot-distro/);
  assert.doesNotMatch(setup, /pg_ctlcluster/);
  assert.doesNotMatch(setup, /\/usr\/lib\/postgresql/);
  assert.doesNotMatch(setup, /\/var\/lib\/postgresql/);
  assert.match(setup, /authorizes_execution=false/);
  assert.match(setup, /physical_acceptance=false/);
});
