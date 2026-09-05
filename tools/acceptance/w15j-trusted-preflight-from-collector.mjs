import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GIT_SHA = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function parseKeyValueFile(path) {
  const result = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    if (rawLine === '') continue;
    const separator = rawLine.indexOf('=');
    if (separator <= 0) throw new Error(`invalid metadata line in ${path}`);
    const key = rawLine.slice(0, separator);
    const value = rawLine.slice(separator + 1);
    if (Object.hasOwn(result, key)) throw new Error(`duplicate metadata key ${key}`);
    result[key] = value;
  }
  return result;
}

function required(record, key, label) {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label}.${key} is required`);
  }
  return value;
}

function exact(value, pattern, label) {
  if (!pattern.test(value)) throw new Error(`${label} has invalid format`);
  return value;
}

function exactPort(value, expected, label) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port !== expected) {
    throw new Error(`${label} must be ${expected}`);
  }
  return port;
}

export function buildTrustedW15JPreflight(evidenceDirectory) {
  const preflight = parseKeyValueFile(join(evidenceDirectory, 'preflight-metadata.txt'));
  const apk = parseKeyValueFile(join(evidenceDirectory, 'apk-identity.txt'));
  const dual = parseKeyValueFile(join(evidenceDirectory, 'dual-port-metadata.txt'));
  const mappings = readFileSync(
    join(evidenceDirectory, 'adb-reverse-dual-port-preflight.txt'),
    'utf8',
  );

  const candidateSha = exact(
    required(preflight, 'candidate_sha', 'preflight'),
    GIT_SHA,
    'candidate_sha',
  );
  if (required(apk, 'candidate_sha', 'apk') !== candidateSha) {
    throw new Error('candidate SHA drift between collector records');
  }
  const apkSha256 = exact(
    required(preflight, 'apk_path_sha256', 'preflight'),
    SHA256,
    'apk sha256',
  );
  if (required(apk, 'apk_sha256', 'apk') !== apkSha256) {
    throw new Error('APK digest drift between collector records');
  }
  if (required(preflight, 'apk_variant', 'preflight') !== required(apk, 'variant', 'apk')) {
    throw new Error('APK variant drift between collector records');
  }
  if (required(preflight, 'ro.kernel.qemu', 'preflight') === '1') {
    throw new Error('emulator evidence is not physical DP5 provenance');
  }

  const deviceGatewayPort = exactPort(
    required(dual, 'device_gateway_port', 'dual-port'),
    8080,
    'device_gateway_port',
  );
  const bootstrapPort = exactPort(
    required(dual, 'bootstrap_port', 'dual-port'),
    8081,
    'bootstrap_port',
  );
  if (required(dual, 'transport_scope', 'dual-port') !== 'LOCAL_ADB_REVERSE_ONLY') {
    throw new Error('dual-port transport scope must be LOCAL_ADB_REVERSE_ONLY');
  }
  for (const port of [deviceGatewayPort, bootstrapPort]) {
    if (!mappings.includes(`tcp:${port} tcp:${port}`)) {
      throw new Error(`ADB reverse mapping tcp:${port} is absent from collector evidence`);
    }
  }

  return {
    schemaVersion: 'w15j-trusted-preflight-v1',
    expected: {
      candidateSha,
      apk: {
        applicationId: required(apk, 'application_id', 'apk'),
        variant: required(apk, 'variant', 'apk'),
        versionCode: required(apk, 'version_code', 'apk'),
        versionName: required(apk, 'version_name', 'apk'),
        sha256: apkSha256,
      },
      device: {
        serialSha256: exact(
          required(preflight, 'serial_sha256', 'preflight'),
          SHA256,
          'device serial sha256',
        ),
        manufacturer: required(preflight, 'manufacturer', 'preflight'),
        model: required(preflight, 'model', 'preflight'),
        product: required(preflight, 'product', 'preflight'),
        apiLevel: required(preflight, 'api_level', 'preflight'),
        buildFingerprint: required(preflight, 'build_fingerprint', 'preflight'),
      },
      environment: {
        gatewayIdentity: required(preflight, 'gateway_identity', 'preflight'),
        gatewayVersion: required(preflight, 'gateway_version', 'preflight'),
        gatewayTransport: 'LOCAL_ADB_REVERSE_ONLY',
      },
    },
    adbReverseMappings: [
      { host: 'tcp', port: deviceGatewayPort, status: 'PRESENT' },
      { host: 'tcp', port: bootstrapPort, status: 'PRESENT' },
    ],
    sourceEvidence: {
      preflightMetadata: 'preflight-metadata.txt',
      apkIdentity: 'apk-identity.txt',
      dualPortMetadata: 'dual-port-metadata.txt',
      adbReverseList: 'adb-reverse-dual-port-preflight.txt',
    },
  };
}

if (process.argv[1]?.endsWith('w15j-trusted-preflight-from-collector.mjs')) {
  const evidenceDirectory = process.argv[2];
  const outputPath = process.argv[3];
  if (!evidenceDirectory || !outputPath) {
    console.error(
      'Usage: node tools/acceptance/w15j-trusted-preflight-from-collector.mjs <evidence-directory> <output-json>',
    );
    process.exitCode = 2;
  } else {
    try {
      writeFileSync(
        outputPath,
        `${JSON.stringify(buildTrustedW15JPreflight(evidenceDirectory), null, 2)}\n`,
        { flag: 'wx' },
      );
      console.log(`W15J_TRUSTED_PREFLIGHT_WRITTEN ${outputPath}`);
    } catch (error) {
      console.error(`W15J_TRUSTED_PREFLIGHT_BLOCKED: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
