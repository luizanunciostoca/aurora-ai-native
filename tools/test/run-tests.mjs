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

function compileAndRunServiceTests(servicePath, testFiles) {
  if (testFiles.length === 0) return 0;
  const tsc = resolve(
    repoRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
  );
  let serviceStatus = run(tsc, [
    '--project',
    `${servicePath}/tsconfig.test.json`,
    '--pretty',
    'false',
  ]);
  if (serviceStatus === 0) {
    const testRoot = resolve(repoRoot, servicePath, 'test');
    const compiledTests = testFiles.map((testFile) =>
      join(
        repoRoot,
        servicePath,
        'dist-test/test',
        relative(testRoot, testFile).replace(/\.ts$/, '.js'),
      ),
    );
    serviceStatus = run(process.execPath, ['--test', ...compiledTests]);
  }
  rmSync(resolve(repoRoot, servicePath, 'dist-test'), { recursive: true, force: true });
  return serviceStatus;
}

const controlTests = [];
collectTests(resolve(repoRoot, 'packages/control/test'), controlTests);
controlTests.sort();

const testFiles = ['tools/test/smoke.test.mjs', ...controlTests];
let status = run(process.execPath, ['--experimental-strip-types', '--test', ...testFiles]);

const executorTests = [];
collectTests(resolve(repoRoot, 'services/executors/test'), executorTests);
executorTests.sort();

const agentRuntimeTests = [];
collectTests(resolve(repoRoot, 'services/agent-runtime/test'), agentRuntimeTests);
agentRuntimeTests.sort();

if (status === 0 && (executorTests.length > 0 || agentRuntimeTests.length > 0)) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  status = run(npm, ['run', 'build', '--workspace', '@aurora/contracts']);
}

if (status === 0) {
  status = compileAndRunServiceTests('services/executors', executorTests);
}

if (status === 0) {
  status = compileAndRunServiceTests('services/agent-runtime', agentRuntimeTests);
}

const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
console.log(
  `[aurora:test] control_tests=${controlTests.length} executor_tests=${executorTests.length} agent_runtime_tests=${agentRuntimeTests.length} duration_ms=${durationMs.toFixed(2)} exit_code=${status}`,
);
process.exit(status);
