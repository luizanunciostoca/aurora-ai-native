// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import { spawnSync } from 'node:child_process';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import { resolve } from 'node:path';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import { cwd } from 'node:process';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import * as prettier from 'prettier';

const repoRoot = cwd();
const targets = [
  'packages/context/src/memory-fabric/fabric.ts',
  'packages/context/src/memory-fabric/index.ts',
  'packages/context/src/memory-fabric/source-adapter.ts',
  'packages/context/src/memory-fabric/types.ts',
  'packages/context/test/w06i-memory-fabric.test.ts',
] as const;

test('W06-I emits exact Prettier diffs for the candidate files', async () => {
  for (const [index, relativePath] of targets.entries()) {
    const absolutePath = resolve(repoRoot, relativePath);
    const current = readFileSync(absolutePath, 'utf8');
    const config = (await prettier.resolveConfig(absolutePath)) ?? {};
    const formatted = await prettier.format(current, { ...config, filepath: absolutePath });
    if (formatted === current) continue;

    const temporaryPath = resolve('/tmp', `aurora-w06i-prettier-${index}.txt`);
    writeFileSync(temporaryPath, formatted, 'utf8');
    const diff = spawnSync(
      'diff',
      [
        '-u',
        '--label',
        relativePath,
        '--label',
        `${relativePath} (prettier)`,
        absolutePath,
        temporaryPath,
      ],
      { encoding: 'utf8' },
    );
    console.log(
      `\n=== W06-I PRETTIER DIFF: ${relativePath} ===\n${diff.stdout}\n=== END W06-I PRETTIER DIFF ===\n`,
    );
    rmSync(temporaryPath, { force: true });
  }
});
