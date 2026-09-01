// @ts-expect-error -- temporary diagnostic harness; Node 22 provides this built-in at runtime.
import { readFile } from 'node:fs/promises';
// @ts-expect-error -- temporary diagnostic harness; repository dev dependency provides prettier at runtime.
import { format } from 'prettier';
// @ts-expect-error -- temporary diagnostic harness; Node 22 provides this built-in at runtime.
import test from 'node:test';

const targets = [
  'packages/control/src/goal-graph/graph.ts',
  'packages/control/src/goal-graph/types.ts',
  'packages/control/test/w04c-goal-graph.test.ts',
] as const;

test('W04-C temporary formatter diagnostic', async () => {
  for (const target of targets) {
    const source = await readFile(target, 'utf8');
    const output = await format(source, {
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
    console.log(`<<<AURORA_FORMAT:${target}>>>\n${output}<<<AURORA_FORMAT_END:${target}>>>`);
  }
});
