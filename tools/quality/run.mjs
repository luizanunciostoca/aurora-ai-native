import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const qualityDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(qualityDir, '../..');
const canonicalRoots = ['apps', 'services', 'packages', 'catalog', 'infra', 'evals'];
const ignoredDirectoryNames = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.turbo',
  '.next',
  '.expo',
  'reference',
  'legacy-reference',
  'legacy-manus-reference',
]);

function localBinary(name) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return path.join(rootDir, 'node_modules', '.bin', `${name}${suffix}`);
}

function runBinary(name, args) {
  const binary = localBinary(name);
  if (!existsSync(binary)) {
    console.error(
      `QUALITY_TOOL_MISSING: ${name} was not found at ${path.relative(rootDir, binary)}. Run npm ci first.`,
    );
    return 127;
  }
  const result = spawnSync(binary, args, { cwd: rootDir, stdio: 'inherit' });
  if (result.error) {
    console.error(`QUALITY_TOOL_EXECUTION_FAILED: ${name}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function collectTypeScriptProjects(directory, projects) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectoryNames.has(entry.name)) collectTypeScriptProjects(absolutePath, projects);
      continue;
    }
    if (entry.isFile() && entry.name === 'tsconfig.json') projects.push(absolutePath);
  }
}

function typecheck() {
  const projects = [];
  const rootProject = path.join(rootDir, 'tsconfig.json');
  if (existsSync(rootProject)) projects.push(rootProject);
  for (const rootName of canonicalRoots)
    collectTypeScriptProjects(path.join(rootDir, rootName), projects);
  const uniqueProjects = [...new Set(projects)].sort();
  if (uniqueProjects.length === 0) {
    console.log(
      'TYPECHECK_NO_PROJECTS_YET: no canonical tsconfig.json exists in runtime roots; tsconfig.base.json is ready.',
    );
    return 0;
  }
  for (const project of uniqueProjects) {
    console.log(`TYPECHECK_PROJECT: ${path.relative(rootDir, project)}`);
    const status = runBinary('tsc', ['--project', project, '--noEmit', '--pretty', 'false']);
    if (status !== 0) return status;
  }
  return 0;
}

const formatCheck = () => runBinary('prettier', ['--check', '.']);
const formatWrite = () => runBinary('prettier', ['--write', '.']);
const lint = () => runBinary('eslint', ['.', '--max-warnings=0']);
function runAll() {
  for (const gate of [formatCheck, lint, typecheck]) {
    const status = gate();
    if (status !== 0) return status;
  }
  return 0;
}

const commands = new Map([
  ['format:check', formatCheck],
  ['format:write', formatWrite],
  ['lint', lint],
  ['typecheck', typecheck],
  ['all', runAll],
]);
const command = process.argv[2];
if (!commands.has(command)) {
  console.error(`Usage: node tools/quality/run.mjs <${[...commands.keys()].join('|')}>`);
  process.exit(2);
}
process.exit(commands.get(command)());
