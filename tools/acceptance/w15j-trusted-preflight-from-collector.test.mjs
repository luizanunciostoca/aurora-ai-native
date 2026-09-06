import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildTrustedW15JPreflight } from './w15j-trusted-preflight-from-collector.mjs';
import { createFinalizedEvidenceFixture, rewriteManifest, TUPLE } from './w15j-test-fixture.mjs';

function withFixture(run) {
  const fixture = createFinalizedEvidenceFixture();
  try {
    return run(fixture);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
}

function replace(path, from, to) {
  writeFileSync(path, readFileSync(path, 'utf8').replace(from, to));
}

test('builds the exact trusted tuple from finalized manifested collector evidence', () =>
  withFixture(({ directory, apkSha256, zipSha256, controlTower }) => {
    const result = buildTrustedW15JPreflight(directory, controlTower);
    assert.equal(result.schemaVersion, 'w15j-trusted-preflight-v2');
    assert.equal(result.expected.androidCandidateSha, TUPLE.androidCandidateSha);
    assert.equal(result.expected.hostCandidateSha, TUPLE.hostCandidateSha);
    assert.equal(result.expected.reconciledMainSha, TUPLE.reconciledMainSha);
    assert.equal(result.expected.packagingHeadSha, TUPLE.packagingHeadSha);
    assert.equal(result.expected.packagingRunId, TUPLE.packagingRunId);
    assert.equal(result.expected.workflowRun.headBranch, 'prototype/w15j-physical-apk-artifact');
    assert.equal(result.expected.workflowRun.eventName, 'push');
    assert.equal(result.expected.artifact.id, TUPLE.artifactId);
    assert.equal(result.expected.artifact.zipSha256, zipSha256);
    assert.equal(result.expected.apk.sha256, apkSha256);
    assert.equal(result.wakeEvidence.deliberateAttempts, 100);
    assert.equal(result.wakeEvidence.physicallyAccepted, false);
    assert.deepEqual(
      result.adbReverseMappings.map((entry) => entry.port),
      [8080, 8081],
    );
  }));

test('fails closed on a tampered manifested file', () =>
  withFixture(({ directory, controlTower }) => {
    writeFileSync(join(directory, 'evidence.txt'), 'tampered after finalization\n');
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /manifest digest mismatch/,
    );
  }));

test('requires an independent successful Control Tower run tuple', () =>
  withFixture(({ directory, controlTower }) => {
    assert.throws(() => buildTrustedW15JPreflight(directory), /Control Tower tuple is required/);
    for (const mutate of [
      (value) => {
        value.repository = 'fork/aurora-ai-native';
      },
      (value) => {
        value.workflowRun.status = 'FAILURE';
      },
      (value) => {
        value.workflowRun.headSha = '1'.repeat(40);
      },
      (value) => {
        value.workflowRun.headBranch = 'refs/heads/untrusted';
      },
      (value) => {
        value.workflowRun.eventName = 'workflow_dispatch';
      },
      (value) => {
        value.workflowRun.sourceRef = 'https://example.invalid/run';
      },
      (value) => {
        value.artifact.digestSourceRef = 'https://example.invalid/artifact';
      },
      (value) => {
        value.apk.sha256 = '1'.repeat(64);
      },
    ]) {
      const changed = JSON.parse(JSON.stringify(controlTower));
      mutate(changed);
      assert.throws(() => buildTrustedW15JPreflight(directory, changed));
    }
  }));

test('rejects extra keys at every Control Tower tuple level', () =>
  withFixture(({ directory, controlTower }) => {
    for (const mutate of [
      (value) => {
        value.policyToken = 'forbidden';
      },
      (value) => {
        value.workflowRun.actor = 'untrusted';
      },
      (value) => {
        value.artifact.downloadUrl = 'https://example.invalid/artifact';
      },
      (value) => {
        value.apk.signingSecret = 'forbidden';
      },
    ]) {
      const changed = JSON.parse(JSON.stringify(controlTower));
      mutate(changed);
      assert.throws(
        () => buildTrustedW15JPreflight(directory, changed),
        /must contain exactly the canonical keys/,
      );
    }
  }));

