import { existsSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
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

function run(command, args) {
  return spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit' }).status ?? 1;
}

const controlTests = [];
collectTests(resolve(repoRoot, 'packages/control/test'), controlTests);
controlTests.sort();

const testFiles = ['tools/test/smoke.test.mjs', ...controlTests];
let status = run(process.execPath, ['--experimental-strip-types', '--test', ...testFiles]);

const executorTests = [];
collectTests(resolve(repoRoot, 'services/executors/test'), executorTests);
executorTests.sort();

if (status === 0 && executorTests.length > 0) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  status = run(npm, ['run', 'build', '--workspace', '@aurora/contracts']);

  if (status === 0) {
    const tsc = resolve(
      repoRoot,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
    );
    status = run(tsc, ['--project', 'services/executors/tsconfig.test.json', '--pretty', 'false']);
  }

  if (status === 0) {
    const testRoot = resolve(repoRoot, 'services/executors/test');
    const compiledTests = executorTests.map((testFile) =>
      join(
        repoRoot,
        'services/executors/dist-test/test',
        relative(testRoot, testFile).replace(/\.ts$/, '.js'),
      ),
    );
    status = run(process.execPath, ['--test', ...compiledTests]);
  }

  rmSync(resolve(repoRoot, 'services/executors/dist-test'), { recursive: true, force: true });
}

const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
console.log(
  `[aurora:test] control_tests=${controlTests.length} executor_tests=${executorTests.length} duration_ms=${durationMs.toFixed(2)} exit_code=${status}`,
);
process.exit(status);
