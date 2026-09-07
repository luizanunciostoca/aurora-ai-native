import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import test from 'node:test';

test('emit canonical prettier output for tablet self-binding test', async () => {
  const path = resolve('tools/test/tablet-devlab-self-binding.test.mjs');
  const source = readFileSync(path, 'utf8');
  const config = (await resolveConfig(path)) ?? {};
  const formatted = await format(source, { ...config, filepath: path });
  const encoded = Buffer.from(formatted, 'utf8').toString('base64');
  console.error(`PRETTIER_CANONICAL_BASE64=${encoded}`);
  assert.equal(formatted, source);
});