test('rejects a remanifested symlink evidence entry', () =>
  withFixture(({ directory, controlTower }) => {
    const target = join(directory, 'evidence-target.txt');
    writeFileSync(target, 'outside indirection\n');
    rmSync(join(directory, 'evidence.txt'));
    symlinkSync(target, join(directory, 'evidence.txt'));
    rewriteManifest(directory);
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /regular non-symlink file/,
    );
  }));

test('rejects hardlinked evidence and prohibited raw PCM inventory', () => {
  withFixture(({ directory, controlTower }) => {
    linkSync(join(directory, 'evidence.txt'), join(directory, 'hardlink.txt'));
    rewriteManifest(directory);
    assert.throws(() => buildTrustedW15JPreflight(directory, controlTower), /hardlink/);
  });
  withFixture(({ directory, controlTower }) => {
    writeFileSync(join(directory, 'microphone-recording.pcm'), 'not allowed');
    rewriteManifest(directory);
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /raw audio evidence is prohibited|not allowlisted/,
    );
  });
});

test('rejects a symlink entry extracted from an otherwise exact artifact ZIP', () =>
  withFixture(({ directory, controlTower, zipSha256 }) => {
    const staging = mkdtempSync(join(tmpdir(), 'w15j-symlink-zip-'));
    try {
      const apkName = 'Aurora-W15J-Physical-localDebug.apk';
      copyFileSync(join(directory, 'BUILD_IDENTITY.txt'), join(staging, 'BUILD_IDENTITY.txt'));
      copyFileSync(join(directory, 'SHA256SUMS.txt'), join(staging, 'SHA256SUMS.txt'));
      symlinkSync(join(directory, 'candidate.apk'), join(staging, apkName));
      execFileSync(
        'zip',
        ['-y', '-q', 'artifact.zip', apkName, 'BUILD_IDENTITY.txt', 'SHA256SUMS.txt'],
        { cwd: staging },
      );
      copyFileSync(join(staging, 'artifact.zip'), join(directory, 'artifact.zip'));
      const maliciousDigest = createHash('sha256')
        .update(readFileSync(join(directory, 'artifact.zip')))
        .digest('hex');
      for (const name of [
        'artifact-metadata.txt',
        'preflight-metadata.txt',
        'finalize-metadata.txt',
      ]) {
        replace(join(directory, name), zipSha256, maliciousDigest);
      }
      const changedControlTower = JSON.parse(JSON.stringify(controlTower));
      changedControlTower.artifact.zipSha256 = maliciousDigest;
      rewriteManifest(directory);
      assert.throws(
        () => buildTrustedW15JPreflight(directory, changedControlTower),
        /ZIP entry .* regular non-symlink file/,
      );
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  }));

test('fails closed on wrong host, main, packaging, or artifact metadata even if remanifested', () => {
  for (const [file, from, to, error] of [
    [
      'preflight-metadata.txt',
      TUPLE.hostCandidateSha,
      '1'.repeat(40),
      /preflight host_candidate_sha does not match artifact tuple/,
    ],
    [
      'preflight-metadata.txt',
      TUPLE.reconciledMainSha,
      '1'.repeat(40),
      /preflight reconciled_main_sha does not match artifact tuple/,
    ],
    [
      'artifact-metadata.txt',
      TUPLE.packagingHeadSha,
      '1'.repeat(40),
      /BUILD_IDENTITY\.packaging_head_sha does not match canonical packaging provenance/,
    ],
    [
      'artifact-metadata.txt',
      TUPLE.artifactId,
      '1234',
      /artifact.id does not match independent Control Tower tuple/,
    ],
  ])
    withFixture(({ directory, controlTower }) => {
      replace(join(directory, file), from, to);
      rewriteManifest(directory);
      assert.throws(() => buildTrustedW15JPreflight(directory, controlTower), error);
    });
});

test('fails closed when copied BUILD_IDENTITY differs from embedded ZIP identity', () =>
  withFixture(({ directory, controlTower }) => {
    const identityPath = join(directory, 'BUILD_IDENTITY.txt');
    const identityLines = readFileSync(identityPath, 'utf8').trimEnd().split('\n');
    writeFileSync(identityPath, `${identityLines.slice(1).join('\n')}\n${identityLines[0]}\n`);
    rewriteManifest(directory);
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /BUILD_IDENTITY.txt differs from the embedded artifact/,
    );
  }));

