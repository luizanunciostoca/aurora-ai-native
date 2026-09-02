import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { format } from 'prettier';

const prettierOptions = {
  parser: 'babel',
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  semi: true,
};

test('W05-H diagnostic emits canonical Prettier diff', async () => {
  const path = 'packages/intelligence/test/w05h-routing-evals.test.mjs';
  const source = await readFile(path, 'utf8');
  const formatted = await format(source, prettierOptions);
  const directory = await mkdtemp(join(tmpdir(), 'w05h-prettier-'));
  try {
    const sourcePath = join(directory, 'source.mjs');
    const formattedPath = join(directory, 'prettier.mjs');
    await writeFile(sourcePath, source, 'utf8');
    await writeFile(formattedPath, formatted, 'utf8');
    const diff = spawnSync(
      'diff',
      ['-u', '--label', 'W05H:source', sourcePath, '--label', 'W05H:prettier', formattedPath],
      { encoding: 'utf8' },
    );
    if (diff.status !== 0 && diff.status !== 1) throw new Error(diff.stderr);
    console.log('W05H_PRETTIER_DIFF_START');
    console.log(diff.stdout || '(already formatted)');
    console.log('W05H_PRETTIER_DIFF_END');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
