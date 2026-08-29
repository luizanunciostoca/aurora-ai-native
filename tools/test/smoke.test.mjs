import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const canonicalRoots = ['apps', 'services', 'packages', 'catalog', 'infra', 'evals'];
const excludedSegments = new Set(['legacy-reference', 'legacy-manus-reference', 'reference', 'node_modules', 'dist', 'build', '.git']);
const sourceExtensions = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.py', '.sh']);
const legacyDependencyPattern = /(?:legacy-reference|legacy-manus-reference|reference\/original-manus)/;

function walkFiles(root, { excludeLegacy = true } = {}) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root)) {
    const fullPath = join(root, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (excludeLegacy && excludedSegments.has(entry)) continue;
      files.push(...walkFiles(fullPath, { excludeLegacy }));
    } else files.push(fullPath);
  }
  return files;
}

test('canonical baseline roots exist', () => {
  for (const root of canonicalRoots) {
    const path = join(repoRoot, root);
    assert.ok(existsSync(path), `missing canonical root: ${root}`);
    assert.ok(statSync(path).isDirectory(), `canonical root is not a directory: ${root}`);
  }
});

test('canonical runtime source has no dependency on legacy-reference trees', () => {
  const offenders = [];
  for (const root of canonicalRoots) {
    for (const file of walkFiles(join(repoRoot, root))) {
      if (!sourceExtensions.has(extname(file))) continue;
      if (legacyDependencyPattern.test(readFileSync(file, 'utf8'))) offenders.push(relative(repoRoot, file));
    }
  }
  assert.deepEqual(offenders, [], `canonical source references legacy trees: ${offenders.join(', ')}`);
});

test('W00-C tooling contains no failure-masking shell operator', () => {
  const offenders = [];
  for (const root of ['tools/test', 'tools/build']) {
    for (const file of walkFiles(join(repoRoot, root), { excludeLegacy: false })) {
      const maskingOperator = ['|', '|', ' ', 'true'].join('');
      if (readFileSync(file, 'utf8').includes(maskingOperator)) offenders.push(relative(repoRoot, file));
    }
  }
  assert.deepEqual(offenders, [], `failure masking found in: ${offenders.join(', ')}`);
});

test('legacy test/build references are audit-only and never promoted implicitly', (t) => {
  const legacyManifest = join(repoRoot, 'apps/aurora-desktop/legacy-reference/face/interface/package.json');
  if (!existsSync(legacyManifest)) return t.diagnostic('legacy interface manifest is absent; nothing to audit');
  const manifest = JSON.parse(readFileSync(legacyManifest, 'utf8'));
  const candidates = [manifest?.jest?.setupFilesAfterEnv?.[0]?.replace('<rootDir>/', ''), manifest?.build?.win?.icon].filter(Boolean);
  const missing = candidates.filter((candidate) => !existsSync(join(dirname(legacyManifest), candidate)));
  if (missing.length > 0) t.diagnostic(`LEGACY_REFERENCE_DEBT (non-blocking): ${missing.join(', ')}`);
});
