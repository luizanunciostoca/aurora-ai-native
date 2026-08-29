import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, validateWorkspace } from './policy.mjs';

const result = validateWorkspace();
for (const error of result.errors) console.error(`[workspace] ERROR: ${error}`);
if (result.errors.length) process.exit(1);

const linkedToolingPackage = path.join(repoRoot, 'node_modules', '@aurora', 'workspace-tools', 'package.json');
if (!fs.existsSync(linkedToolingPackage)) {
  console.error('[workspace] ERROR: npm workspace link for @aurora/workspace-tools was not installed. Run npm ci with the canonical npm version.');
  process.exit(1);
}

console.log('[workspace] install: PASS — canonical npm workspace install verified.');