test('requires canonical embedded packaging and LOCAL transport self-binding', () => {
  for (const [from, to, error] of [
    [
      `packaging_head_sha=${TUPLE.packagingHeadSha}`,
      `packaging_head_sha=${'1'.repeat(40)}`,
      /BUILD_IDENTITY\.packaging_head_sha/,
    ],
    [
      `packaging_run_id=${TUPLE.packagingRunId}`,
      'packaging_run_id=1234',
      /BUILD_IDENTITY\.packaging_run_id/,
    ],
    [
      'packaging_branch=prototype/w15j-physical-apk-artifact',
      'packaging_branch=refs/heads/untrusted',
      /BUILD_IDENTITY\.packaging_branch/,
    ],
    ['gateway_environment=LOCAL', 'gateway_environment=STAGING', /gateway_environment/],
    ['device_gateway_port=8080', 'device_gateway_port=9090', /device_gateway_port/],
    ['bootstrap_port=8081', 'bootstrap_port=9091', /bootstrap_port/],
    [
      'gateway_transport_scope=LOCAL_ADB_REVERSE_ONLY',
      'gateway_transport_scope=PUBLIC_NETWORK',
      /gateway_transport_scope/,
    ],
  ]) {
    withFixture(({ directory, controlTower }) => {
      replace(join(directory, 'BUILD_IDENTITY.txt'), from, to);
      rewriteManifest(directory);
      assert.throws(() => buildTrustedW15JPreflight(directory, controlTower), error);
    });
  }
});

test('requires exact five-key artifact metadata including packaging run id', () =>
  withFixture(({ directory, controlTower }) => {
    replace(
      join(directory, 'artifact-metadata.txt'),
      `packaging_run_id=${TUPLE.packagingRunId}\n`,
      '',
    );
    rewriteManifest(directory);
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /artifact metadata must contain exactly the canonical keys/,
    );
  }));

test('rejects BUILD_IDENTITY extra keys and canonical purpose/source branch drift', () => {
  for (const mutate of [
    (identity) => `${identity}policy_token=forbidden\n`,
    (identity) =>
      identity.replace(
        'artifact_purpose=W15-J-DP5-physical-evidence-input',
        'artifact_purpose=generic-build',
      ),
    (identity) =>
      identity.replace(
        'source_branch=wave/15j-physical-device-integration-acceptance',
        'source_branch=refs/heads/untrusted',
      ),
  ]) {
    withFixture(({ directory, controlTower }) => {
      const path = join(directory, 'BUILD_IDENTITY.txt');
      writeFileSync(path, mutate(readFileSync(path, 'utf8')));
      rewriteManifest(directory);
      assert.throws(
        () => buildTrustedW15JPreflight(directory, controlTower),
        /BUILD_IDENTITY must contain exactly the canonical keys|artifact_purpose|source_branch/,
      );
    });
  }
});

test('cross-checks packaging run id against the independent Control Tower run', () =>
  withFixture(({ directory, controlTower }) => {
    const changed = JSON.parse(JSON.stringify(controlTower));
    changed.workflowRun.id = '34058522664';
    changed.workflowRun.url =
      'https://github.com/luizanunciostoca/aurora-ai-native/actions/runs/34058522664';
    changed.workflowRun.sourceRef = `${changed.workflowRun.url}#exact-head-and-status`;
    changed.artifact.digestSourceRef = `${changed.workflowRun.url}#artifact-${changed.artifact.id}-digest`;
    assert.throws(
      () => buildTrustedW15JPreflight(directory, changed),
      /packagingRunId does not match independent Control Tower workflow run/,
    );
  }));

test('fails closed on installed package identity drift at finalize', () =>
  withFixture(({ directory, controlTower }) => {
    replace(join(directory, 'apk-identity-finalize.txt'), 'version_code=1', 'version_code=2');
    rewriteManifest(directory);
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /installed APK identity drift at finalize/,
    );
  }));

