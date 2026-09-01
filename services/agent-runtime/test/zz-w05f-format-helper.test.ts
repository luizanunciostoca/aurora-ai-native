// @ts-expect-error -- service harness has no @types/node; Node 22 provides this built-in.
import { readFile } from 'node:fs/promises';
// @ts-expect-error -- service harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';
import { format } from 'prettier';

test('W05-F formatter oracle', async () => {
  const source = await readFile('services/agent-runtime/src/runtime/pool.ts', 'utf8');
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
  console.log('W05F_FORMAT_BEGIN');
  console.log(formatted);
  console.log('W05F_FORMAT_END');
});
