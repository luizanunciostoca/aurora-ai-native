import { execFileSync } from 'node:child_process';
import path from 'node:path';

const packageRoot = process.cwd();
const repoRoot = path.resolve(packageRoot, '../..');
const prettier = path.resolve(repoRoot, 'node_modules/.bin/prettier');
const files = [
  'packages/contracts/src/execution-target/execution-target-reference.ts',
  'packages/schemas/src/evidence/evidence.schema.ts',
  'packages/schemas/src/execution-target/w07a-compatibility.contract-test.ts',
  'packages/schemas/src/receipts/receipt.schema.ts',
];

execFileSync(prettier, ['--write', ...files], { cwd: repoRoot, stdio: 'inherit' });
const diff = execFileSync('git', ['diff', '--', ...files], {
  cwd: repoRoot,
  encoding: 'utf8',
});
console.log(`W07A_PRETTIER_DIFF_BEGIN\n${diff}W07A_PRETTIER_DIFF_END`);
