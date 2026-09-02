// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import { readFile } from 'node:fs/promises';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import { format, resolveConfig } from 'prettier';

interface DiffOp {
  readonly kind: 'same' | 'delete' | 'insert';
  readonly line: string;
}

function lineDiff(before: string, after: string): DiffOp[] {
  const left = before.split('\n');
  const right = after.split('\n');
  const dp = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      dp[i]![j] =
        left[i] === right[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const operations: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      operations.push({ kind: 'same', line: left[i]! });
      i += 1;
      j += 1;
    } else if (j < right.length && (i >= left.length || dp[i]![j + 1]! >= dp[i + 1]![j]!)) {
      operations.push({ kind: 'insert', line: right[j]! });
      j += 1;
    } else {
      operations.push({ kind: 'delete', line: left[i]! });
      i += 1;
    }
  }
  return operations;
}

function hunks(before: string, after: string) {
  const operations = lineDiff(before, after);
  const result: Array<{ oldStart: number; oldLines: string[]; newLines: string[] }> = [];
  let oldLine = 1;
  let current: { oldStart: number; oldLines: string[]; newLines: string[] } | undefined;

  for (const operation of operations) {
    if (operation.kind === 'same') {
      if (current) {
        result.push(current);
        current = undefined;
      }
      oldLine += 1;
      continue;
    }
    current ??= { oldStart: oldLine, oldLines: [], newLines: [] };
    if (operation.kind === 'delete') {
      current.oldLines.push(operation.line);
      oldLine += 1;
    } else {
      current.newLines.push(operation.line);
    }
  }
  if (current) result.push(current);
  return result;
}

test('W06-H reports exact Prettier hunks for the candidate evidence file', async () => {
  const file = 'packages/context/test/w06h-context-quality-performance.test.ts';
  const before = await readFile(file, 'utf8');
  const config = (await resolveConfig(file)) ?? {};
  const after = await format(before, { ...config, filepath: file });
  const changes = hunks(before, after);
  console.log('[w06h:prettier-hunks]', JSON.stringify({ file, changes }));
  assert.ok(changes.length > 0);
});
