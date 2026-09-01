import fs from 'node:fs/promises';
import test from 'node:test';
import prettier from 'prettier';

const files = ['src/router/router.ts', 'test/w05b-intelligence-router.test.mjs'];

test('W05-B formatter oracle', async () => {
  const config = await prettier.resolveConfig(process.cwd());
  for (const file of files) {
    const source = await fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const formatted = await prettier.format(source, { ...config, filepath: file });
    console.log(`W05B_FORMAT_BEGIN:${file}\n${formatted}W05B_FORMAT_END:${file}`);
  }
});
