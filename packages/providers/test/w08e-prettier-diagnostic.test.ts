// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import { spawnSync } from 'node:child_process';
// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import process from 'node:process';
// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

const TARGETS = [
  'packages/providers/src/health/normalize.ts',
  'packages/providers/src/health/types.ts',
  'packages/providers/test/w08e-provider-health.test.ts',
] as const;

test('W08-E diagnostic emits exact Prettier 3.9.6 diff', () => {
  const format = spawnSync(
    process.execPath,
    ['node_modules/prettier/bin/prettier.cjs', '--write', ...TARGETS],
    { encoding: 'utf8' },
  );
  if (format.status !== 0) {
    throw new Error(`Prettier diagnostic failed: ${format.stderr}`);
  }

  const diff = spawnSync('git', ['diff', '--', ...TARGETS], { encoding: 'utf8' });
  if (diff.status !== 0) {
    throw new Error(`git diff diagnostic failed: ${diff.stderr}`);
  }
  console.log(`[w08e:prettier-diff]\n${diff.stdout}`);
});
