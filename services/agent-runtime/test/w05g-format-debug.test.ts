// TEMPORARY DIAGNOSTIC — remove before acceptance.
// @ts-expect-error -- service harness intentionally omits @types/node.
import { readFile } from 'node:fs/promises';
// @ts-expect-error -- service harness intentionally omits @types/node.
import { Buffer } from 'node:buffer';
// @ts-expect-error -- service harness intentionally omits @types/node.
import test from 'node:test';
import { format } from 'prettier';

const prettierOptions = {
  parser: 'typescript',
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  semi: true,
} as const;

test('W05-G diagnostic emits canonical Prettier output for final leaf files', async () => {
  const targets = [
    ['TYPES', 'services/agent-runtime/src/loop/types.ts'],
    ['TEST', 'services/agent-runtime/test/w05g-bounded-adaptive-loop.test.ts'],
  ] as const;

  for (const [label, path] of targets) {
    const source = await readFile(path, 'utf8');
    const formatted = await format(source, prettierOptions);
    console.log(`W05G_PRETTIER_${label}_BASE64=${Buffer.from(formatted, 'utf8').toString('base64')}`);
  }
});
