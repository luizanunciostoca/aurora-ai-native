// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';
import { format } from 'prettier';

const paths = [
  'packages/context/src/retrieval/evaluate.ts',
  'packages/context/src/retrieval/types.ts',
  'packages/context/test/w06b-retrieval-ranking.test.ts',
] as const;

test('W06-B formatter diagnostic', async () => {
  for (const path of paths) {
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
    console.log(`[w06b:format:${path}]${JSON.stringify(formatted)}`);
  }
});
