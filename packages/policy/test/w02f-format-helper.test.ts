declare const require: (id: string) => unknown;
declare const process: { cwd(): string };
declare const Buffer: { from(value: string, encoding: 'utf8'): { toString(encoding: 'base64'): string } };

interface FsModule {
  readFileSync(path: string, encoding: 'utf8'): string;
}

interface PathModule {
  resolve(...paths: string[]): string;
}

interface PrettierModule {
  format(source: string, options: Readonly<Record<string, unknown>>): Promise<string>;
}

interface NodeTestModule {
  test(name: string, fn: () => Promise<void>): void;
}

const { readFileSync } = require('node:fs') as FsModule;
const { resolve } = require('node:path') as PathModule;
const { format } = require('prettier') as PrettierModule;
const { test } = require('node:test') as NodeTestModule;

const options = {
  parser: 'typescript',
  arrowParens: 'always',
  endOfLine: 'lf',
  printWidth: 100,
  proseWrap: 'preserve',
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
  useTabs: false,
};

test('temporary W02-F canonical formatter output', async () => {
  const packageRoot = process.cwd();
  const targets = [
    resolve(packageRoot, 'src/query/policy-query.test.ts'),
    resolve(packageRoot, 'src/query/precheck.ts'),
    resolve(packageRoot, '../schemas/src/policy-query/index.ts'),
  ];

  for (const target of targets) {
    const source = readFileSync(target, 'utf8');
    const formatted = await format(source, options);
    const encoded = Buffer.from(formatted, 'utf8').toString('base64');
    console.log(`W02F_FORMAT_B64:${target}:${encoded}`);
  }
});
