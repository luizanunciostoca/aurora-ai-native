// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import { format } from 'prettier';

const target = 'services/executors/test/w07e-receipt-evidence-readback.test.ts';

test('prints canonical W07-E formatting', async () => {
  const source = readFileSync(target, 'utf8');
  const formatted = await format(source, {
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
  });
  console.log('W07E_PRETTIER_BEGIN');
  console.log(formatted);
  console.log('W07E_PRETTIER_END');
});
