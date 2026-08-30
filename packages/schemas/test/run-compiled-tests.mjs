import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(packageDir, 'dist-test');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(absolute) : entry.isFile() ? [absolute] : [];
  });
}

const tests = walk(outputDir)
  .filter((file) => file.endsWith('.test.js') || file.endsWith('.contract-test.js'))
  .sort();

if (tests.length === 0) {
  process.stderr.write('CONTRACT_TEST_DISCOVERY_FAILED: no compiled contract tests found\n');
  process.exit(1);
}

for (const file of tests) {
  process.stdout.write(`CONTRACT_TEST: ${path.relative(packageDir, file)}\n`);
  const result = spawnSync(process.execPath, [file], { cwd: packageDir, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write(`CONTRACT_TEST_MATRIX_EXECUTED: ${tests.length} compiled test files\n`);
