// @ts-expect-error -- temporary CI diagnostic uses Node 22 built-ins without @types/node.
import { readFile } from 'node:fs/promises';
// @ts-expect-error -- temporary CI diagnostic uses Node 22 built-ins without @types/node.
import test from 'node:test';

import prettier from 'prettier';

const SOURCE = 'services/mobile-gateway/src/gateway-auth/device-plane-network.ts';

test('TEMP W14 device-plane prettier diagnostic', async () => {
  const source = await readFile(SOURCE, 'utf8');
  const formatted = await prettier.format(source, { filepath: SOURCE });
  console.log('W14_PRETTIER_DIAGNOSTIC_BEGIN');
  console.log(formatted);
  console.log('W14_PRETTIER_DIAGNOSTIC_END');
});
