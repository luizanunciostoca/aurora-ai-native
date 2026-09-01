// @ts-expect-error -- temporary W04-B CI diagnostic uses Node 22 built-ins from the lock-safe control harness.
import { execFileSync } from 'node:child_process';
// @ts-expect-error -- temporary W04-B CI diagnostic uses Node 22 built-ins from the lock-safe control harness.
import test from 'node:test';

const files = [
  'packages/control/src/capability-plan/planner.ts',
  'packages/control/test/w04b-legacy-seed-adjudications.test.ts',
  'packages/registries/src/capabilities/legacy-seed-adjudications.ts',
  'packages/registries/src/capabilities/registry.ts',
] as const;

test('W04-B temporary formatter diagnostic', () => {
  execFileSync('./node_modules/.bin/prettier', ['--write', ...files], { stdio: 'inherit' });
  for (const file of files) {
    execFileSync('/bin/echo', [`@@AURORA_PRETTIER_BEGIN:${file}@@`], { stdio: 'inherit' });
    execFileSync('/bin/cat', [file], { stdio: 'inherit' });
    execFileSync('/bin/echo', [`@@AURORA_PRETTIER_END:${file}@@`], { stdio: 'inherit' });
  }
});
