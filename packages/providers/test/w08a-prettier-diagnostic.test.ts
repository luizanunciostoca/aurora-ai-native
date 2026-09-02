// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import { execFileSync } from 'node:child_process';
// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import { resolve } from 'node:path';
// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

const FILES = [
  'packages/providers/src/bindings/resolver.ts',
  'packages/providers/src/bindings/types.ts',
  'packages/providers/test/w08a-provider-binding.test.ts',
] as const;

test('W08-A temporary diagnostic emits exact Prettier output', () => {
  const prettier = resolve(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prettier.cmd' : 'prettier',
  );
  execFileSync(prettier, ['--write', ...FILES], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  for (const file of FILES) {
    const content = readFileSync(resolve(process.cwd(), file), 'utf8');
    console.log(
      `[w08a:prettier-exact] ${JSON.stringify({ file, contentBase64: Buffer.from(content, 'utf8').toString('base64') })}`,
    );
  }
});
