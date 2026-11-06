import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

const source = readFileSync(new URL('../tablet-devlab/dp5-safe-batch.sh', import.meta.url), 'utf8');

test('DP5 safe batch contains only the four non-effect physical scenarios', () => {
  for (const id of ['DP5-LIFE-001', 'DP5-LIFE-003', 'DP5-ID-002', 'DP5-APP-001']) {
    assert.match(source, new RegExp(id, 'u'));
  }
  for (const forbidden of [
    'DP5-LIFE-004',
    'SESSION_REVOKE',
    'SESSION_ROTATE',
    'OFFLINE_DRAIN',
    'CAPABILITY_STALE',
    'authorize-dp5-effect',
    'prepare-dp5-provider',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test('DP5 safe batch captures evidence but never records a verdict', () => {
  assert.match(source, /dp5-campaign\.mjs capture/u);
  assert.doesNotMatch(source, /dp5-campaign\.mjs (?:finish|verdict)/u);
  assert.match(source, /CAPTURED_AWAITING_VERDICT/u);
  assert.match(source, /EVIDENCE_CAPTURE_ONLY_NOT_VERDICT/u);
  assert.match(source, /physical_acceptance=false/u);
});

test('DP5 safe batch proves exact installed APK bytes and signer for APP-001', () => {
  assert.match(source, /adb -s "\$SERIAL" exec-out cat "\$apk_path"/u);
  assert.match(source, /sha256sum "\$tmp"/u);
  assert.match(source, /apksigner verify --print-certs/u);
  assert.match(source, /trustedSignerSha256/u);
});
