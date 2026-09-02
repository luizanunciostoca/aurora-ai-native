// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';
import prettier from 'prettier';

function diffHunks(before: string, after: string) {
  const a = before.split('\n');
  const b = after.split('\n');
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i]![j] =
        a[i] === b[j]
          ? (dp[i + 1]![j + 1] ?? 0) + 1
          : Math.max(dp[i + 1]![j] ?? 0, dp[i]![j + 1] ?? 0);
    }
  }
  const ops: { kind: 'same' | 'delete' | 'add'; line: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ kind: 'same', line: a[i]! });
      i += 1;
      j += 1;
      continue;
    }
    if (
      j < b.length &&
      (i === a.length || (dp[i]![j + 1] ?? 0) >= (dp[i + 1]![j] ?? 0))
    ) {
      ops.push({ kind: 'add', line: b[j]! });
      j += 1;
      continue;
    }
    ops.push({ kind: 'delete', line: a[i]! });
    i += 1;
  }
  const hunks: typeof ops[] = [];
  let current: typeof ops = [];
  for (const op of ops) {
    if (op.kind === 'same') {
      if (current.length > 0) {
        hunks.push(current);
        current = [];
      }
    } else current.push(op);
  }
  if (current.length > 0) hunks.push(current);
  return hunks;
}

const prettierOptions = {
  arrowParens: 'always' as const,
  endOfLine: 'lf' as const,
  printWidth: 100,
  proseWrap: 'preserve' as const,
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all' as const,
  useTabs: false,
};

test('W06-E temporary prettier diagnostic', async () => {
  const targets = [
    'packages/context/src/memory-boundaries/types.ts',
    'packages/context/test/w06e-memory-boundaries.test.ts',
  ];
  let changed = 0;
  for (const path of targets) {
    const source = readFileSync(path, 'utf8');
    const formatted = await prettier.format(source, { ...prettierOptions, filepath: path });
    if (formatted === source) continue;
    changed += 1;
    console.log(`[w06e:prettier-hunks:${path}] ${JSON.stringify(diffHunks(source, formatted))}`);
  }
  assert.ok(changed > 0);
});
