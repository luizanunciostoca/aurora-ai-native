import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '../..');

export const canonicalWorkspacePatterns = [
  'apps/*',
  'services/*',
  'packages/*',
  'catalog/*',
  'infra/*',
  'evals/*',
  'tools/*',
];

export const protectedReferenceMarkers = [
  'legacy-reference',
  'legacy-manus-reference',
  'reference',
  'source-archives',
];

const canonicalRoots = canonicalWorkspacePatterns.map((pattern) => pattern.slice(0, -2));
const competingRootLockfiles = ['pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function toPosix(file) {
  return file.split(path.sep).join('/');
}

function isProtectedReference(relativePath) {
  const parts = relativePath.split('/');
  return protectedReferenceMarkers.some((marker) => parts.includes(marker));
}

function walkPackageJsons(dir, relative = '') {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const rel = relative ? path.join(relative, entry.name) : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkPackageJsons(abs, rel));
    } else if (entry.isFile() && entry.name === 'package.json') {
      found.push(toPosix(rel));
    }
  }
  return found;
}

function activeWorkspacePackageFromManifest(relativeManifest) {
  const parts = relativeManifest.split('/');
  if (parts.length !== 3 || parts[2] !== 'package.json') return null;
  if (!canonicalRoots.includes(parts[0])) return null;
  if (isProtectedReference(relativeManifest)) return null;
  return `${parts[0]}/${parts[1]}`;
}

export function discoverWorkspacePackages() {
  const manifests = walkPackageJsons(repoRoot).filter((file) => file !== 'package.json');
  const active = [];
  const excludedReferences = [];
  const unclassified = [];

  for (const manifest of manifests) {
    const activeDir = activeWorkspacePackageFromManifest(manifest);
    if (activeDir) {
      active.push({
        dir: activeDir,
        manifest,
        packageJson: readJson(path.join(repoRoot, manifest)),
      });
    } else if (isProtectedReference(manifest)) {
      excludedReferences.push(manifest);
    } else {
      unclassified.push(manifest);
    }
  }

  return { active, excludedReferences, unclassified };
}

export function validateWorkspace() {
  const errors = [];
  const warnings = [];
  const rootPackage = readJson(path.join(repoRoot, 'package.json'));

  if (rootPackage.private !== true) errors.push('root package.json must set private=true');
  if (rootPackage.packageManager !== 'npm@10.9.2') errors.push('packageManager must be npm@10.9.2');

  const actualPatterns = rootPackage.workspaces ?? [];
  if (JSON.stringify(actualPatterns) !== JSON.stringify(canonicalWorkspacePatterns)) {
    errors.push(`workspace patterns must be exactly: ${canonicalWorkspacePatterns.join(', ')}`);
  }

  for (const root of canonicalRoots) {
    if (!fs.existsSync(path.join(repoRoot, root))) errors.push(`missing canonical workspace root: ${root}/`);
  }

  if (!fs.existsSync(path.join(repoRoot, 'package-lock.json'))) errors.push('missing canonical package-lock.json');
  for (const lockfile of competingRootLockfiles) {
    if (fs.existsSync(path.join(repoRoot, lockfile))) errors.push(`competing root lockfile detected: ${lockfile}`);
  }

  const discovery = discoverWorkspacePackages();
  if (discovery.unclassified.length) {
    errors.push(`unclassified package.json outside canonical direct workspace boundary: ${discovery.unclassified.join(', ')}`);
  }

  if (discovery.excludedReferences.length === 0) {
    warnings.push('no protected reference package.json detected; exclusion rule remains active');
  }

  return { errors, warnings, ...discovery };
}
