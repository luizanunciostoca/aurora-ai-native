// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import { execFileSync } from 'node:child_process';
// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import { resolve } from 'node:path';
// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import process from 'node:process';
// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

const FILES = [
  'packages/providers/src/credentials/resolver.ts',
  'packages/providers/test/w08b-secret-reference-credential.test.ts',
] as const;

test('W08-B temporary diagnostic emits exact Prettier diff', () => {
  const cwd = process.cwd();
  const prettier = resolve(
    cwd,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prettier.cmd' : 'prettier',
  );
  execFileSync(prettier, ['--write', ...FILES], { cwd, stdio: 'pipe' });

  const diff = execFileSync('git', ['diff', '--no-color', '--unified=2', '--', ...FILES], {
    cwd,
    encoding: 'utf8',
  });
  console.log(`[w08b:prettier-diff]\n${diff}`);
});
