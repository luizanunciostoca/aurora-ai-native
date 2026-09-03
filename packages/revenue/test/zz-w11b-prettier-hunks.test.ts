// TEMPORARY W11-B PRETTIER DIAGNOSTIC — remove before acceptance.
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import { Buffer } from 'node:buffer';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import { readFile } from 'node:fs/promises';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import { format, resolveConfig } from 'prettier';

for (const file of [
  'packages/revenue/src/social/publication-provider-integration.ts',
  'packages/revenue/test/w11b-publication-provider-integration.test.ts',
] as const) {
  test(`emit canonical Prettier file for ${file}`, async () => {
    const source = await readFile(file, 'utf8');
    const config = (await resolveConfig(file)) ?? {};
    const formatted = await format(source, { ...config, filepath: file });
    console.log(`W11B_PRETTIER_FILE:${file}:${Buffer.from(formatted, 'utf8').toString('base64')}`);
  });
}
