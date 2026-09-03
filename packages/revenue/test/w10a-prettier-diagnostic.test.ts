// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import { spawnSync } from 'node:child_process';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

const FILES = [
  'packages/revenue/src/lifecycle/lifecycle.ts',
  'packages/revenue/src/lifecycle/types.ts',
];

test('W10-A diagnostic prints canonical Prettier diff', () => {
  const prettier = spawnSync('node_modules/.bin/prettier', ['--write', ...FILES], {
    encoding: 'utf8',
  });
  assert.equal(prettier.status, 0, prettier.stderr || prettier.stdout);

  const diff = spawnSync('git', ['diff', '--', ...FILES], { encoding: 'utf8' });
  assert.equal(diff.status, 0, diff.stderr || diff.stdout);
  console.log(`[w10a:prettier-diff]\n${diff.stdout}`);
});
