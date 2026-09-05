// @ts-expect-error -- temporary CI diagnostic uses Node 22 built-ins without @types/node.
import { execFileSync } from 'node:child_process';
// @ts-expect-error -- temporary CI diagnostic uses Node 22 built-ins without @types/node.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- temporary CI diagnostic uses Node 22 built-ins without @types/node.
import test from 'node:test';

const SOURCES = [
  'services/mobile-gateway/src/gateway-auth/device-key-proof-verifier.ts',
  'services/mobile-gateway/src/gateway-auth/device-plane-network.ts',
  'services/mobile-gateway/src/gateway-auth/test/w14-device-plane-network.test.ts',
];

test('TEMP W14 canonical prettier diagnostic', () => {
  execFileSync('npx', ['prettier', '--write', ...SOURCES], { stdio: 'inherit' });
  for (const source of SOURCES) {
    const encoded = readFileSync(source).toString('base64');
    console.log(`W14_FORMATTED_BLOB_BEGIN:${source}`);
    console.log(encoded);
    console.log(`W14_FORMATTED_BLOB_END:${source}`);
  }
});
