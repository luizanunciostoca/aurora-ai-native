// TEMPORARY DIAGNOSTIC — remove before acceptance.
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import test from 'node:test';

import { format } from 'prettier';

test('temporary locked-prettier diagnostic', async () => {
  const source = readFileSync(
    'services/mobile-gateway/src/gateway-auth/test/w15g-w07-voice-candidate-network.test.ts',
    'utf8',
  );
  const formatted = await format(source, {
    parser: 'typescript',
    arrowParens: 'always',
    endOfLine: 'lf',
    printWidth: 100,
    proseWrap: 'preserve',
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'all',
    useTabs: false,
  });
  console.log('AURORA_PRETTIER_BEGIN');
  console.log(formatted);
  console.log('AURORA_PRETTIER_END');
  assert.equal(formatted.length > 0, true);
});
