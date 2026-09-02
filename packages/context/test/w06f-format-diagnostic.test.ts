// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import { readFile } from 'node:fs/promises';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
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

test('W06-F reports exact final Prettier differences after hardening', async () => {
  for (const file of [
    'packages/context/src/semantic-cache/index.ts',
    'packages/context/test/w06f-semantic-cache.test.ts',
  ]) {
    const before = await readFile(file, 'utf8');
    const config = (await resolveConfig(file)) ?? {};
    const after = await format(before, { ...config, filepath: file });
    const diff = differingWindow(before, after);
    console.log('[w06f:final-prettier-diff]', JSON.stringify({ file, ...diff }));
    assert.notEqual(before, after);
  }
});
