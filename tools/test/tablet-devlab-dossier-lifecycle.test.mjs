import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const preparePath = resolve(repoRoot, 'tools/tablet-devlab/prepare-dp5-dossier.sh');
const sealPath = resolve(repoRoot, 'tools/tablet-devlab/seal-dp5-dossier.sh');
const prepare = readFileSync(preparePath, 'utf8');
const seal = readFileSync(sealPath, 'utf8');

function expectAll(source, values) {
  for (const value of values) assert.equal(source.includes(value), true, value);
}

test('DP5 dossier lifecycle shell scripts parse with bash', () => {
  for (const path of [preparePath, sealPath]) {
    const parsed = spawnSync('bash', ['-n', path], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(parsed.status, 0, `${path}: ${parsed.stderr}`);
  }
});

test('DP5 dossier preparation binds exact Android and tablet-loopback machine facts', () => {
  expectAll(prepare, [
    'w15j-tablet-loopback-dossier-lifecycle.mjs',
    'W15J_EVIDENCE_TEMPLATE.json',
    'W15J_GOVERNED_EXECUTION_BINDING_TEMPLATE.json',
    'governed-execution-binding.json',
    'w15j-governed-execution-binding-v1',
    'EVIDENCE_BINDING_ONLY',
    'preflight-metadata.txt',
    'apk-identity.txt',
    'refusing to overwrite existing operator dossier',
    'refusing to overwrite existing governed execution binding',
    'Android worktree does not match the captured Control Tower tuple',
    'Android worktree must remain clean before dossier preparation',
    'LOCAL_TABLET_LOOPBACK',
    'SELF_ADB_WIRELESS_DEBUGGING',
    '.environment.adbReversePort == null',
    '.environment.finalizedAtUtc == "REQUIRED"',
    'CLOSED_PHYSICAL_EVIDENCE_INCOMPLETE',
    'seven-role governed execution binding',
    'DP5_DOSSIER_PREPARED_FOR_OPERATOR_MATRIX_NOT_ACCEPTED',
    'authorizes_execution=false',
    'physical_acceptance=false',
    'retry_authorized=false',
    'w16_build_unblocked=false',
  ]);
});

test('DP5 dossier sealing preserves collector predecessor, semantic binding and reviewer boundary', () => {
  expectAll(seal, [
    'governed-execution-binding.json',
    'governed_execution_binding_sha256=',
    'governed execution binding changed after collector finalization',
    'collector manifest did not bind governed-execution-binding.json',
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