test('fails closed when installed APK bytes differ despite a rewritten manifest', () =>
  withFixture(({ directory, controlTower }) => {
    writeFileSync(join(directory, 'installed-base-finalize.apk'), 'replaced installed APK');
    rewriteManifest(directory);
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /installed-base-finalize.apk does not match the artifact APK SHA-256/,
    );
  }));

test('rejects remanifested split or non-base installed package paths in both phases', () => {
  for (const [name, value] of [
    [
      'package-path.txt',
      'package:/data/app/aurora/base.apk\npackage:/data/app/aurora/split_config.arm64_v8a.apk\n',
    ],
    ['package-path-finalize.txt', 'package:/data/app/aurora/split_config.arm64_v8a.apk\n'],
  ]) {
    withFixture(({ directory, controlTower }) => {
      writeFileSync(join(directory, name), value);
      rewriteManifest(directory);
      assert.throws(
        () => buildTrustedW15JPreflight(directory, controlTower),
        /must contain exactly one package:\/\.\.\.\/base\.apk line/,
      );
    });
  }
});

test('rejects malformed or out-of-order UTC physical timestamps', () => {
  for (const [file, from, to, error] of [
    ['preflight-metadata.txt', '2026-09-05T17:00:00Z', '2026-02-30T17:00:00Z', /real UTC/],
    [
      'preflight-metadata.txt',
      '2026-09-05T17:00:00Z',
      '2026-09-05T17:02:00Z',
      /physical timeline|outside the collector physical window/,
    ],
  ])
    withFixture(({ directory, controlTower }) => {
      replace(join(directory, file), from, to);
      rewriteManifest(directory);
      assert.throws(() => buildTrustedW15JPreflight(directory, controlTower), error);
    });
});

test('requires exact host-ready identity and successful bounded host probes', () =>
  withFixture(({ directory, controlTower }) => {
    writeFileSync(
      join(directory, 'host-ready-announcement.txt'),
      `${readFileSync(join(directory, 'host-ready-announcement.txt'), 'utf8')}unexpected=value\n`,
    );
    rewriteManifest(directory);
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /exactly nine canonical keys/,
    );
  }));

test('parses readiness and collector-owned probes instead of trusting opaque success text', () =>
  withFixture(({ directory, controlTower }) => {
    replace(join(directory, 'host-health-8080.txt'), 'http_status=405', 'http_status=200');
    rewriteManifest(directory);
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /host-health-8080.txt.http_status is invalid/,
    );
  }));

test('rejects stale or semantically invalid collector-owned phase probes', () =>
  withFixture(({ directory, controlTower }) => {
    replace(
      join(directory, 'collector-probe-finalize-8081.txt'),
      '2026-09-05T18:00:00Z',
      '2026-09-05T17:00:01Z',
    );
    rewriteManifest(directory);
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /not fresh in its collector phase/,
    );
  }));

test('requires every resource and host capture to have exit code zero', () =>
  withFixture(({ directory, controlTower }) => {
    writeFileSync(join(directory, 'cpuinfo-after.txt.exit-code'), '1\n');
    rewriteManifest(directory);
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /cpuinfo-after.txt did not complete successfully/,
    );
  }));

test('parses bounded distinct attestation identities and exact tuple statements', () =>
  withFixture(({ directory, controlTower }) => {
    const path = join(directory, 'reviewer-attestation.json');
    const attestation = JSON.parse(readFileSync(path, 'utf8'));
    attestation.identity = 'operator-1';
    writeFileSync(path, `${JSON.stringify(attestation)}\n`);
    rewriteManifest(directory);
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /identity is not independent/,
    );
  }));

