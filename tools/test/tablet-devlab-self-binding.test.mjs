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
    "android_sha=\"$(jq -er '.androidCandidateSha' \"$TUPLE\")\"",
    "host_sha=\"$(jq -er '.hostCandidateSha' \"$TUPLE\")\"",
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
  assert.equal(source.includes('== "a45c349c840b6c5125867fee3c7294ad61998cc3"'), false);
});

test('dossier doctor requires complete tablet dossier lint', () => {
  const required = [
    'AURORA_W15J_DOSSIER',
    'w15j-evidence.json',
    'finalized w15j-evidence.json operator dossier is required',
    'w15j-tablet-loopback-trusted-preflight.mjs',
    'w15j-tablet-loopback-preflight.mjs',
    'node "$DOSSIER_VALIDATOR" "$DOSSIER" "$EVIDENCE_DIR" "$TUPLE"',
    'W15J_TABLET_LOOPBACK_LINT_READY_NOT_ACCEPTED',
    'scenarios=48',
    'required_physical_scenarios=48',
    'complete_dossier_lint=PASS_NOT_ACCEPTED',
    'operator_dossier_sha256=$dossier_sha',
    'complete_dossier_lint_sha256=$dossier_lint_sha',
  ];

  for (const value of required) {
    expectSource(value);
  }
  assert.equal(source.includes('complete_dossier_lint=PASS_ACCEPTED'), false);
});
