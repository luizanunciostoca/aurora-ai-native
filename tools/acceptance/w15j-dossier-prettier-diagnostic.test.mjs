import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import test from 'node:test';

const paths = [
  'tools/acceptance/w15j-tablet-loopback-dossier-lifecycle.mjs',
  'tools/acceptance/w15j-tablet-loopback-dossier-lifecycle.test.mjs',
];

test('emit canonical W15-J dossier prettier bytes', async () => {
  let allFormatted = true;
  for (const path of paths) {
    const source = readFileSync(path, 'utf8');
    const config = (await resolveConfig(path)) ?? {};
    const formatted = await format(source, { ...config, filepath: path });
    console.error(
      `W15J_PRETTIER_BASE64 ${path} ${Buffer.from(formatted, 'utf8').toString('base64')}`,
    );
    if (formatted !== source) allFormatted = false;
  }
  assert.equal(allFormatted, true);
});
