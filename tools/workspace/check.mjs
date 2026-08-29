import { validateWorkspace } from './policy.mjs';

const list = process.argv.includes('--list');
const result = validateWorkspace();

for (const warning of result.warnings) console.warn(`[workspace] WARN: ${warning}`);
for (const error of result.errors) console.error(`[workspace] ERROR: ${error}`);

if (list) {
  console.log('[workspace] active packages:');
  for (const item of result.active)
    console.log(`  - ${item.dir} (${item.packageJson.name ?? 'unnamed'})`);
  console.log('[workspace] protected reference manifests excluded from runtime graph:');
  for (const manifest of result.excludedReferences) console.log(`  - ${manifest}`);
}

if (result.errors.length) process.exit(1);
console.log(
  `[workspace] PASS: ${result.active.length} active package(s); ${result.excludedReferences.length} protected reference manifest(s) excluded.`,
);
