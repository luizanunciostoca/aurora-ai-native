import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createFinalizedEvidenceFixture, HOST_INSTANCE_ID, TUPLE } from './w15j-test-fixture.mjs';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../..');
const COLLECTOR = join(
  REPOSITORY_ROOT,
  'apps/aurora-android/physical/collect-w15j-physical-evidence.sh',
);
const WRAPPER = join(
  REPOSITORY_ROOT,
  'apps/aurora-android/physical/run-w15j-dual-port-physical-window.sh',
);
const HOST_READINESS_FILES = [
  'host-ready-announcement.txt',
  'host-listener-8080.txt',
  'host-listener-8080.txt.exit-code',
  'host-listener-8081.txt',
  'host-listener-8081.txt.exit-code',
  'host-health-8080.txt',
  'host-health-8080.txt.exit-code',
  'host-health-8081.txt',
  'host-health-8081.txt.exit-code',
];

function copyReadiness(sourceDirectory, targetDirectory) {
  mkdirSync(targetDirectory);
  for (const name of HOST_READINESS_FILES) {
    copyFileSync(join(sourceDirectory, name), join(targetDirectory, name));
  }
}

function safetyFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'w15j-cleanup-'));
  const log = join(directory, 'adb-calls.txt');
  const adb = join(directory, 'fake-adb');
  writeFileSync(
    adb,
    `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >>"$ADB_CALL_LOG"
if [[ "\${1:-}" == devices ]]; then
  printf 'List of devices attached\\nphysical-serial\\tdevice\\n'
  exit 0
fi
shift 2
if [[ "\${1:-}" == shell && "\${2:-}" == getprop ]]; then
  case "\${3:-}" in
    ro.kernel.qemu) printf '0\\n' ;;
    ro.product.model) printf 'Tablet\\n' ;;
    ro.product.manufacturer) printf 'Samsung\\n' ;;
    ro.product.name) printf 'tablet\\n' ;;
    ro.build.version.sdk) printf '36\\n' ;;
    ro.build.fingerprint) printf 'samsung/tablet/build\\n' ;;
  esac
  exit 0
fi
if [[ "\${1:-}" == shell && "\${2:-}" == pm && "\${3:-}" == path ]]; then
  printf 'package:/data/app/base.apk\\npackage:/data/app/split_config.arm64_v8a.apk\\n'
  exit 0
fi
if [[ "\${1:-}" == reverse && "\${2:-}" == --list ]]; then
  printf 'UsbFfs tcp:8080 tcp:8080\\nUsbFfs tcp:8081 tcp:8081\\n'
  exit 0
fi
if [[ "\${1:-}" == reverse && "\${2:-}" == --remove ]]; then
  exit 0
fi
exit 0
`,
  );
  chmodSync(adb, 0o755);
  return { directory, log, adb };
}

function successfulFinalizeToolsFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'w15j-finalize-tools-'));
  const log = join(directory, 'adb-calls.txt');
  const reverseState = join(directory, 'reverse-removed');
  const adb = join(directory, 'fake-adb');
  const curl = join(directory, 'curl');
  writeFileSync(
    adb,
    `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >>"$ADB_CALL_LOG"
if [[ "\${1:-}" == devices ]]; then
  printf 'List of devices attached\\nphysical-serial\\tdevice\\n'
  exit 0
fi
shift 2
if [[ "\${1:-}" == shell && "\${2:-}" == getprop ]]; then
  case "\${3:-}" in
    ro.kernel.qemu) printf '0\\n' ;;
    ro.product.model) printf 'Tablet\\n' ;;
    ro.product.manufacturer) printf 'Samsung\\n' ;;
    ro.product.name) printf 'tablet\\n' ;;
    ro.build.version.sdk) printf '36\\n' ;;
    ro.build.fingerprint) printf 'samsung/tablet/build\\n' ;;
  esac
  exit 0
fi
if [[ "\${1:-}" == shell && "\${2:-}" == pm && "\${3:-}" == path ]]; then
  printf 'package:/data/app/aurora/base.apk\\n'
  exit 0
fi
if [[ "\${1:-}" == shell && "\${2:-}" == dumpsys && "\${3:-}" == package ]]; then
  printf '  versionCode=1 minSdk=26 targetSdk=36\\n  versionName=0.15.0-alpha.1-local\\n'
  exit 0
fi
if [[ "\${1:-}" == shell ]]; then
  printf 'bounded device observation\\n'
  exit 0
fi
if [[ "\${1:-}" == pull ]]; then
  cp -- "$ADB_APK_SOURCE" "\${3:?pull destination missing}"
  printf '1 file pulled\\n'
  exit 0
fi
if [[ "\${1:-}" == reverse && "\${2:-}" == --list ]]; then
  if [[ ! -e "$ADB_REVERSE_STATE" ]]; then
    printf 'UsbFfs tcp:8080 tcp:8080\\nUsbFfs tcp:8081 tcp:8081\\n'
  fi
  exit 0
fi
if [[ "\${1:-}" == reverse && "\${2:-}" == --remove ]]; then
  : >"$ADB_REVERSE_STATE"
  exit 0
fi
exit 0
`,
  );
  writeFileSync(
    curl,
    `#!/usr/bin/env bash
set -eu
output=''
headers=''
url=''
while (( $# > 0 )); do
  case "$1" in
    --output) output="\${2:?output missing}"; shift 2 ;;
    --dump-header) headers="\${2:?headers missing}"; shift 2 ;;
    --write-out) shift 2 ;;
    http://*) url="$1"; shift ;;
    *) shift ;;
  esac
done
if [[ "$url" == *':8080/'* ]]; then role='DEVICE_GATEWAY'; else role='BOOTSTRAP_EXCHANGE'; fi
printf '{"kind":"LOCAL_HOST_INSTANCE","hostInstanceId":"${HOST_INSTANCE_ID}","listenerRole":"%s","authorizesExecution":false,"provesExecutionSuccess":false,"retryAuthorized":false,"physicalEvidenceStatus":"NOT_RUN"}' "$role" >"$output"
printf 'HTTP/1.1 200 OK\\r\\nCache-Control: no-store\\r\\nPragma: no-cache\\r\\n\\r\\n' >"$headers"
printf '200'
`,
  );
  chmodSync(adb, 0o755);
  chmodSync(curl, 0o755);
  return { directory, log, reverseState, adb };
}

