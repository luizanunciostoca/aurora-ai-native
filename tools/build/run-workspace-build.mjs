import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootManifestPath = join(repoRoot, 'package.json');
const canonicalRoots = ['apps', 'services', 'packages', 'catalog', 'infra', 'evals'];
const excludedSegments = new Set(['legacy-reference', 'legacy-manus-reference', 'reference', 'node_modules', 'dist', 'build', '.git']);

function fail(message, code = 1) {
  console.error(`[w00-c:build] ${message}`);
  process.exit(code);
}

function walkManifests(root) {
  if (!existsSync(root)) return [];
  const manifests = [];
  for (const entry of readdirSync(root)) {
    const fullPath = join(root, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (excludedSegments.has(entry)) continue;
      manifests.push(...walkManifests(fullPath));
    } else if (entry === 'package.json') {
      manifests.push(fullPath);
    }
  }
  return manifests;
}

if (!existsSync(rootManifestPath)) {
  fail('W00C_BLOCKED_W00A: root package.json is absent; canonical workspace/package-manager baseline is not integrated.', 2);
}

let rootManifest;
try {
  rootManifest = JSON.parse(readFileSync(rootManifestPath, 'utf8'));
} catch (error) {
  fail(`invalid root package.json: ${error.message}`, 2);
}

const packageManagerField = rootManifest.packageManager;
if (typeof packageManagerField !== 'string' || !packageManagerField.includes('@')) {
  fail('W00C_BLOCKED_W00A: root package.json must declare an exact packageManager (for example pnpm@X.Y.Z).', 2);
}

const packageManager = packageManagerField.slice(0, packageManagerField.lastIndexOf('@'));
if (!['pnpm', 'npm', 'yarn'].includes(packageManager)) {
  fail(`unsupported canonical package manager: ${packageManager}`, 2);
}

const manifests = canonicalRoots.flatMap((root) => walkManifests(join(repoRoot, root)));
const buildTargets = [];
for (const manifestPath of manifests) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`invalid workspace manifest ${relative(repoRoot, manifestPath)}: ${error.message}`, 2);
  }
  if (typeof manifest?.scripts?.build === 'string' && manifest.scripts.build.trim()) {
    buildTargets.push({ manifestPath, cwd: dirname(manifestPath), name: manifest.name ?? relative(repoRoot, dirname(manifestPath)) });
  }
}

const startedAt = process.hrtime.bigint();
for (const target of buildTargets) {
  console.log(`[w00-c:build] target=${target.name}`);
  const result = spawnSync(packageManager, ['run', 'build'], {
    cwd: target.cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) fail(`failed to execute ${packageManager} for ${target.name}: ${result.error.message}`);
  if (result.status !== 0) fail(`build failed for ${target.name} with exit code ${result.status}`, result.status ?? 1);
}

const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
console.log(`[w00-c:build] package_manager=${packageManager} targets=${buildTargets.length} duration_ms=${durationMs.toFixed(2)} exit_code=0`);
if (buildTargets.length === 0) {
  console.log('[w00-c:build] canonical baseline currently contains no package-level build scripts; legacy-reference manifests were intentionally excluded.');
}
