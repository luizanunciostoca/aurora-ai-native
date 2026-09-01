import fs from 'node:fs/promises';
import test from 'node:test';
import prettier from 'prettier';

const files = [
  'src/reasoning-level/types.ts',
  'src/reasoning-level/resolver.ts',
  'test/w05c-reasoning-level.test.mjs',
];

test('W05-C formatter oracle', async () => {
  const config = await prettier.resolveConfig(process.cwd());
  for (const file of files) {
    const source = await fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const formatted = await prettier.format(source, { ...config, filepath: file });
    console.log(`W05C_FORMAT_BEGIN:${file}\n${formatted}W05C_FORMAT_END:${file}`);
  }
});
