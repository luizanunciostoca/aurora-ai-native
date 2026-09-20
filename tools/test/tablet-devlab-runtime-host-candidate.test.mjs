import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('runtime Host candidate is separate, bounded and non-authoritative', async () => {
  const setter = await source('../tablet-devlab/set-runtime-host-candidate.sh');
  assert.equal(setter.includes('W15J_RUNTIME_HOST_CANDIDATE_V1'), true);
  assert.equal(setter.includes('chmod 600 "$TMP"'), true);
  assert.equal(setter.includes('authorizes_execution=false'), true);
  assert.equal(setter.includes('physical_acceptance=false'), true);
  assert.equal(setter.includes('control-tower-tuple.json'), false);
});

test('prebuild and verify prefer explicit runtime Host candidate without rewriting legacy tuple', async () => {
  for (const path of [
    '../tablet-devlab/prebuild-host.sh',
    '../tablet-devlab/verify-host-prebuild.sh',
  ]) {
    const text = await source(path);
    assert.equal(text.includes('w15j-runtime-host-candidate.txt'), true);
    assert.equal(text.includes('AURORA_W15J_HOST_CANDIDATE_SHA'), true);
    assert.equal(text.includes('W15J_RUNTIME_HOST_CANDIDATE_V1'), true);
    assert.equal(text.includes('runtime Host candidate cannot authorize execution'), true);
    assert.equal(text.includes('runtime Host candidate cannot claim physical acceptance'), true);
    assert.equal(text.includes('awk -F= \'$1=="host" {print $2}\' "$WORKTREES"'), true);
  }
});
