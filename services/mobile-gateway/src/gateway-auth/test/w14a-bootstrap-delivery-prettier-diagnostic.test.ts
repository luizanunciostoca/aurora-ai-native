// TEMPORARY DIAGNOSTIC — remove before acceptance.
// @ts-expect-error -- diagnostic uses Node 22 built-ins without repository-wide @types/node.
import { execFileSync } from 'node:child_process';
// @ts-expect-error -- diagnostic uses Node 22 built-ins without repository-wide @types/node.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
// @ts-expect-error -- diagnostic uses Node 22 built-ins without repository-wide @types/node.
import { tmpdir } from 'node:os';
// @ts-expect-error -- diagnostic uses Node 22 built-ins without repository-wide @types/node.
import { join } from 'node:path';
// @ts-expect-error -- diagnostic uses Node 22 built-ins without repository-wide @types/node.
import test from 'node:test';

import * as prettier from 'prettier';

const paths = [
  'services/mobile-gateway/src/gateway-auth/gateway-bootstrap-delivery.ts',
  'services/mobile-gateway/src/gateway-auth/test/w14a-gateway-bootstrap-delivery.test.ts',
  'services/mobile-gateway/src/gateway-auth/test/w14a-gateway-bootstrap-network.test.ts',
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

test('TEMP_W14A_BOOTSTRAP_DELIVERY_EXACT_PRETTIER_DIAGNOSTIC', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'aurora-w14a-bootstrap-format-'));
  for (const [index, path] of paths.entries()) {
    const source = readFileSync(path, 'utf8');
    const formatted = await prettier.format(source, { ...options, filepath: path });
    const destination = join(directory, `formatted-${index}.ts`);
    writeFileSync(destination, formatted, 'utf8');
    console.error(`AURORA_PRETTIER_DIFF_BEGIN:${path}`);
    try {
      execFileSync('diff', ['-u', path, destination], { encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
      const output = (error as { stdout?: string }).stdout ?? '';
      console.error(output);
    }
    console.error(`AURORA_PRETTIER_DIFF_END:${path}`);
  }
  throw new Error('TEMP_W14A_BOOTSTRAP_DELIVERY_FORMAT_DIAGNOSTIC_COMPLETE');
});
