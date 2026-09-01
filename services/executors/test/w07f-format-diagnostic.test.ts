// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import { format } from 'prettier';

const targets = [
  'services/executors/src/reconciliation/types.ts',
  'services/executors/src/reconciliation/reconciliation.ts',
];

test('prints canonical W07-F runtime formatting', async () => {
  for (const target of targets) {
    const formatted = await format(readFileSync(target, 'utf8'), {
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
    console.log(`W07F_PRETTIER_BEGIN:${target}`);
    console.log(formatted);
    console.log(`W07F_PRETTIER_END:${target}`);
  }
});
