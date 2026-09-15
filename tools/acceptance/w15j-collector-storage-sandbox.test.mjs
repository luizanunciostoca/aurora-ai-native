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
