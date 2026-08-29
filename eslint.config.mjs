import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

const ignoredPaths = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.cache/**',
  '**/.turbo/**',
  '**/.next/**',
  '**/.expo/**',
  'reference/**',
  '**/legacy-reference/**',
  '**/legacy-manus-reference/**',
  'docs/migration/**',
];

export default tseslint.config(
  { name: 'aurora/ignores', ignores: ignoredPaths },
  {
    name: 'aurora/linter-options',
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    name: 'aurora/typescript-conventions',
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', prefer: 'type-imports' },
      ],
    },
  },
  {
    name: 'aurora/node-tooling',
    files: ['tools/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
);
