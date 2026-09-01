import fs from 'node:fs/promises';
import test from 'node:test';
import prettier from 'prettier';

const files = [
  'src/confidence/types.ts',
  'src/confidence/engine.ts',
  'test/w05d-confidence.test.mjs',
];

test('W05-D formatter oracle', async () => {
  const config = await prettier.resolveConfig(process.cwd());
  for (const file of files) {
    const source = await fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const formatted = await prettier.format(source, { ...config, filepath: file });
    console.log(`W05D_FORMAT_BEGIN:${file}\n${formatted}W05D_FORMAT_END:${file}`);
  }
});
