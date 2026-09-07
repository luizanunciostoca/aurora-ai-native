import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import test from 'node:test';

const paths = [
  'tools/acceptance/w15j-tablet-loopback-dossier-lifecycle.mjs',
  'tools/acceptance/w15j-tablet-loopback-dossier-lifecycle.test.mjs',
];

test('emit canonical W15-J dossier prettier diff', async () => {
  let allFormatted = true;
  for (const path of paths) {
    const source = readFileSync(path, 'utf8');
    const config = (await resolveConfig(path)) ?? {};
    const formatted = await format(source, { ...config, filepath: path });
    if (formatted === source) continue;
    allFormatted = false;
    const diff = spawnSync('diff', ['-u', '--label', `${path}.current`, '--label', `${path}.prettier`, path, '-'], {
      input: formatted,
      encoding: 'utf8',
    });
    console.error(diff.stdout);
  }
  assert.equal(allFormatted, true);
});
