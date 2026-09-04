// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import { spawnSync } from 'node:child_process';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import { readFile, rm, writeFile } from 'node:fs/promises';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';
import { format, resolveConfig } from 'prettier';

const TARGETS = [
  'packages/revenue/src/meta-ads/governed-operations.ts',
  'packages/revenue/test/w12d-meta-ads-paused-first-operations.test.ts',
] as const;

test('W12-D temporary diagnostic prints the exact locked-Prettier diff', async () => {
  for (const [index, path] of TARGETS.entries()) {
    const source = await readFile(path, 'utf8');
    const config = await resolveConfig(path);
    const formatted = await format(source, { ...(config ?? {}), filepath: path });
    const before = `/tmp/w12d-prettier-${index}-before`;
    const after = `/tmp/w12d-prettier-${index}-after`;
    await writeFile(before, source, 'utf8');
    await writeFile(after, formatted, 'utf8');
    const diff = spawnSync(
      'diff',
      ['-u', '--label', path, '--label', `${path} (Prettier 3.9.6)`, before, after],
      { encoding: 'utf8' },
    );
    console.log(`W12D_PRETTIER_DIFF_BEGIN ${path}`);
    console.log(diff.stdout);
    console.log(`W12D_PRETTIER_DIFF_END ${path}`);
    await rm(before, { force: true });
    await rm(after, { force: true });
  }
});
