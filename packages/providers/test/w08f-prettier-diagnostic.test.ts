// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import { spawnSync } from 'node:child_process';
// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

const FILE = 'packages/providers/test/w08f-provider-readback.test.ts';

test('W08-F diagnostic prints remaining canonical Prettier diff', () => {
  const prettier = spawnSync('node_modules/.bin/prettier', ['--write', FILE], { encoding: 'utf8' });
  assert.equal(prettier.status, 0, prettier.stderr || prettier.stdout);
  const diff = spawnSync('git', ['diff', '--', FILE], { encoding: 'utf8' });
  assert.equal(diff.status, 0, diff.stderr || diff.stdout);
  console.log(`[w08f:prettier-test-diff]\n${diff.stdout}`);
});
