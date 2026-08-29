import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const startedAt = process.hrtime.bigint();
const result = spawnSync(process.execPath, ['--test', 'tools/test/smoke.test.mjs'], {
  cwd: repoRoot,
  stdio: 'inherit',
});
const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
console.log(`[w00-c:test] duration_ms=${durationMs.toFixed(2)} exit_code=${result.status ?? 1}`);
process.exit(result.status ?? 1);
