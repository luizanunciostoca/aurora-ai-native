import { readFileSync } from 'node:fs';

const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_SHA = /^[a-f0-9]{40}$/u;

export const REQUIRED_THREAT_SCENARIOS = Object.freeze([
  'static-buildconfig-credential-leakage',
  'durable-bootstrap-credential-persistence',
  'tenant-actor-injection',
  'bootstrap-replay',
  'session-binding-substitution',
  'stale-revoked-session-reuse',
  'ack-as-success',
  'device-trust-authority-promotion',
  'tts-self-wake',
  'false-wake-dispatch',
  'ambiguous-transcript-execution',
  'post-write-retry',
  'process-restart-credential-reuse',
]);

const REQUIRED_REVERSE_MAPPINGS = Object.freeze([
  { port: 8080, purpose: 'authenticated W14 device/voice' },
  { port: 8081, purpose: 'bootstrap exchange' },
]);

const DISALLOWED_SCENARIO_STATUSES = new Set(['NOT_RUN', 'FAIL', 'BLOCKED']);

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
  return value;
}

function exactSha(value, label, pattern) {
  const normalized = requiredString(value, label).toLowerCase();
  if (!pattern.test(normalized)) throw new Error(`${label} has an invalid format`);
  return normalized;
}

function requireScenarioPass(scenario, label) {
  if (!scenario || typeof scenario !== 'object') throw new Error(`${label} is required`);
  const status = scenario.status;
  if (DISALLOWED_SCENARIO_STATUSES.has(status)) {
    throw new Error(`${label} must not be ${status}`);
  }
  if (status !== 'PASS') throw new Error(`${label} must be PASS`);
  requiredString(scenario.evidenceReference, `${label}.evidenceReference`);
}

export function validateW15JPreflight(dossier) {
  if (!dossier || typeof dossier !== 'object') throw new Error('dossier is required');
  if (dossier.authorityInvariant !== 'INTELLIGENCE != AUTHORITY != EXECUTION') {
    throw new Error('authorityInvariant must preserve the Aurora boundary');
  }

  const candidate = dossier.candidate;
  exactSha(candidate?.gitSha, 'candidate.gitSha', GIT_SHA);
  exactSha(candidate?.apkSha256, 'candidate.apkSha256', SHA256);
  requiredString(candidate?.apkVariant, 'candidate.apkVariant');
  requiredString(candidate?.applicationId, 'candidate.applicationId');
  requiredString(candidate?.versionCode, 'candidate.versionCode');
  requiredString(candidate?.versionName, 'candidate.versionName');

  const device = dossier.device;
  requiredString(device?.manufacturer, 'device.manufacturer');
  requiredString(device?.model, 'device.model');
  requiredString(device?.product, 'device.product');
  exactSha(device?.serialSha256, 'device.serialSha256', SHA256);
  requiredString(device?.buildFingerprint, 'device.buildFingerprint');
  if (device?.physicalDeviceVerified !== true) {
    throw new Error('device.physicalDeviceVerified must be true');
  }

  const gateway = dossier.gateway;
  requiredString(gateway?.identity, 'gateway.identity');
  requiredString(gateway?.version, 'gateway.version');
  requiredString(gateway?.environment, 'gateway.environment');
  if (gateway.environment !== 'LOCAL') throw new Error('gateway.environment must be LOCAL');

  const mappings = dossier.adbReverseMappings;
  if (!Array.isArray(mappings)) throw new Error('adbReverseMappings is required');
  for (const required of REQUIRED_REVERSE_MAPPINGS) {
    const mapping = mappings.find((entry) => entry?.port === required.port);
    if (!mapping || mapping.status !== 'PRESENT' || mapping.host !== 'tcp') {
      throw new Error(`ADB reverse mapping tcp:${required.port} is not PRESENT`);
    }
  }

  if (!Array.isArray(dossier.scenarios)) throw new Error('scenarios is required');
  const scenarios = new Map(dossier.scenarios.map((scenario) => [scenario?.id, scenario]));
  for (const scenario of dossier.scenarios) {
    if (scenario?.mandatory === true) {
      requireScenarioPass(scenario, `scenario ${scenario.id || '<unknown>'}`);
    }
  }
  for (const id of REQUIRED_THREAT_SCENARIOS) {
    requireScenarioPass(scenarios.get(id), `scenario ${id}`);
  }

  const riskGates = dossier.riskGates;
  for (const gate of ['A', 'B', 'C', 'D']) {
    requireScenarioPass(
      { ...riskGates?.[gate], evidenceReference: riskGates?.[gate]?.evidenceReference },
      `riskGate ${gate}`,
    );
  }

  return {
    candidateSha: candidate.gitSha.toLowerCase(),
    requiredScenarioCount: REQUIRED_THREAT_SCENARIOS.length,
    requiredReverseMappings: REQUIRED_REVERSE_MAPPINGS.map(({ port }) => port),
    readyForIndependentReview: true,
  };
}

export function loadAndValidateW15JPreflight(path) {
  return validateW15JPreflight(JSON.parse(readFileSync(path, 'utf8')));
}

if (process.argv[1] && process.argv[1].endsWith('w15j-preflight.mjs')) {
  const dossierPath = process.argv[2];
  if (!dossierPath) {
    console.error('Usage: node tools/acceptance/w15j-preflight.mjs <dossier.json>');
    process.exitCode = 2;
  } else {
    try {
      const result = loadAndValidateW15JPreflight(dossierPath);
      console.log(
        `W15J_PREFLIGHT_READY candidate=${result.candidateSha} scenarios=${result.requiredScenarioCount}`,
      );
    } catch (error) {
      console.error(`W15J_PREFLIGHT_BLOCKED: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
