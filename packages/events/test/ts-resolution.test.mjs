import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const typecheck = JSON.parse(readFileSync(new URL('../tsconfig.json', import.meta.url), 'utf8'));
const build = JSON.parse(readFileSync(new URL('../tsconfig.build.json', import.meta.url), 'utf8'));

test('events typecheck resolves canonical contracts source without requiring prebuilt dist', () => {
  assert.deepEqual(typecheck.compilerOptions.paths, {
    '@aurora/contracts': ['../contracts/src/index.ts'],
  });
});

test('events build clears source paths so build consumes compiled package boundary', () => {
  assert.deepEqual(build.compilerOptions.paths, {});
  assert.equal(build.compilerOptions.rootDir, 'src');
});
