import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const managerUrl = new URL(
  '../../../services/mobile-gateway/src/device-command-delivery/manager.ts',
  import.meta.url,
);

test('W14-F diagnostic emits canonical Prettier payload', async () => {
  const input = readFileSync(fileURLToPath(managerUrl), 'utf8');
  const output = await format(input, { parser: 'typescript' });
  console.log(`W14F_PRETTIER_GZIP_BASE64=${gzipSync(output).toString('base64')}`);
});
