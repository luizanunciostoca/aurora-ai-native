import { execFileSync } from 'node:child_process';
import path from 'node:path';

const packageRoot = process.cwd();
const repoRoot = path.resolve(packageRoot, '../..');
const prettier = path.resolve(repoRoot, 'node_modules/.bin/prettier');
const files = ['packages/registries/src/strategies/registry.ts'];

execFileSync(prettier, ['--write', ...files], { cwd: repoRoot, stdio: 'inherit' });
const diff = execFileSync('git', ['diff', '--', ...files], {
  cwd: repoRoot,
  encoding: 'utf8',
});
console.log(`W05E_PRETTIER_DIFF_BEGIN\n${diff}W05E_PRETTIER_DIFF_END`);
throw new Error('W05E_PRETTIER_DIAGNOSTIC_COMPLETE');
