import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const EXPERIENCE_SCENARIOS = Object.freeze(
  Array.from({ length: 8 }, (_, index) => `EX-${String(index + 1).padStart(2, '0')}`),
);
const RISK_GATES = ['A', 'B', 'C', 'D'];
const VALID_STATES = new Set(['NOT_RUN', 'BLOCKED', 'FAIL', 'PASS']);
const SHA256 = /^[0-9a-f]{64}$/i;
const SHA1 = /^[0-9a-f]{40}$/i;

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function referencesValid(references) {
  return Array.isArray(references) &&
    references.length > 0 &&
    references.every((reference) => typeof reference === 'string' && reference.trim().length > 0);
}

function observedAtValid(value) {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

export function emptyExperienceEvidence() {
  return {
    schemaVersion: '1.0.0',
    gate: 'W15J_EXPERIENCE',
    mainSha: null,
    candidate: {
      androidSha: null,
      hostSha: null,
      devlabSha: null,
      apkSha256: null,
      packagingRunId: null,
      artifactId: null,
    },
    device: { model: 'SM-X820', physicalDeviceVerified: false },
    environment: { transport: 'LOCAL_TABLET_LOOPBACK', hostInstanceId: null },
    voice: { attempts: [], understoodCommands: 0 },
    scenarios: Object.fromEntries(EXPERIENCE_SCENARIOS.map((id) => [id, { status: 'NOT_RUN' }])),
    riskGates: Object.fromEntries(RISK_GATES.map((id) => [id, { status: 'NOT_RUN' }])),
    blockers: [],
    review: { programControlDecision: 'PENDING' },
    dp5Certified: false,
    releaseAuthorized: false,
    authorizesExecution: false,
    retryAuthorized: false,
  };
}

/**
 * This validates structure and evidence references, not the truth of human observations.
 * It never grants canonical W15-J acceptance, W16 BUILD, DP5, execution or retry authority.
 */
export function validateExperienceEvidence(record, expected = {}) {
  requireCondition(record?.schemaVersion === '1.0.0', 'unsupported schemaVersion');
  requireCondition(record?.gate === 'W15J_EXPERIENCE', 'incorrect experience gate');

  for (const field of [
    'dp5Certified', 'releaseAuthorized', 'authorizesExecution', 'retryAuthorized',
  ]) {
    requireCondition(record[field] === false, `${field} must be explicitly false`);
  }

  requireCondition(SHA1.test(record.mainSha ?? ''), 'mainSha must be an exact commit SHA');
  for (const field of ['androidSha', 'hostSha', 'devlabSha']) {
    requireCondition(SHA1.test(record.candidate?.[field] ?? ''), `${field} must be an exact commit SHA`);
  }
  requireCondition(SHA256.test(record.candidate?.apkSha256 ?? ''), 'apkSha256 required');
  requireCondition(record.device?.model === 'SM-X820', 'representative SM-X820 required');
  requireCondition(record.device?.physicalDeviceVerified === true, 'physical device must be observed');
  requireCondition(
    record.environment?.transport === 'LOCAL_TABLET_LOOPBACK',
    'LOCAL_TABLET_LOOPBACK required',
  );
  requireCondition(
    typeof record.environment?.hostInstanceId === 'string' &&
      record.environment.hostInstanceId.length > 0,
    'current host instance binding required',
  );

  const bindings = {
    mainSha: record.mainSha,
    androidSha: record.candidate.androidSha,
    hostSha: record.candidate.hostSha,
    devlabSha: record.candidate.devlabSha,
    apkSha256: record.candidate.apkSha256,
  };
  for (const [field, value] of Object.entries(expected)) {
    requireCondition(Object.hasOwn(bindings, field), `unknown expected binding ${field}`);
    requireCondition(bindings[field] === value, `stale/mismatched ${field}`);
  }

  const scenarios = record.scenarios;
  requireCondition(scenarios && typeof scenarios === 'object', 'scenarios required');
  requireCondition(
    JSON.stringify(Object.keys(scenarios).sort()) === JSON.stringify([...EXPERIENCE_SCENARIOS].sort()),
    'exact EX-01..EX-08 scenario matrix required',
  );
  for (const id of EXPERIENCE_SCENARIOS) {
    const item = scenarios[id];
    requireCondition(VALID_STATES.has(item?.status), `${id} has invalid disposition`);
    if (item.status === 'PASS') {
      requireCondition(item.physicalObservation === true, `${id} lacks human physical observation`);
      requireCondition(typeof item.observedBy === 'string' && item.observedBy.length > 0, `${id} lacks operator`);
      requireCondition(observedAtValid(item.observedAtUtc), `${id} lacks UTC observation`);
      requireCondition(referencesValid(item.evidenceReferences), `${id} lacks evidence references`);
      requireCondition(item.automatedOnly !== true, `${id} may not auto-PASS`);
    }
  }

  if (scenarios['EX-03'].status === 'PASS') {
    requireCondition(
      Array.isArray(record.voice?.attempts) &&
        record.voice.attempts.length >= 5 && record.voice.attempts.length <= 10,
      'EX-03 PASS requires five to ten observed wake attempts',
    );
    requireCondition(
      Number.isInteger(record.voice?.understoodCommands) && record.voice.understoodCommands >= 1,
      'EX-03 PASS requires one understood command',
    );
  }

  requireCondition(Array.isArray(record.blockers), 'blockers array required');
  requireCondition(record.riskGates && typeof record.riskGates === 'object', 'riskGates required');
  requireCondition(
    JSON.stringify(Object.keys(record.riskGates).sort()) === JSON.stringify(RISK_GATES),
    'exact scoped Risk Gates A-D required',
  );
  for (const gate of RISK_GATES) {
    const item = record.riskGates[gate];
    requireCondition(VALID_STATES.has(item?.status), `Risk Gate ${gate} invalid`);
    if (item.status === 'PASS') {
      requireCondition(referencesValid(item.evidenceReferences), `Risk Gate ${gate} lacks evidence`);
    }
  }

  const allPhysicalPass = EXPERIENCE_SCENARIOS.every((id) => scenarios[id].status === 'PASS');
  const scopedRiskPass = RISK_GATES.every((id) => record.riskGates[id].status === 'PASS');
  const openCritical = record.blockers.some((blocker) =>
    blocker?.state !== 'CLOSED' && ['P0', 'P1'].includes(blocker?.severity),
  );
  const readyForReview = allPhysicalPass && scopedRiskPass && !openCritical;
  const reviewApproved = record.review?.programControlDecision === 'APPROVED' &&
    referencesValid(record.review?.evidenceReferences);

  return {
    state: readyForReview ? (reviewApproved ? 'EXPERIENCE_READY_NOT_ACCEPTED' : 'READY_FOR_REVIEW_NOT_ACCEPTED') : 'NOT_READY',
    passedScenarios: EXPERIENCE_SCENARIOS.filter((id) => scenarios[id].status === 'PASS').length,
    requiredScenarios: EXPERIENCE_SCENARIOS.length,
    readyForReview,
    experienceReady: readyForReview && reviewApproved,
    dp5Certified: false,
    w15jAccepted: false,
    w16BuildUnblocked: false,
    releaseAuthorized: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--template') {
    process.stdout.write(`${JSON.stringify(emptyExperienceEvidence(), null, 2)}\n`);
  } else {
    try {
      requireCondition(process.argv.length === 3, 'Usage: node w15j-experience-gate.mjs <evidence.json>');
      const result = validateExperienceEvidence(JSON.parse(readFileSync(process.argv[2], 'utf8')));
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (!result.experienceReady) process.exitCode = 2;
    } catch (error) {
      process.stderr.write(`W15-J Experience Gate BLOCKED: ${error.message}\n`);
      process.exitCode = 2;
    }
  }
}
