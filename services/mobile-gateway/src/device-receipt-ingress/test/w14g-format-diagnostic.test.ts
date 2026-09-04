import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('TEMP W14-G prettier diagnostic', () => {
  const files = [
    'services/mobile-gateway/src/device-receipt-ingress/manager.ts',
    'services/mobile-gateway/src/device-receipt-ingress/types.ts',
    'services/mobile-gateway/src/device-receipt-ingress/test/w14g-device-receipt-ingress.test.ts',
  ];
  const format = spawnSync('./node_modules/.bin/prettier', ['--write', ...files], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(format.status, 0, format.stderr);
  const diff = spawnSync('git', ['diff', '--', ...files], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  console.log('W14_G_PRETTIER_DIFF_START');
  console.log(diff.stdout);
  console.log('W14_G_PRETTIER_DIFF_END');
  assert.fail('TEMP_W14_G_PRETTIER_DIAGNOSTIC');
});
