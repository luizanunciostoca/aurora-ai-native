// TEMPORARY DIAGNOSTIC — remove before acceptance.
// @ts-expect-error -- service harness intentionally omits @types/node.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
// @ts-expect-error -- service harness intentionally omits @types/node.
import { tmpdir } from 'node:os';
// @ts-expect-error -- service harness intentionally omits @types/node.
import { join } from 'node:path';
// @ts-expect-error -- service harness intentionally omits @types/node.
import { spawnSync } from 'node:child_process';
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

test('W05-G diagnostic emits canonical Prettier diff for final leaf files', async () => {
  const targets = [
    ['TYPES', 'services/agent-runtime/src/loop/types.ts'],
    ['TEST', 'services/agent-runtime/test/w05g-bounded-adaptive-loop.test.ts'],
  ] as const;
  const directory = await mkdtemp(join(tmpdir(), 'w05g-prettier-'));

  try {
    for (const [label, path] of targets) {
      const source = await readFile(path, 'utf8');
      const formatted = await format(source, prettierOptions);
      const sourcePath = join(directory, `${label}.source.ts`);
      const formattedPath = join(directory, `${label}.prettier.ts`);
      await writeFile(sourcePath, source, 'utf8');
      await writeFile(formattedPath, formatted, 'utf8');
      const diff = spawnSync(
        'diff',
        ['-u', '--label', `${label}:source`, sourcePath, '--label', `${label}:prettier`, formattedPath],
        { encoding: 'utf8' },
      );
      if (diff.status !== 0 && diff.status !== 1) {
        throw new Error(`diff failed for ${label}: ${diff.stderr}`);
      }
      console.log(`W05G_PRETTIER_${label}_DIFF_START`);
      console.log(diff.stdout || '(already formatted)');
      console.log(`W05G_PRETTIER_${label}_DIFF_END`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
