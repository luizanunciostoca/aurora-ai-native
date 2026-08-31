declare const __dirname: string;
declare function require(id: string): unknown;

type SpawnSync = (
  command: string,
  args: readonly string[],
  options: { cwd: string; encoding: 'utf8' },
) => { status: number | null; stdout: string; stderr: string };

type ReadFileSync = (path: string, encoding: 'utf8') => string;
type Resolve = (...parts: string[]) => string;

const childProcess = require('node:child_process') as { spawnSync: SpawnSync };
const fs = require('node:fs') as { readFileSync: ReadFileSync };
const path = require('node:path') as { resolve: Resolve };

const packageDir = path.resolve(__dirname, '../../..');
const rootDir = path.resolve(packageDir, '../..');
const prettier = path.resolve(rootDir, 'node_modules/.bin/prettier');
const files = [
  'src/tenant-boundary/check.ts',
  'src/tenant-boundary/tenant-boundary.schema.ts',
  'src/tenant-boundary/tenant-boundary.schema.test.ts',
];

const result = childProcess.spawnSync(prettier, ['--write', ...files], {
  cwd: packageDir,
  encoding: 'utf8',
});

if (result.status !== 0) {
  throw new Error(`prettier diagnostic failed: ${result.stderr}`);
}

for (const file of files) {
  const content = fs.readFileSync(path.resolve(packageDir, file), 'utf8');
  console.log(`W02B_FORMATTED_BEGIN:${file}`);
  console.log(content);
  console.log(`W02B_FORMATTED_END:${file}`);
}
