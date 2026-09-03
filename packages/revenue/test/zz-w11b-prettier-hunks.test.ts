// TEMPORARY W11-B PRETTIER DIAGNOSTIC — remove before acceptance.
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import { readFile } from 'node:fs/promises';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import { format, resolveConfig } from 'prettier';

type Hunk = Readonly<{
  sourceStart: number;
  sourceEnd: number;
  replacement: readonly string[];
}>;

function diffHunks(source: string, formatted: string): readonly Hunk[] {
  const a = source.split('\n');
  const b = formatted.split('\n');
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Uint16Array(cols));

  for (let i = a.length - 1; i >= 0; i -= 1) {
    const row = dp[i];
    const next = dp[i + 1];
    if (row === undefined || next === undefined) continue;
    for (let j = b.length - 1; j >= 0; j -= 1) {
      row[j] = a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }

  const hunks: Hunk[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }

    const sourceStart = i;
    const replacement: string[] = [];
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) break;
      const down = i < a.length ? dp[i + 1]?.[j] ?? 0 : -1;
      const right = j < b.length ? dp[i]?.[j + 1] ?? 0 : -1;
      if (j < b.length && (i >= a.length || right >= down)) {
        replacement.push(b[j]!);
        j += 1;
      } else if (i < a.length) {
        i += 1;
      }
    }
    hunks.push({ sourceStart: sourceStart + 1, sourceEnd: i, replacement });
  }
  return hunks;
}

for (const file of [
  'packages/revenue/src/social/publication-provider-integration.ts',
  'packages/revenue/test/w11b-publication-provider-integration.test.ts',
] as const) {
  test(`emit Prettier hunks for ${file}`, async () => {
    const source = await readFile(file, 'utf8');
    const config = (await resolveConfig(file)) ?? {};
    const formatted = await format(source, { ...config, filepath: file });
    console.log(`W11B_PRETTIER_HUNKS:${file}:${JSON.stringify(diffHunks(source, formatted))}`);
  });
}
