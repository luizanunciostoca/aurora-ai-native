import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const startedAt = process.hrtime.bigint();

function collectTests(directory, tests) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) collectTests(absolute, tests);
    else if (entry.isFile() && entry.name.endsWith('.test.ts')) tests.push(absolute);
  }
}

const controlTests = [];
collectTests(resolve(repoRoot, 'packages/control/test'), controlTests);
controlTests.sort();

const testFiles = ['tools/test/smoke.test.mjs', ...controlTests];
const result = spawnSync(
  process.execPath,
  ['--experimental-strip-types', '--test', ...testFiles],
  {
    cwd: repoRoot,
    stdio: 'inherit',
  },
);
const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
console.log(
  `[aurora:test] control_tests=${controlTests.length} duration_ms=${durationMs.toFixed(2)} exit_code=${result.status ?? 1}`,
);
process.exit(result.status ?? 1);
