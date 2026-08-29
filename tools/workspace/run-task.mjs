import { spawnSync } from 'node:child_process';
import { validateWorkspace } from './policy.mjs';

const task = process.argv[2];
const allowed = new Set(['lint', 'typecheck', 'test', 'build']);
if (!allowed.has(task)) {
  console.error(`[workspace] ERROR: unsupported root task: ${task ?? '<missing>'}`);
  process.exit(2);
}

const result = validateWorkspace();
for (const error of result.errors) console.error(`[workspace] ERROR: ${error}`);
if (result.errors.length) process.exit(1);

const runnable = result.active.filter((item) => item.packageJson.scripts?.[task]);
if (runnable.length === 0) {
  console.log(`[workspace] ${task}: PASS — no active runtime package declares this task yet.`);
  process.exit(0);
}

for (const item of runnable) {
  console.log(`[workspace] ${task}: ${item.packageJson.name ?? item.dir}`);
  const child = spawnSync('npm', ['run', task, '--workspace', item.dir], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (child.status !== 0) process.exit(child.status ?? 1);
}
