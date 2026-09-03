// TEMPORARY W11-C FORMAT DELTA DIAGNOSTIC — remove before acceptance.
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import { readFile } from 'node:fs/promises';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import { format, resolveConfig } from 'prettier';

test('emit minimal W11-C Prettier delta', async () => {
  const file = 'packages/revenue/src/social/inbound-routing.ts';
  const source = await readFile(file, 'utf8');
  const config = (await resolveConfig(file)) ?? {};
  const formatted = await format(source, { ...config, filepath: file });

  let prefix = 0;
  while (prefix < source.length && prefix < formatted.length && source[prefix] === formatted[prefix]) {
    prefix += 1;
  }

  let sourceSuffix = source.length;
  let formattedSuffix = formatted.length;
  while (
    sourceSuffix > prefix &&
    formattedSuffix > prefix &&
    source[sourceSuffix - 1] === formatted[formattedSuffix - 1]
  ) {
    sourceSuffix -= 1;
    formattedSuffix -= 1;
  }

  console.log(
    `W11C_PRETTIER_DELTA:${JSON.stringify({
      prefix,
      current: source.slice(prefix, sourceSuffix),
      formatted: formatted.slice(prefix, formattedSuffix),
    })}`,
  );
});
