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

function tscCommand() {
  return resolve(
    repoRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
  );
}

function typecheckProjects(projectPaths) {
  const tsc = tscCommand();
  for (const projectPath of projectPaths) {
    const projectStatus = run(tsc, ['--project', projectPath, '--noEmit', '--pretty', 'false']);
    if (projectStatus !== 0) return projectStatus;
  }
  return 0;
}

function compileAndRunServiceTests(servicePath, testFiles) {
  if (testFiles.length === 0) return 0;
  const tsc = tscCommand();
  let serviceStatus = run(tsc, [
    '--project',
    `${servicePath}/tsconfig.test.json`,
    '--pretty',
    'false',
  ]);
  if (serviceStatus === 0) {
    const serviceRoot = resolve(repoRoot, servicePath);
    const compiledTests = testFiles.map((testFile) =>
      join(serviceRoot, 'dist-test', relative(serviceRoot, testFile).replace(/\.ts$/, '.js')),
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

const n8nBridgeTests = [];
collectTests(resolve(repoRoot, 'services/n8n-bridge/test'), n8nBridgeTests);
n8nBridgeTests.sort();

const mobileGatewayTests = [];
collectTests(resolve(repoRoot, 'services/mobile-gateway'), mobileGatewayTests);
mobileGatewayTests.sort();

const mobileGatewaySourceProjects = [
  'services/mobile-gateway/src/gateway-auth/tsconfig.json',
  'services/mobile-gateway/src/realtime-session/tsconfig.json',
  'services/mobile-gateway/src/progress-cancellation/tsconfig.json',
  'services/mobile-gateway/src/device/tsconfig.json',
  'services/mobile-gateway/src/device-session/tsconfig.json',
  'services/mobile-gateway/src/device-command-delivery/tsconfig.json',
  'services/mobile-gateway/src/device-receipt-ingress/tsconfig.json',
  'services/mobile-gateway/src/physical-host/tsconfig.json',
];

const contextTests = [];
collectTests(resolve(repoRoot, 'packages/context/test'), contextTests);
contextTests.sort();

const providerTests = [];
collectTests(resolve(repoRoot, 'packages/providers/test'), providerTests);
providerTests.sort();

const revenueTests = [];
collectTests(resolve(repoRoot, 'packages/revenue/test'), revenueTests);
revenueTests.sort();

if (
  status === 0 &&
  (executorTests.length > 0 ||
    agentRuntimeTests.length > 0 ||
    n8nBridgeTests.length > 0 ||
    mobileGatewayTests.length > 0 ||
    contextTests.length > 0 ||
    providerTests.length > 0 ||
    revenueTests.length > 0)
) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  status = run(npm, ['run', 'build', '--workspace', '@aurora/contracts']);
}

if (status === 0) {
  status = compileAndRunServiceTests('services/executors', executorTests);
}

if (status === 0) {
  status = compileAndRunServiceTests('services/agent-runtime', agentRuntimeTests);
}

if (status === 0) {
  status = compileAndRunServiceTests('services/n8n-bridge', n8nBridgeTests);
}

if (status === 0 && mobileGatewayTests.length > 0) {
  status = typecheckProjects(mobileGatewaySourceProjects);
}

if (status === 0) {
  status = compileAndRunServiceTests('services/mobile-gateway', mobileGatewayTests);
}

if (status === 0) {
  status = compileAndRunServiceTests('packages/context', contextTests);
}

if (status === 0) {
  status = compileAndRunServiceTests('packages/providers', providerTests);
}

if (status === 0) {
  status = compileAndRunServiceTests('packages/revenue', revenueTests);
}

const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
console.log(
  `[aurora:test] control_tests=${controlTests.length} executor_tests=${executorTests.length} agent_runtime_tests=${agentRuntimeTests.length} n8n_bridge_tests=${n8nBridgeTests.length} mobile_gateway_tests=${mobileGatewayTests.length} context_tests=${contextTests.length} provider_tests=${providerTests.length} revenue_tests=${revenueTests.length} duration_ms=${durationMs.toFixed(2)} exit_code=${status}`,
);
process.exit(status);
