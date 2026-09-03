// TEMPORARY W11-E FORMAT DIAGNOSTIC — remove before acceptance.
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import { readFile } from 'node:fs/promises';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import { format, resolveConfig } from 'prettier';

test('emit canonical Prettier output for W11-E implementation', async () => {
  const file = 'packages/revenue/src/social/sensitive-moderation.ts';
  const source = await readFile(file, 'utf8');
  const config = (await resolveConfig(file)) ?? {};
  const formatted = await format(source, { ...config, filepath: file });
  console.log(`W11E_FORMAT_BEGIN:${file}\n${formatted}W11E_FORMAT_END:${file}`);
});
