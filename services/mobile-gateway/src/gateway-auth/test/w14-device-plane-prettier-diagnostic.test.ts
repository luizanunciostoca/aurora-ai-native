// @ts-expect-error -- temporary CI diagnostic uses Node 22 built-ins without @types/node.
import { execFileSync } from 'node:child_process';
// @ts-expect-error -- temporary CI diagnostic uses Node 22 built-ins without @types/node.
import test from 'node:test';

const SOURCES = [
  'services/mobile-gateway/src/gateway-auth/device-key-proof-verifier.ts',
  'services/mobile-gateway/src/gateway-auth/device-plane-network.ts',
  'services/mobile-gateway/src/gateway-auth/test/w14-device-plane-network.test.ts',
];

test('TEMP W14 canonical prettier diagnostic', () => {
  execFileSync('npx', ['prettier', '--write', ...SOURCES], { stdio: 'inherit' });
  const patch = execFileSync('git', ['diff', '--', ...SOURCES], { encoding: 'utf8' });
  console.log('W14_PRETTIER_PATCH_BEGIN');
  console.log(patch);
  console.log('W14_PRETTIER_PATCH_END');
});
