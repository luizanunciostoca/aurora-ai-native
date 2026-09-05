// @ts-expect-error -- temporary CI diagnostic uses Node 22 built-ins without @types/node.
import { readFile } from 'node:fs/promises';
// @ts-expect-error -- temporary CI diagnostic uses Node 22 built-ins without @types/node.
import test from 'node:test';

import prettier from 'prettier';

const SOURCE = 'services/mobile-gateway/src/gateway-auth/device-plane-network.ts';

test('TEMP W14 device-plane prettier diagnostic', async () => {
  const source = await readFile(SOURCE, 'utf8');
  const formatted = await prettier.format(source, { filepath: SOURCE });
  const sourceLines = source.split('\n');
  const formattedLines = formatted.split('\n');

  let prefix = 0;
  while (
    prefix < sourceLines.length &&
    prefix < formattedLines.length &&
    sourceLines[prefix] === formattedLines[prefix]
  ) {
    prefix += 1;
  }

  let sourceSuffix = sourceLines.length - 1;
  let formattedSuffix = formattedLines.length - 1;
  while (
    sourceSuffix >= prefix &&
    formattedSuffix >= prefix &&
    sourceLines[sourceSuffix] === formattedLines[formattedSuffix]
  ) {
    sourceSuffix -= 1;
    formattedSuffix -= 1;
  }

  console.log('W14_PRETTIER_DIFF_BEGIN');
  console.log(`source-lines=${prefix + 1}-${sourceSuffix + 1}`);
  console.log(sourceLines.slice(prefix, sourceSuffix + 1).join('\n'));
  console.log('W14_PRETTIER_FORMATTED');
  console.log(formattedLines.slice(prefix, formattedSuffix + 1).join('\n'));
  console.log('W14_PRETTIER_DIFF_END');
});
