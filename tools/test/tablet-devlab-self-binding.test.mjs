import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(resolve(repoRoot, 'tools/tablet-devlab/dossier-doctor.sh'), 'utf8');

function expectSource(value) {
  assert.equal(source.includes(value), true);
}

test('dossier doctor binds live local worktrees', () => {
  const required = [
    'for cmd in git node jq mktemp sha256sum gh unzip',
    'gh auth status',
    'DEVLAB_PR="${AURORA_DEVLAB_PR:-499}"',
    'HOST_WORKTREE="$DEVLAB_ROOT/worktrees/host"',
    'git -C "$DEVLAB_WORKTREE" rev-parse HEAD',
    'git -C "$DEVLAB_WORKTREE" status --porcelain',
    `android_sha="$(jq -er '.androidCandidateSha' "$TUPLE")"`,
    `host_sha="$(jq -er '.hostCandidateSha' "$TUPLE")"`,
    'git -C "$ANDROID_WORKTREE" rev-parse HEAD',
    'Android worktree drift from captured live tuple',
    'git -C "$ANDROID_WORKTREE" status --porcelain',
    'git -C "$HOST_WORKTREE" rev-parse HEAD',
    'host worktree drift from captured live tuple',
    'git -C "$HOST_WORKTREE" status --porcelain',
    '/repos/$REPO/pulls/$DEVLAB_PR',
    'pr_head" == "$devlab_head',
    'pr_base" == "$main_sha',
    '/repos/$REPO/compare/$main_sha...$devlab_head',
    'merge_base" == "$main_sha',
    'behind" == "0',
    'devlab_candidate_sha=$devlab_head',
    'android_candidate_sha=$android_sha',
    'host_candidate_sha=$host_sha',
    'physical_acceptance=false',
    'w16_build_unblocked=false',
  ];

  for (const value of required) {
    expectSource(value);
  }
  assert.equal(source.includes('a45c349c840b6c5125867fee3c7294ad61998cc3'), false);
});

test('dossier doctor requires sealed semantic binding and complete tablet dossier lint', () => {
  const required = [
    'AURORA_W15J_DOSSIER',
    'AURORA_W15J_GOVERNED_EXECUTION_BINDING',
    'w15j-evidence.json',
    'governed-execution-binding.json',
    'collector-finalize-manifest.preseal.sha256',
    'dossier-seal-status.txt',
    'w15j-tablet-loopback-dossier-seal-v1',
    'governed_execution_binding_sha256',
    'pre-seal collector manifest digest drift',
    'sealed governed execution binding digest drift',
    'pre-seal collector manifest does not bind the recorded governed execution binding',
    'sealed dossier digest drift',
    'pre-seal collector manifest does not bind the recorded dossier predecessor',
    'sealed dossier finalization timestamp drift',
    'sealed final evidence manifest digest verification failed',
    'w15j-tablet-loopback-trusted-preflight.mjs',
    'w15j-governed-execution-binding.mjs',
    'w15j-tablet-loopback-preflight.mjs',
    'trusted preflight did not bind the sealed final manifest',
    'node "$SEMANTIC_VALIDATOR" "$DOSSIER" "$RESULT" "$EVIDENCE_DIR"',
    'W15J_GOVERNED_EXECUTION_BINDING_READY_NOT_ACCEPTED',
    'roles=7',
    'required_semantic_evidence_roles=7',
    'semantic_binding_lint=PASS_NOT_ACCEPTED',
    'semantic_binding_lint_sha256=$semantic_lint_sha',
    'governed_execution_binding_sha256=$binding_sha',
    'node "$DOSSIER_VALIDATOR" "$DOSSIER" "$EVIDENCE_DIR" "$TUPLE"',
    'W15J_TABLET_LOOPBACK_LINT_READY_NOT_ACCEPTED',
    'scenarios=48',
    'required_physical_scenarios=48',
    'complete_dossier_lint=PASS_NOT_ACCEPTED',
    'collector_preseal_manifest_sha256=$preseal_manifest_file_sha',
    'dossier_seal_status_sha256=$seal_status_sha',
    'operator_dossier_sha256=$dossier_sha',
    'complete_dossier_lint_sha256=$dossier_lint_sha',
    'sealed_dossier_provenance=VERIFIED',
  ];

  for (const value of required) {
    expectSource(value);
  }
  assert.equal(source.includes('PASS_ACCEPTED'), false);
});
