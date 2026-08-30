import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageDir, '../..');
const packageRoots = ['contracts', 'registries', 'schemas'].map((name) =>
  path.join(repoRoot, 'packages', name, 'src'),
);
const protectedReferenceMarkers = [
  ['legacy', 'reference'].join('-'),
  ['legacy', 'manus', 'reference'].join('-'),
  'source-archives',
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory()
      ? walk(absolute)
      : entry.isFile() && entry.name.endsWith('.ts')
        ? [absolute]
        : [];
  });
}

function text(file) {
  return fs.readFileSync(file, 'utf8');
}

function relative(file) {
  return path.relative(repoRoot, file).split(path.sep).join('/');
}

function importSpecifiers(source) {
  const pattern = /(?:from\s+|import\s*\()(['"])([^'"]+)\1/g;
  return [...source.matchAll(pattern)].map((match) => match[2]);
}

function resolveRelativeImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier.replace(/\.js$/, ''));
  const candidates = [`${base}.ts`, path.join(base, 'index.ts')];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function containsProtectedReferenceMaterial(specifier) {
  return protectedReferenceMarkers.some((marker) => specifier.includes(marker));
}

test('package dependency direction has no runtime/service or legacy inversion', () => {
  const violations = [];

  for (const file of walk(path.join(repoRoot, 'packages', 'contracts', 'src'))) {
    for (const specifier of importSpecifiers(text(file))) {
      if (
        /^@aurora\/(schemas|registries)(?:\/|$)/.test(specifier) ||
        /(?:^|\/)packages\/(schemas|registries)(?:\/|$)/.test(specifier)
      ) {
        violations.push(`${relative(file)} imports schema/registry implementation`);
      }
      if (
        /(?:^|\/)(apps|services)\//.test(specifier) ||
        containsProtectedReferenceMaterial(specifier)
      ) {
        violations.push(`${relative(file)} depends on runtime/reference material`);
      }
    }
  }

  for (const packageName of ['registries', 'schemas']) {
    for (const file of walk(path.join(repoRoot, 'packages', packageName, 'src'))) {
      for (const specifier of importSpecifiers(text(file))) {
        if (/^\.\.\/\.\.\/\.\.\/(contracts|registries)\/src\//.test(specifier)) {
          violations.push(`${relative(file)} bypasses a public package export`);
        }
        if (containsProtectedReferenceMaterial(specifier)) {
          violations.push(`${relative(file)} depends on protected reference material`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('canonical shared primitives have one defining source', () => {
  const files = packageRoots.flatMap(walk);
  const checks = new Map([
    ['TenantId', /export type TenantId\s*=/g],
    ['IdentityId', /export type IdentityId\s*=/g],
    ['CorrelationId', /export type CorrelationId\s*=/g],
    ['ContractVersion', /export type ContractVersion\s*=/g],
  ]);
  for (const [name, pattern] of checks) {
    const definitions = files.flatMap((file) =>
      (text(file).match(pattern) ?? []).map(() => relative(file)),
    );
    assert.deepEqual(definitions.length, 1, `${name} definitions: ${definitions.join(', ')}`);
  }
});

test('relative source-module graph has no cycles', () => {
  for (const root of packageRoots) {
    const files = walk(root);
    const fileSet = new Set(files);
    const graph = new Map();
    for (const file of files) {
      const edges = [];
      for (const specifier of importSpecifiers(text(file))) {
        const target = resolveRelativeImport(file, specifier);
        if (target && fileSet.has(target)) edges.push(target);
      }
      graph.set(file, edges);
    }
    const visiting = new Set();
    const visited = new Set();
    const stack = [];
    function visit(node) {
      if (visited.has(node)) return;
      if (visiting.has(node)) {
        const start = stack.indexOf(node);
        const cycle = [...stack.slice(start), node].map(relative).join(' -> ');
        assert.fail(`circular dependency detected: ${cycle}`);
      }
      visiting.add(node);
      stack.push(node);
      for (const edge of graph.get(node) ?? []) visit(edge);
      stack.pop();
      visiting.delete(node);
      visited.add(node);
    }
    for (const file of files) visit(file);
  }
});
