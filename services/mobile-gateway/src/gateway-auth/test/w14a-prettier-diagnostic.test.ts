// TEMPORARY DIAGNOSTIC — must be removed before acceptance.
// @ts-expect-error -- diagnostic uses Node 22 built-ins without repository-wide @types/node.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// @ts-expect-error -- diagnostic uses Node 22 built-ins without repository-wide @types/node.
import { tmpdir } from 'node:os';
// @ts-expect-error -- diagnostic uses Node 22 built-ins without repository-wide @types/node.
import { join } from 'node:path';
// @ts-expect-error -- diagnostic uses Node 22 built-ins without repository-wide @types/node.
import { spawnSync } from 'node:child_process';
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import test from 'node:test';

import * as prettier from 'prettier';

const paths = [
  'services/mobile-gateway/src/gateway-auth/gateway-bootstrap.ts',
  'services/mobile-gateway/src/gateway-auth/test/w14a-gateway-bootstrap.test.ts',
] as const;

const options = {
  arrowParens: 'always' as const,
  endOfLine: 'lf' as const,
  printWidth: 100,
  proseWrap: 'preserve' as const,
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all' as const,
  useTabs: false,
};

test('TEMP_W14A_EXACT_PRETTIER_DIAGNOSTIC', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'aurora-w14a-format-'));
  try {
    for (const [index, path] of paths.entries()) {
      const source = readFileSync(path, 'utf8');
      const formatted = await prettier.format(source, { ...options, filepath: path });
      const formattedPath = join(directory, `formatted-${index}.ts`);
      writeFileSync(formattedPath, formatted, 'utf8');
      const diff = spawnSync('git', ['diff', '--no-index', '--', path, formattedPath], {
        encoding: 'utf8',
      });
      console.error(`AURORA_PRETTIER_DIFF_BEGIN:${path}`);
      console.error(diff.stdout ?? '');
      console.error(`AURORA_PRETTIER_DIFF_END:${path}`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  throw new Error('TEMP_W14A_FORMAT_DIAGNOSTIC_COMPLETE');
});
