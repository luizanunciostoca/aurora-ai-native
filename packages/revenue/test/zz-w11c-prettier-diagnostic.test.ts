// TEMPORARY W11-C DIAGNOSTIC — remove before acceptance.
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import { readFile } from 'node:fs/promises';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import { format, resolveConfig } from 'prettier';

test('emit canonical Prettier output for W11-C inbound file', async () => {
  const file = 'packages/revenue/src/social/inbound-routing.ts';
  const source = await readFile(file, 'utf8');
  const config = (await resolveConfig(file)) ?? {};
  const formatted = await format(source, { ...config, filepath: file });
  console.log(`W11C_FORMAT_BEGIN:${file}\n${formatted}W11C_FORMAT_END:${file}`);
});
