import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (name) => readFileSync(resolve(repoRoot, 'tools/tablet-devlab', name), 'utf8');

test('control-tower capture accepts the canonical false artifact expiry value', () => {
  const source = read('capture-control-tower-tuple.sh');
  assert.match(source, /artifact_expired="\$\(jq -r '\.expired'/);
  assert.doesNotMatch(source, /artifact_expired="\$\(jq -er '\.expired'/);
  assert.match(source, /\[\[ "\$artifact_expired" == "false" \]\]/);
});

test('dossier doctor reads physicallyAccepted=false without jq -e aborting', () => {
  const source = read('dossier-doctor.sh');
  assert.match(source, /accepted="\$\(jq -r '\.physicallyAccepted'/);
  assert.doesNotMatch(source, /accepted="\$\(jq -er '\.physicallyAccepted'/);
  assert.match(source, /\[\[ "\$accepted" == "false" \]\]/);
});
