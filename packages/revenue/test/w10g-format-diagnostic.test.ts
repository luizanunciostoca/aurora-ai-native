// @ts-expect-error -- revenue test harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue test harness has no @types/node; Node 22 provides this built-in.
import { readFile } from 'node:fs/promises';
// @ts-expect-error -- revenue test harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import { format, resolveConfig } from 'prettier';

function differingWindow(before: string, after: string) {
  const original = before.split('\n');
  const formatted = after.split('\n');
  let start = 0;
  while (start < original.length && start < formatted.length && original[start] === formatted[start]) {
    start += 1;
  }
  let originalEnd = original.length - 1;
  let formattedEnd = formatted.length - 1;
  while (
    originalEnd >= start &&
    formattedEnd >= start &&
    original[originalEnd] === formatted[formattedEnd]
  ) {
    originalEnd -= 1;
    formattedEnd -= 1;
  }
  return {
    startLine: start + 1,
    before: original.slice(start, originalEnd + 1),
    after: formatted.slice(start, formattedEnd + 1),
  };
}

test('W10-G reports exact Prettier differences for the current candidate', async () => {
  for (const file of [
    'packages/revenue/src/integration/evaluator.ts',
    'packages/revenue/src/integration/types.ts',
    'packages/revenue/test/w10g-revenue-integration.test.ts',
  ]) {
    const before = await readFile(file, 'utf8');
    const config = (await resolveConfig(file)) ?? {};
    const after = await format(before, { ...config, filepath: file });
    const diff = differingWindow(before, after);
    console.log('[w10g:prettier-diff]', JSON.stringify({ file, ...diff }));
    assert.notEqual(before, after);
  }
});