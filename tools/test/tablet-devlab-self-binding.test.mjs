import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(
  resolve(repoRoot, 'tools/tablet-devlab/dossier-doctor.sh'),
  'utf8',
);

test('dossier doctor binds itself to the live clean DevLab PR head', () => {
  assert.match(source, /for cmd in git node jq mktemp sha256sum gh/);
  assert.match(source, /gh auth status/);
  assert.match(source, /DEVLAB_PR="\$\{AURORA_DEVLAB_PR:-499\}"/);
  assert.match(source, /git -C "\$DEVLAB_WORKTREE" rev-parse HEAD/);
  assert.match(source, /git -C "\$DEVLAB_WORKTREE" status --porcelain/);
  assert.match(source, /\/repos\/\$REPO\/pulls\/\$DEVLAB_PR/);
  assert.match(source, /pr_head.*devlab_head/);
  assert.match(source, /pr_base.*main_sha/);
  assert.match(source, /\/repos\/\$REPO\/compare\/\$main_sha\.\.\.\$devlab_head/);
  assert.match(source, /merge_base.*main_sha/);
  assert.match(source, /behind.*0/);
  assert.match(source, /devlab_candidate_sha=\$devlab_head/);
  assert.match(source, /physical_acceptance=false/);
  assert.match(source, /w16_build_unblocked=false/);
});
