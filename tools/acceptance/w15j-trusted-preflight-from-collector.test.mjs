import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildTrustedW15JPreflight } from './w15j-trusted-preflight-from-collector.mjs';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'w15j-collector-'));
  writeFileSync(
    join(directory, 'preflight-metadata.txt'),
    [
      `candidate_sha=${'a'.repeat(40)}`,
      `apk_path_sha256=${'b'.repeat(64)}`,
      'apk_variant=localDebug',
      `serial_sha256=${'c'.repeat(64)}`,
      'manufacturer=Samsung',
      'model=Tablet',
      'product=tablet',
      'api_level=36',
      'build_fingerprint=samsung/tablet/build',
      'ro.kernel.qemu=0',
      'gateway_identity=w14-local',
      'gateway_version=1.0.0',
      'gateway_port=8080',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(directory, 'apk-identity.txt'),
    [
      `candidate_sha=${'a'.repeat(40)}`,
      'application_id=ai.aurora.device.local',
      'variant=localDebug',
      'version_code=15',
      'version_name=0.15.0',
      `apk_sha256=${'b'.repeat(64)}`,
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(directory, 'dual-port-metadata.txt'),
    'device_gateway_port=8080\nbootstrap_port=8081\ntransport_scope=LOCAL_ADB_REVERSE_ONLY\n',
  );
  writeFileSync(
    join(directory, 'adb-reverse-dual-port-preflight.txt'),
    'UsbFfs tcp:8080 tcp:8080\nUsbFfs tcp:8081 tcp:8081\n',
  );
  return directory;
}

test('builds the exact trusted tuple from collector evidence', () => {
  const directory = fixture();
  try {
    const result = buildTrustedW15JPreflight(directory);
    assert.equal(result.schemaVersion, 'w15j-trusted-preflight-v1');
    assert.equal(result.expected.candidateSha, 'a'.repeat(40));
    assert.equal(result.expected.apk.sha256, 'b'.repeat(64));
    assert.equal(result.expected.device.serialSha256, 'c'.repeat(64));
    assert.equal(
      result.expected.environment.gatewayTransport,
      'LOCAL_ADB_REVERSE_ONLY',
    );
    assert.deepEqual(result.adbReverseMappings, [
      { host: 'tcp', port: 8080, status: 'PRESENT' },
      { host: 'tcp', port: 8081, status: 'PRESENT' },
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('fails closed on candidate or APK provenance drift', () => {
  const directory = fixture();
  try {
    const apkPath = join(directory, 'apk-identity.txt');
    writeFileSync(
      apkPath,
      [
        `candidate_sha=${'d'.repeat(40)}`,
        'application_id=ai.aurora.device.local',
        'variant=localDebug',
        'version_code=15',
        'version_name=0.15.0',
        `apk_sha256=${'b'.repeat(64)}`,
        '',
      ].join('\n'),
    );
    assert.throws(() => buildTrustedW15JPreflight(directory), /candidate SHA drift/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('fails closed when either reverse mapping is absent', () => {
  const directory = fixture();
  try {
    writeFileSync(
      join(directory, 'adb-reverse-dual-port-preflight.txt'),
      'UsbFfs tcp:8080 tcp:8080\n',
    );
    assert.throws(() => buildTrustedW15JPreflight(directory), /tcp:8081 is absent/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects emulator provenance', () => {
  const directory = fixture();
  try {
    const metadataPath = join(directory, 'preflight-metadata.txt');
    writeFileSync(
      metadataPath,
      [
        `candidate_sha=${'a'.repeat(40)}`,
        `apk_path_sha256=${'b'.repeat(64)}`,
        'apk_variant=localDebug',
        `serial_sha256=${'c'.repeat(64)}`,
        'manufacturer=Samsung',
        'model=Tablet',
        'product=tablet',
        'api_level=36',
        'build_fingerprint=samsung/tablet/build',
        'ro.kernel.qemu=1',
        'gateway_identity=w14-local',
        'gateway_version=1.0.0',
        'gateway_port=8080',
        '',
      ].join('\n'),
    );
    assert.throws(() => buildTrustedW15JPreflight(directory), /emulator evidence/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
