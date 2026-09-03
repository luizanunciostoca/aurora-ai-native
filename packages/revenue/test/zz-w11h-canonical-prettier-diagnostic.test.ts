// TEMPORARY W11-H FORMAT DIAGNOSTIC — remove before acceptance.
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import { readFile } from 'node:fs/promises';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import { format, resolveConfig } from 'prettier';

const file = 'packages/revenue/test/w11h-social-e2e-validation.test.ts';

test(`emit canonical Prettier output for ${file}`, async () => {
  const source = await readFile(file, 'utf8');
  const config = (await resolveConfig(file)) ?? {};
  const formatted = await format(source, { ...config, filepath: file });
  console.log(`W11H_FORMAT_BEGIN:${file}\n${formatted}W11H_FORMAT_END:${file}`);
});
