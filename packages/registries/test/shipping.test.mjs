import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
const protectedReferenceMarkers = [
  ['legacy', 'reference'].join('-'),
  ['legacy', 'manus', 'reference'].join('-'),
  'source-archives',
];

function exportedTargets(exportsMap) {
  return Object.values(exportsMap).flatMap((entry) =>
    typeof entry === 'string' ? [entry] : Object.values(entry),
  );
}

test('all public export targets exist in built output', () => {
  for (const target of exportedTargets(manifest.exports ?? {})) {
    assert.equal(typeof target, 'string');
    assert.equal(target.startsWith('./dist/'), true, `non-dist export target: ${target}`);
    assert.equal(
      fs.existsSync(path.resolve(packageDir, target)),
      true,
      `missing export target: ${target}`,
    );
  }
});

test('npm shipping set excludes source, tests and reference material', () => {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: packageDir,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  const files = report[0]?.files?.map((entry) => entry.path) ?? [];
  assert.ok(files.length > 0, 'npm pack dry-run returned no files');
  const forbidden = files.filter(
    (file) =>
      /^(src|test|dist-test)\//.test(file) ||
      protectedReferenceMarkers.some((marker) => file.includes(marker)),
  );
  assert.deepEqual(forbidden, []);
});
