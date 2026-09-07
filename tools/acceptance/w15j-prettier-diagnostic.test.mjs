import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import prettier from 'prettier';

test('emit canonical W15-J semantic binding formatting', async () => {
  const path = 'tools/acceptance/w15j-governed-execution-binding.mjs';
  const source = readFileSync(path, 'utf8');
  const formatted = await prettier.format(source, { filepath: path });
  console.log(`W15J_PRETTIER_BASE64=${Buffer.from(formatted).toString('base64')}`);
});
