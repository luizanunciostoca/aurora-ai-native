import '../src/authority/authority-validation.test';

declare const require: (id: string) => unknown;

type ExecFileSync = (
  file: string,
  args: readonly string[],
  options: { readonly encoding: 'utf8' },
) => string;

const { execFileSync } = require('node:child_process') as {
  readonly execFileSync: ExecFileSync;
};

const targets = [
  '../contracts/src/policy-validation/index.ts',
  'src/authority/authority-evaluation.ts',
  'src/authority/authority-validation.test.ts',
  'src/authority/internal.ts',
  'src/authority/subject-bridge.ts',
  'src/authority/token-validation.ts',
  '../schemas/src/policy-validation/index.ts',
] as const;

execFileSync('../../node_modules/.bin/prettier', ['--write', ...targets], { encoding: 'utf8' });
const patch = execFileSync('git', ['diff', '--no-ext-diff', '--unified=3', '--', ...targets], {
  encoding: 'utf8',
});
console.log('W02E_PRETTIER_PATCH_BEGIN');
console.log(patch);
console.log('W02E_PRETTIER_PATCH_END');
