import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(resolve(repoRoot, 'tools/tablet-devlab/setup-postgres.sh'), 'utf8');

test('tablet postgres uses a private aurora-owned cluster under PRoot', () => {
  assert.match(source, /proot-distro login debian/);
  assert.match(source, /--user aurora/);
  assert.match(source, /aurora-w15j-postgres/);
  assert.match(source, /PRIVATE_DEVLAB_USER_CLUSTER/);
  assert.match(source, /initdb/);
  assert.match(source, /pg_ctl/);
  assert.match(source, /pg_isready/);
  assert.doesNotMatch(source, /pg_ctlcluster/);
  assert.doesNotMatch(source, /\/var\/lib\/postgresql/);
  assert.match(source, /authorizes_execution=false/);
  assert.match(source, /physical_acceptance=false/);
});
