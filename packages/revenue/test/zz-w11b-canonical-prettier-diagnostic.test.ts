// TEMPORARY W11-B FORMAT DIAGNOSTIC — remove before acceptance.
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import { readFile } from 'node:fs/promises';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import { format, resolveConfig } from 'prettier';

for (const file of [
  'packages/revenue/src/social/publication-provider-integration.ts',
  'packages/revenue/test/w11b-publication-provider-integration.test.ts',
]) {
  test(`emit canonical Prettier output for ${file}`, async () => {
    const source = await readFile(file, 'utf8');
    const config = (await resolveConfig(file)) ?? {};
    const formatted = await format(source, { ...config, filepath: file });
    console.log(`W11B_FORMAT_BEGIN:${file}\n${formatted}W11B_FORMAT_END:${file}`);
  });
}
