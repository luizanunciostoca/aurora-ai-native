import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

const TARGETS = [
  'services/mobile-gateway/src/device-command-delivery/manager.ts',
  'services/mobile-gateway/src/device-command-delivery/test/w14f-device-command-delivery.test.ts',
  'services/mobile-gateway/src/device-command-delivery/types.ts',
] as const;

test('TEMP W14-F Prettier diagnostic — remove before acceptance', () => {
  const repoRoot = resolve(import.meta.dirname, '../../..');
  const prettier = resolve(repoRoot, 'node_modules/.bin/prettier');

  for (const target of TARGETS) {
    const formatted = execFileSync(prettier, [target], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    console.log(`W14F_PRETTIER_BASE64 ${target} ${Buffer.from(formatted).toString('base64')}`);
  }
});
