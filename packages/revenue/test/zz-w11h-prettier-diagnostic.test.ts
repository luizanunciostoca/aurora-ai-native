// @ts-expect-error -- revenue harness has no @types/node; diagnostic is removed before acceptance.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; diagnostic is removed before acceptance.
import { readFile } from 'node:fs/promises';
// @ts-expect-error -- revenue harness has no @types/node; diagnostic is removed before acceptance.
import test from 'node:test';
import { format } from 'prettier';

const TARGET = 'packages/revenue/test/w11h-social-e2e-validation.test.ts';

test('TEMP W11-H canonical format diagnostic', async () => {
  const raw = await readFile(TARGET, 'utf8');
  const formatted = await format(raw, {
    parser: 'typescript',
    arrowParens: 'always',
    endOfLine: 'lf',
    printWidth: 100,
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'all',
    useTabs: false,
  });

  assert.ok(formatted.length > 0);
  console.log(`W11H_FORMAT_BEGIN:${TARGET}\n${formatted}W11H_FORMAT_END:${TARGET}`);
});
