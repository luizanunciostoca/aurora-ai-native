// TEMPORARY DIAGNOSTIC — must be removed before acceptance.
// @ts-expect-error -- diagnostic uses Node 22 built-ins without repository-wide @types/node.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- diagnostic uses Node 22 built-ins without repository-wide @types/node.
import { Buffer } from 'node:buffer';
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
  for (const path of paths) {
    const source = readFileSync(path, 'utf8');
    const formatted = await prettier.format(source, { ...options, filepath: path });
    // Base64 keeps CI log delimiters unambiguous. This is source code only, never credential data.
    console.error(`AURORA_FORMAT_BEGIN:${path}`);
    console.error(Buffer.from(formatted, 'utf8').toString('base64'));
    console.error(`AURORA_FORMAT_END:${path}`);
  }
  throw new Error('TEMP_W14A_FORMAT_DIAGNOSTIC_COMPLETE');
});
