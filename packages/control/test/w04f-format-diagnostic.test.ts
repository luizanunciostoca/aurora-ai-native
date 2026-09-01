// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import { execFileSync } from 'node:child_process';
// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import test from 'node:test';

test('W04-F formatter diagnostic emits canonical budget types', () => {
  const formatted = execFileSync(
    './node_modules/.bin/prettier',
    ['packages/control/src/budget/types.ts'],
    { encoding: 'utf8' },
  );
  console.log('W04F_PRETTIER_BEGIN');
  console.log(formatted);
  console.log('W04F_PRETTIER_END');
});
