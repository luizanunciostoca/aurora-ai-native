import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const prepare = readFileSync(
  resolve(repoRoot, 'tools/tablet-devlab/prepare-dp5-dossier.sh'),
  'utf8',
);
const seal = readFileSync(resolve(repoRoot, 'tools/tablet-devlab/seal-dp5-dossier.sh'), 'utf8');

function expectAll(source, values) {
  for (const value of values) assert.equal(source.includes(value), true, value);
}

test('DP5 dossier preparation binds exact Android and tablet-loopback machine facts', () => {
  expectAll(prepare, [
    'w15j-tablet-loopback-dossier-lifecycle.mjs',
    'W15J_EVIDENCE_TEMPLATE.json',
    'preflight-metadata.txt',
    'apk-identity.txt',
    'refusing to overwrite existing operator dossier',
    'Android worktree does not match the captured Control Tower tuple',
    'Android worktree must remain clean before dossier preparation',
    'LOCAL_TABLET_LOOPBACK',
    'SELF_ADB_WIRELESS_DEBUGGING',
    '.environment.adbReversePort == null',
    '.environment.finalizedAtUtc == "REQUIRED"',
    'CLOSED_PHYSICAL_EVIDENCE_INCOMPLETE',
    'DP5_DOSSIER_PREPARED_FOR_OPERATOR_MATRIX_NOT_ACCEPTED',
    'authorizes_execution=false',
    'physical_acceptance=false',
    'retry_authorized=false',
    'w16_build_unblocked=false',
  ]);
});

test('DP5 dossier sealing preserves collector predecessor and creates a reviewer boundary', () => {
  expectAll(seal, [
    'collector-finalize-manifest.preseal.sha256',
    'dossier-seal-status.txt',
    'reviewer attestation must be created only after dossier sealing',
    'sha256sum -c',
    'operator dossier changed after collector finalization',
    'dossier sealing did not bind the collector-owned finalization timestamp',
    'sealed dossier timestamp differs from collector finalize metadata',
    'w15j-tablet-loopback-dossier-seal-v1',
    'collector_manifest_sha256=',
    'dossier_preseal_sha256=',
    'dossier_sealed_sha256=',
    'authorizes_execution=false',
    'proves_execution_success=false',
    'retry_authorized=false',
    'physical_acceptance=false',
    'w16_build_unblocked=false',
    'DP5_DOSSIER_SEALED_READY_FOR_REVIEWER_NOT_ACCEPTED',
  ]);
  assert.equal(
    seal.indexOf('node "$BINDER" finalize') < seal.indexOf('mv "$tmp_manifest" "$FINAL_MANIFEST"'),
    true,
  );
});
