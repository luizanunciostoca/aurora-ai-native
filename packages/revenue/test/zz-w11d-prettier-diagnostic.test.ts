// TEMPORARY W11-D DIAGNOSTIC — remove before acceptance.
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import { readFile } from 'node:fs/promises';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import { format, resolveConfig } from 'prettier';

test('emit canonical Prettier output for W11-D files', async () => {
  for (const file of [
    'packages/revenue/src/social/verified-faq.ts',
    'packages/revenue/test/w11d-verified-faq-fast-path.test.ts',
  ]) {
    const source = await readFile(file, 'utf8');
    const config = (await resolveConfig(file)) ?? {};
    const formatted = await format(source, { ...config, filepath: file });
    console.log(`W11D_FORMAT_BEGIN:${file}\n${formatted}W11D_FORMAT_END:${file}`);
  }
});
