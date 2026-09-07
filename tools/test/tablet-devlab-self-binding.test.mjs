import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(resolve(repoRoot, 'tools/tablet-devlab/dossier-doctor.sh'), 'utf8');

test('dossier doctor binds itself and local execution worktrees to the captured live tuple', () => {
  assert.match(source, /for cmd in git node jq mktemp sha256sum gh unzip/);
  assert.match(source, /gh auth status/);
  assert.match(source, /DEVLAB_PR="\$\{AURORA_DEVLAB_PR:-499\}"/);
  assert.match(source, /HOST_WORKTREE="\$DEVLAB_ROOT\/worktrees\/host"/);
  assert.match(source, /git -C "\$DEVLAB_WORKTREE" rev-parse HEAD/);
  assert.match(source, /git -C "\$DEVLAB_WORKTREE" status --porcelain/);
  assert.match(source, /android_sha="\$\(jq -er '\.androidCandidateSha'/);
  assert.match(source, /host_sha="\$\(jq -er '\.hostCandidateSha'/);
  assert.match(source, /git -C "\$ANDROID_WORKTREE" rev-parse HEAD.*\$android_sha/);
  assert.match(source, /git -C "\$ANDROID_WORKTREE" status --porcelain/);
  assert.match(source, /git -C "\$HOST_WORKTREE" rev-parse HEAD.*\$host_sha/);
  assert.match(source, /git -C "\$HOST_WORKTREE" status --porcelain/);
  assert.doesNotMatch(
    source,
    /rev-parse HEAD\)" == "a45c349c840b6c5125867fee3c7294ad61998cc3"/,
  );
  assert.match(source, /\/repos\/\$REPO\/pulls\/\$DEVLAB_PR/);
  assert.match(source, /pr_head.*devlab_head/);
  assert.match(source, /pr_base.*main_sha/);
  assert.match(source, /\/repos\/\$REPO\/compare\/\$main_sha\.\.\.\$devlab_head/);
  assert.match(source, /merge_base.*main_sha/);
  assert.match(source, /behind.*0/);
  assert.match(source, /devlab_candidate_sha=\$devlab_head/);
  assert.match(source, /android_candidate_sha=\$android_sha/);
  assert.match(source, /host_candidate_sha=\$host_sha/);
  assert.match(source, /physical_acceptance=false/);
  assert.match(source, /w16_build_unblocked=false/);
});

test(
  'dossier doctor requires and validates the complete tablet-loopback operator dossier',
  () => {
    assert.match(
      source,
      /AURORA_W15J_DOSSIER:-\$EVIDENCE_DIR\/w15j-evidence\.json/,
    );
    assert.match(source, /finalized w15j-evidence\.json operator dossier is required/);
    assert.match(source, /w15j-tablet-loopback-trusted-preflight\.mjs/);
    assert.match(source, /w15j-tablet-loopback-preflight\.mjs/);
    assert.match(
      source,
      /node "\$DOSSIER_VALIDATOR" "\$DOSSIER" "\$EVIDENCE_DIR" "\$TUPLE"/,
    );
    assert.match(source, /W15J_TABLET_LOOPBACK_LINT_READY_NOT_ACCEPTED/);
    assert.match(source, /scenarios=48/);
    assert.match(source, /required_physical_scenarios=48/);
    assert.match(source, /complete_dossier_lint=PASS_NOT_ACCEPTED/);
    assert.match(source, /operator_dossier_sha256=\$dossier_sha/);
    assert.match(source, /complete_dossier_lint_sha256=\$dossier_lint_sha/);
    assert.doesNotMatch(source, /complete_dossier_lint=PASS_ACCEPTED/);
  },
);
