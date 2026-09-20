import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
const root = resolve(import.meta.dirname, '../..');
for (const relative of [
  'apps/aurora-android/physical/collect-w15j-physical-evidence.sh',
  'apps/aurora-android/physical/collect-w15j-tablet-loopback-evidence.sh',
]) {
  test(`${relative} never reinstalls the APK during evidence collection`, () => {
    const source = readFileSync(resolve(root, relative), 'utf8');
    assert.doesNotMatch(source, /\binstall\s+-r\b/u);
    assert.match(source, /PREINSTALLED_EXACT_APK_VERIFIED/u);
  });

  test(`${relative} measures app storage through run-as`, () => {
    const source = readFileSync(resolve(root, relative), 'utf8');
    assert.doesNotMatch(source, /adb_shell du -sk "\/data\/user\/0\/\$PACKAGE_ID"/u);
    const matches = source.match(/adb_shell run-as "\$PACKAGE_ID" du -sk \./gu) ?? [];
    assert.ok(
      matches.length >= 3,
      `expected all storage captures to use run-as, got ${matches.length}`,
    );
  });
}

test('tablet-loopback collector binds the v017r4 physical gateway origin', () => {
  const source = readFileSync(
    resolve(root, 'apps/aurora-android/physical/collect-w15j-tablet-loopback-evidence.sh'),
    'utf8',
  );
  assert.ok(source.includes('GATEWAY_ORIGIN="http://127.0.0.1:8080"'));
  assert.ok(source.includes('-eq 24'));
  assert.ok(source.includes('required_kv BUILD_META gateway_origin'));
  assert.ok(source.includes('artifact gateway origin is not physical loopback'));
});

test('tablet-loopback collector separates pre-sign artifact from stable-signed physical APK', () => {
  const source = readFileSync(
    resolve(root, 'apps/aurora-android/physical/collect-w15j-tablet-loopback-evidence.sh'),
    'utf8',
  );
  assert.match(source, /AURORA_FINAL_SIGNING_IDENTITY/u);
  assert.match(source, /presign_apk_sha256/u);
  assert.match(source, /expected_final_apk_sha256/u);
  assert.match(source, /PHYSICAL_DEV_STABLE_LOCAL/u);
  assert.match(source, /candidate-presign\.apk/u);
  assert.match(source, /deterministic_signing=true/u);
  assert.match(source, /private_key_exported=false/u);
  assert.doesNotMatch(source, /store\.pass|aurora-physical-dev\.p12|private key/u);
});
