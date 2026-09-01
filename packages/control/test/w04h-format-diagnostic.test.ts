// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import test from 'node:test';
import { format, resolveConfig } from 'prettier';

test('W04-H formatting diagnostic', async () => {
  const target = new URL('./w04h-integration-performance.test.ts', import.meta.url);
  const source = readFileSync(target, 'utf8');
  const config = (await resolveConfig(target.pathname)) ?? {};
  const formatted = await format(source, {
    ...config,
    filepath: target.pathname,
  });
  if (formatted === source) return;
  // @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides process at runtime.
  process.stdout.write(`\n[W04H_PRETTIER_FORMATTED_BEGIN]\n${formatted}[W04H_PRETTIER_FORMATTED_END]\n`);
});
