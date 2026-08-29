const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();

if (process.env.GITHUB_ACTIONS === 'true' && process.env.W01E_PRETTIER_PROBE !== '1') {
  const prettier = path.join(root, 'node_modules', 'prettier', 'bin', 'prettier.cjs');
  const config = path.join(root, '.prettierrc.json');
  const targets = [
    'packages/contracts/src/results/error-semantics.ts',
    'packages/contracts/src/results/execution-semantics.ts',
    'packages/schemas/src/results/runtime-schema.ts',
    'packages/schemas/src/results/runtime-schema.contract-test.ts',
  ];

  for (const target of targets) {
    const source = path.join(root, target);
    const temporary = path.join(os.tmpdir(), `w01e-${path.basename(target)}`);
    const formatted = spawnSync(
      process.execPath,
      [prettier, '--config', config, '--stdin-filepath', source],
      {
        input: fs.readFileSync(source, 'utf8'),
        env: { ...process.env, W01E_PRETTIER_PROBE: '1' },
        encoding: 'utf8',
      },
    );

    if (formatted.status !== 0) {
      console.log(`W01E_PRETTIER_PROBE_ERROR ${target}\n${formatted.stderr}`);
      continue;
    }

    fs.writeFileSync(temporary, formatted.stdout);
    const diff = spawnSync('diff', ['-u', source, temporary], { encoding: 'utf8' });
    console.log(`W01E_PRETTIER_DIFF ${target}\n${diff.stdout}`);
  }
}

module.exports = require('../../../../.prettierrc.json');
