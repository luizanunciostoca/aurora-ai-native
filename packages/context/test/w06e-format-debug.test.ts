// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';
import { format } from 'prettier';

test('W06-E formatter diagnostic', async () => {
  const path = 'packages/context/src/memory-boundaries/model.ts';
  const source = readFileSync(path, 'utf8');
  const formatted = await format(source, {
    arrowParens: 'always',
    endOfLine: 'lf',
    printWidth: 100,
    proseWrap: 'preserve',
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'all',
    useTabs: false,
    parser: 'typescript',
  });
  // @ts-expect-error -- console is provided by Node; no @types/node in this harness.
  console.log(`[w06e:format]${JSON.stringify(formatted)}`);
});
