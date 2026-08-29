#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(process.argv[2] ?? '.');
const ignored = new Set(['.git', 'node_modules', '.pnpm-store', 'dist', 'build', 'coverage']);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) files.push(full);
  }
}
walk(root);

const rel = (p) => path.relative(root, p).split(path.sep).join('/');
const hashes = new Map();
const zeroByte = [];
const suspiciousNames = [];
const structuralMarkers = [];
const brokenRelativeRefs = [];
const legacyFiles = [];
const sourceExt = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.html', '.htm', '.css']);
const namePattern = /(?:^|[-_.])(backup|bak|copy|final\d*|new(?:-new)*|old)(?:[-_.]|$)/i;
const markerPattern = /\b(TODO|FIXME|PLACEHOLDER|STUB|omitted for brevity)\b/i;

function isLegacy(p) {
  return (
    p.includes('/legacy-reference/') ||
    p.includes('/legacy-manus-reference/') ||
    p.startsWith('reference/')
  );
}

function resolveCandidate(fromFile, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null;
  const base = spec.startsWith('/')
    ? path.join(root, spec)
    : path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.jsx`,
    `${base}.json`,
    path.join(base, 'index.js'),
    path.join(base, 'index.ts'),
  ];
  return candidates.some(fs.existsSync) ? null : rel(base);
}

function scanRefs(file, text) {
  const refs = [];
  const patterns = [
    /(?:import\s+(?:[^'"]+?\s+from\s+)?|require\s*\(|import\s*\()\s*['"]([^'"]+)['"]/g,
    /(?:src|href)\s*=\s*['"]([^'"]+)['"]/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) refs.push(m[1]);
  }
  for (const spec of refs) {
    if (/^(?:https?:|data:|#|mailto:|javascript:)/i.test(spec)) continue;
    const missing = resolveCandidate(file, spec);
    if (missing) {
      brokenRelativeRefs.push({
        file: rel(file),
        ref: spec,
        expected: missing,
        legacy: isLegacy(rel(file)),
      });
    }
  }
}

for (const file of files) {
  const r = rel(file);
  const stat = fs.statSync(file);
  if (stat.size === 0) zeroByte.push(r);
  if (namePattern.test(path.basename(file))) suspiciousNames.push(r);
  if (isLegacy(r)) legacyFiles.push(r);

  const buf = fs.readFileSync(file);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const paths = hashes.get(hash) ?? [];
  paths.push(r);
  hashes.set(hash, paths);

  const ext = path.extname(file).toLowerCase();
  if (sourceExt.has(ext) || ['.py', '.md', '.txt', '.json'].includes(ext)) {
    const text = buf.toString('utf8');
    if (markerPattern.test(text)) structuralMarkers.push(r);
    if (sourceExt.has(ext)) scanRefs(file, text);
  }
}

const duplicates = [...hashes.entries()]
  .filter(([, paths]) => paths.length > 1)
  .map(([sha256, paths]) => ({ sha256, paths }));
const canonicalBrokenRefs = brokenRelativeRefs.filter((entry) => !entry.legacy);

const report = {
  schema: 'aurora.repository_cleanup_audit.v1',
  root,
  totals: {
    files: files.length,
    legacyOrReferenceFiles: legacyFiles.length,
    zeroByte: zeroByte.length,
    duplicateGroups: duplicates.length,
    brokenRelativeRefs: brokenRelativeRefs.length,
    canonicalBrokenRelativeRefs: canonicalBrokenRefs.length,
  },
  zeroByte,
  suspiciousNames,
  structuralMarkers,
  duplicates,
  brokenRelativeRefs,
};

console.log(JSON.stringify(report, null, 2));
process.exitCode = canonicalBrokenRefs.length > 0 ? 2 : 0;