test('rejects whitespace identity bypass and reviewer not bound to final manifest', () => {
  withFixture(({ directory, controlTower }) => {
    const path = join(directory, 'reviewer-attestation.json');
    const attestation = JSON.parse(readFileSync(path, 'utf8'));
    attestation.identity = 'operator-1 ';
    writeFileSync(path, `${JSON.stringify(attestation)}\n`);
    rewriteManifest(directory);
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /surrounding whitespace/,
    );
  });
  withFixture(({ directory, controlTower }) => {
    const path = join(directory, 'reviewer-attestation.json');
    const attestation = JSON.parse(readFileSync(path, 'utf8'));
    attestation.evidenceManifestSha256 = '0'.repeat(64);
    writeFileSync(path, `${JSON.stringify(attestation)}\n`);
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /does not bind the exact finalized evidence manifest/,
    );
  });
});

test('requires all host probe process/time values to equal the host announcement', () =>
  withFixture(({ directory, controlTower }) => {
    replace(join(directory, 'host-listener-8081.txt'), 'process_id=4242', 'process_id=4243');
    rewriteManifest(directory);
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /does not bind the host announcement process\/time/,
    );
  }));

test('binds both listener roles and both collector phases to one host instance', () => {
  for (const [file, from, to, error] of [
    [
      'host-listener-8081.txt',
      `host_instance_id=whi_${'9'.repeat(64)}`,
      `host_instance_id=whi_${'8'.repeat(64)}`,
      /host_instance_id is invalid/,
    ],
    [
      'collector-probe-finalize-8080.txt',
      `host_instance_id=whi_${'9'.repeat(64)}`,
      `host_instance_id=whi_${'8'.repeat(64)}`,
      /host_instance_id is invalid/,
    ],
    [
      'collector-probe-finalize-8081.txt',
      'listener_role=BOOTSTRAP_EXCHANGE',
      'listener_role=DEVICE_GATEWAY',
      /listener_role is invalid/,
    ],
    [
      'collector-probe-finalize-8081.txt',
      'cache_control=no-store',
      'cache_control=public',
      /cache_control is invalid/,
    ],
    ['host-listener-8080.txt', 'pragma=no-cache', 'pragma=cache', /pragma is invalid/],
  ]) {
    withFixture(({ directory, controlTower }) => {
      replace(join(directory, file), from, to);
      rewriteManifest(directory);
      assert.throws(() => buildTrustedW15JPreflight(directory, controlTower), error);
    });
  }
});

test('fails closed when cleanup proof is missing or still shows a mapping', () =>
  withFixture(({ directory, controlTower }) => {
    writeFileSync(
      join(directory, 'adb-reverse-dual-port-after-finalize.txt'),
      'UsbFfs tcp:8081 tcp:8081\n',
    );
    rewriteManifest(directory);
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /still contains tcp:8081/,
    );
  }));

test('fails closed when dual-port cleanup evidence is absent', () =>
  withFixture(({ directory, controlTower }) => {
    rmSync(join(directory, 'adb-reverse-dual-port-after-finalize.txt'));
    rewriteManifest(directory);
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /final evidence manifest is missing adb-reverse-dual-port-after-finalize.txt/,
    );
  }));

test('fails closed on missing wake matrix or fewer than 100 deliberate attempts', () =>
  withFixture(({ directory, controlTower }) => {
    const wakePath = join(directory, 'wake-evidence.json');
    const wake = JSON.parse(readFileSync(wakePath, 'utf8'));
    wake.scenarios = wake.scenarios.filter((scenario) => scenario.id !== 'WAKE-AUDIO-004');
    writeFileSync(wakePath, `${JSON.stringify(wake, null, 2)}\n`);
    rewriteManifest(directory);
    assert.throws(
      () => buildTrustedW15JPreflight(directory, controlTower),
      /wake scenario matrix|WAKE-AUDIO-004/,
    );
  }));

test('fails closed when deliberate wake attempts are below 100', () =>
  withFixture(({ directory, controlTower }) => {
    const wakePath = join(directory, 'wake-evidence.json');
    const wake = JSON.parse(readFileSync(wakePath, 'utf8'));
    wake.accuracy.deliberateAttempts = 99;
    wake.accuracy.confirmedWakes = 95;
    writeFileSync(wakePath, `${JSON.stringify(wake, null, 2)}\n`);
    rewriteManifest(directory);
    assert.throws(() => buildTrustedW15JPreflight(directory, controlTower), /integer >= 100/);
  }));
