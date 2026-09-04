// TEMPORARY DIAGNOSTIC — remove before acceptance.
// @ts-expect-error -- diagnostic intentionally relies on Node 22 built-ins without @types/node.
import { execFileSync } from 'node:child_process';
// @ts-expect-error -- diagnostic intentionally relies on Node 22 built-ins without @types/node.
import { readFileSync, writeFileSync } from 'node:fs';
// @ts-expect-error -- diagnostic intentionally relies on Node 22 built-ins without @types/node.
import { resolve } from 'node:path';
// @ts-expect-error -- diagnostic intentionally relies on Node 22 built-ins without @types/node.
import test from 'node:test';

import { format, resolveConfig } from 'prettier';

declare const process: { cwd(): string };

test('emit exact canonical Prettier diff for W14 remediation', async () => {
  const root = process.cwd();
  const paths = [
    'services/mobile-gateway/src/gateway-auth/http-network-transport.ts',
    'services/mobile-gateway/src/gateway-auth/test/w14a-http-network-transport.test.ts',
  ];

  for (const path of paths) {
    const absolute = resolve(root, path);
    const source = readFileSync(absolute, 'utf8');
    const config = (await resolveConfig(absolute)) ?? {};
    const formatted = await format(source, { ...config, filepath: absolute });
    writeFileSync(absolute, formatted, 'utf8');
  }

  const diff = execFileSync('git', ['diff', '--', ...paths], {
    cwd: root,
    encoding: 'utf8',
  });
  console.log(`FORMAT_DIFF_START\n${diff}\nFORMAT_DIFF_END`);
  throw new Error('TEMPORARY_FORMAT_DIAGNOSTIC');
});