test('collector removes 8080 when finalize fails after adopting the existing mapping', () => {
  const fixture = safetyFixture();
  try {
    const evidence = join(fixture.directory, 'evidence');
    mkdirSync(evidence);
    const apk = join(fixture.directory, 'candidate.apk');
    const zip = join(fixture.directory, 'artifact.zip');
    const metadata = join(fixture.directory, 'artifact-metadata.txt');
    for (const path of [apk, zip, metadata]) writeFileSync(path, 'invalid but present\n');
    const result = spawnSync('bash', [COLLECTOR], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ADB_BIN: fixture.adb,
        ADB_CALL_LOG: fixture.log,
        AURORA_EVIDENCE_MODE: 'finalize',
        AURORA_EVIDENCE_DIR: evidence,
        AURORA_CANDIDATE_SHA: 'a'.repeat(40),
        AURORA_APK: apk,
        AURORA_ARTIFACT_ZIP: zip,
        AURORA_ARTIFACT_METADATA: metadata,
        AURORA_APK_VARIANT: 'localDebug',
        AURORA_OPERATOR: 'operator-1',
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(readFileSync(fixture.log, 'utf8'), /reverse --remove tcp:8080/);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('dual-port wrapper removes 8080 and 8081 on any finalize failure after adoption', () => {
  const fixture = safetyFixture();
  try {
    const evidence = join(fixture.directory, 'evidence');
    mkdirSync(evidence);
    const result = spawnSync('bash', [WRAPPER], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ADB_BIN: fixture.adb,
        ADB_CALL_LOG: fixture.log,
        AURORA_EVIDENCE_MODE: 'finalize',
        AURORA_EVIDENCE_DIR: evidence,
        AURORA_CANDIDATE_SHA: 'a'.repeat(40),
      },
    });
    assert.notEqual(result.status, 0);
    const calls = readFileSync(fixture.log, 'utf8');
    assert.match(calls, /reverse --remove tcp:8080/);
    assert.match(calls, /reverse --remove tcp:8081/);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('collector rejects split APK pm path output instead of selecting base.apk silently', () => {
  const adbFixture = safetyFixture();
  const artifactFixture = createFinalizedEvidenceFixture();
  try {
    const readiness = join(adbFixture.directory, 'host-readiness');
    mkdirSync(readiness);
    for (const name of HOST_READINESS_FILES) {
      copyFileSync(join(artifactFixture.directory, name), join(readiness, name));
    }
    const freshTimestamp = new Date().toISOString();
    const announcementPath = join(readiness, 'host-ready-announcement.txt');
    writeFileSync(
      announcementPath,
      readFileSync(announcementPath, 'utf8').replace(
        /started_at_utc=.*$/mu,
        `started_at_utc=${freshTimestamp}`,
      ),
    );
    for (const name of [
      'host-listener-8080.txt',
      'host-listener-8081.txt',
      'host-health-8080.txt',
      'host-health-8081.txt',
    ]) {
      const path = join(readiness, name);
      writeFileSync(
        path,
        readFileSync(path, 'utf8').replace(
          /observed_at_utc=.*$/mu,
          `observed_at_utc=${freshTimestamp}`,
        ),
      );
    }
    const output = join(adbFixture.directory, 'new-evidence');
    const result = spawnSync('bash', [COLLECTOR], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ADB_BIN: adbFixture.adb,
        ADB_CALL_LOG: adbFixture.log,
        AURORA_EVIDENCE_MODE: 'preflight',
        AURORA_EVIDENCE_DIR: output,
        AURORA_CANDIDATE_SHA: TUPLE.androidCandidateSha,
        AURORA_APK: join(artifactFixture.directory, 'candidate.apk'),
        AURORA_ARTIFACT_ZIP: join(artifactFixture.directory, 'artifact.zip'),
        AURORA_ARTIFACT_METADATA: join(artifactFixture.directory, 'artifact-metadata.txt'),
        AURORA_APK_VARIANT: TUPLE.apkVariant,
        AURORA_OPERATOR: 'operator-1',
        AURORA_W15J_HOST_READINESS_DIR: readiness,
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exactly one package line and no splits/);
  } finally {
    rmSync(adbFixture.directory, { recursive: true, force: true });
    rmSync(artifactFixture.directory, { recursive: true, force: true });
  }
});

test('collector rejects stale host readiness at preflight', () => {
  const adbFixture = safetyFixture();
  const artifactFixture = createFinalizedEvidenceFixture();
  try {
    const readiness = join(adbFixture.directory, 'host-readiness');
    copyReadiness(artifactFixture.directory, readiness);
    const result = spawnSync('bash', [COLLECTOR], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ADB_BIN: adbFixture.adb,
        ADB_CALL_LOG: adbFixture.log,
        AURORA_EVIDENCE_MODE: 'preflight',
        AURORA_EVIDENCE_DIR: join(adbFixture.directory, 'new-evidence'),
        AURORA_CANDIDATE_SHA: TUPLE.androidCandidateSha,
        AURORA_APK: join(artifactFixture.directory, 'candidate.apk'),
        AURORA_ARTIFACT_ZIP: join(artifactFixture.directory, 'artifact.zip'),
        AURORA_ARTIFACT_METADATA: join(artifactFixture.directory, 'artifact-metadata.txt'),
        AURORA_APK_VARIANT: TUPLE.apkVariant,
        AURORA_OPERATOR: 'operator-1',
        AURORA_W15J_HOST_READINESS_DIR: readiness,
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /host ready started_at_utc is stale or invalid for preflight/);
  } finally {
    rmSync(adbFixture.directory, { recursive: true, force: true });
    rmSync(artifactFixture.directory, { recursive: true, force: true });
  }
});

test('finalize accepts immutable old readiness and reaches fresh collector-owned probes', () => {
  const toolsFixture = successfulFinalizeToolsFixture();
  const artifactFixture = createFinalizedEvidenceFixture();
  try {
    const readiness = join(toolsFixture.directory, 'host-readiness');
    copyReadiness(artifactFixture.directory, readiness);
    const serialSha256 = createHash('sha256').update('physical-serial').digest('hex');
    const preflightMetadataPath = join(artifactFixture.directory, 'preflight-metadata.txt');
    writeFileSync(
      preflightMetadataPath,
      readFileSync(preflightMetadataPath, 'utf8').replace(
        /serial_sha256=.*$/mu,
        `serial_sha256=${serialSha256}`,
      ),
    );
    rmSync(join(artifactFixture.directory, 'reviewer-attestation.json'));

    const result = spawnSync('bash', [COLLECTOR], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${toolsFixture.directory}:${process.env.PATH}`,
        ADB_BIN: toolsFixture.adb,
        ADB_CALL_LOG: toolsFixture.log,
        ADB_APK_SOURCE: join(artifactFixture.directory, 'candidate.apk'),
        ADB_REVERSE_STATE: toolsFixture.reverseState,
        AURORA_EVIDENCE_MODE: 'finalize',
        AURORA_EVIDENCE_DIR: artifactFixture.directory,
        AURORA_CANDIDATE_SHA: TUPLE.androidCandidateSha,
        AURORA_APK: join(artifactFixture.directory, 'candidate.apk'),
        AURORA_ARTIFACT_ZIP: join(artifactFixture.directory, 'artifact.zip'),
        AURORA_ARTIFACT_METADATA: join(artifactFixture.directory, 'artifact-metadata.txt'),
        AURORA_APK_VARIANT: TUPLE.apkVariant,
        AURORA_OPERATOR: 'operator-1',
        AURORA_W15J_HOST_READINESS_DIR: readiness,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    for (const port of [8080, 8081]) {
      assert.match(
        readFileSync(
          join(artifactFixture.directory, `collector-probe-finalize-${port}.txt`),
          'utf8',
        ),
        new RegExp(
          `phase=finalize[\\s\\S]*port=${port}[\\s\\S]*http_status=200[\\s\\S]*host_instance_id=${HOST_INSTANCE_ID}`,
          'u',
        ),
      );
      assert.equal(
        readFileSync(
          join(artifactFixture.directory, `collector-probe-finalize-${port}.txt.exit-code`),
          'utf8',
        ).trim(),
        '0',
      );
    }
  } finally {
    rmSync(toolsFixture.directory, { recursive: true, force: true });
    rmSync(artifactFixture.directory, { recursive: true, force: true });
  }
});
