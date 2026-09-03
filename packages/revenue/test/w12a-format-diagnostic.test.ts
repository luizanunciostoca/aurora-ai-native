// TEMPORARY DIAGNOSTIC — remove before acceptance.
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import { format } from 'prettier';

const options = {
  parser: 'typescript',
  arrowParens: 'always',
  endOfLine: 'lf',
  printWidth: 100,
  proseWrap: 'preserve',
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
  useTabs: false,
} as const;

test('W12-A temporary prettier diagnostic', async () => {
  const sourcePath = 'packages/revenue/src/meta-ads/contracts.ts';
  const testPath = 'packages/revenue/test/w12a-meta-ads-domain-contracts.test.ts';
  const source = await format(readFileSync(sourcePath, 'utf8'), options);
  const testSource = await format(readFileSync(testPath, 'utf8'), options);
  throw new Error(`W12A_FORMATTED_SOURCE_START\n${source}W12A_FORMATTED_SOURCE_END\nW12A_FORMATTED_TEST_START\n${testSource}W12A_FORMATTED_TEST_END`);
});
