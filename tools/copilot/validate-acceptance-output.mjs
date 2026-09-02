import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';

const [
  outputPath,
  expectedHead,
  expectedMain,
  expectedPrNumberRaw,
  expectedRepository,
  requiredChecksPath,
] = process.argv.slice(2);

function fail(message) {
  throw new Error(message);
}

if (!outputPath) fail('output path is required');
if (!requiredChecksPath) fail('required checks path is required');
if (!/^[0-9a-f]{40}$/i.test(expectedHead || '')) fail('valid expected HEAD SHA is required');
if (!/^[0-9a-f]{40}$/i.test(expectedMain || '')) fail('valid expected main SHA is required');
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(expectedRepository || '')) {
  fail('valid expected repository is required');
}
const expectedPrNumber = Number(expectedPrNumberRaw);
if (!Number.isSafeInteger(expectedPrNumber) || expectedPrNumber <= 0) {
  fail('valid expected PR number is required');
}

const text = await fs.readFile(outputPath, 'utf8');
if (Buffer.byteLength(text, 'utf8') > 2_000_000) fail('acceptance output exceeds size limit');
const lines = text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
const markers = lines.filter((line) => line.startsWith('AURORA_ACCEPTANCE_RESULT='));
if (markers.length !== 1) fail('exactly one AURORA_ACCEPTANCE_RESULT marker is required');
const marker = markers[0];

let result;
try {
  result = JSON.parse(marker.slice('AURORA_ACCEPTANCE_RESULT='.length));
} catch {
  fail('AURORA_ACCEPTANCE_RESULT is not valid JSON');
}

if (!result || typeof result !== 'object' || Array.isArray(result)) {
  fail('result must be an object');
}
if (result.repository !== expectedRepository) fail('acceptance output repository mismatch');
if (result.prNumber !== expectedPrNumber) fail('acceptance output PR number mismatch');
if (!['ACCEPT_RECOMMENDED', 'REWORK_REQUIRED'].includes(result.decision)) {
  fail('invalid acceptance decision');
}
if (result.exactHead !== expectedHead) fail('acceptance output exact HEAD mismatch');
if (result.main !== expectedMain) fail('acceptance output main mismatch');
if (!result.riskGates || typeof result.riskGates !== 'object' || Array.isArray(result.riskGates)) {
  fail('riskGates object is required');
}
for (const gate of ['A', 'B', 'C', 'D']) {
  if (!['PASS', 'FAIL'].includes(result.riskGates[gate])) fail(`invalid Risk Gate ${gate}`);
}
if (
  !Array.isArray(result.blockers) ||
  result.blockers.length > 100 ||
  result.blockers.some(
    (item) => typeof item !== 'string' || item.trim().length === 0 || item.length > 1_000,
  )
) {
  fail('blockers must be at most 100 non-empty strings of at most 1000 characters');
}
if (
  typeof result.summary !== 'string' ||
  result.summary.trim().length === 0 ||
  result.summary.length > 8_000
) {
  fail('summary must be non-empty and at most 8000 characters');
}

if (result.decision === 'ACCEPT_RECOMMENDED') {
  if (result.blockers.length !== 0) fail('ACCEPT_RECOMMENDED cannot contain blockers');
  for (const gate of ['A', 'B', 'C', 'D']) {
    if (result.riskGates[gate] !== 'PASS') {
      fail('ACCEPT_RECOMMENDED requires all Risk Gates PASS');
    }
  }
} else if (
  result.blockers.length === 0 &&
  ['A', 'B', 'C', 'D'].every((gate) => result.riskGates[gate] === 'PASS')
) {
  fail('REWORK_REQUIRED requires a blocker or failed Risk Gate');
}

let checkEvidence;
try {
  checkEvidence = JSON.parse(await fs.readFile(requiredChecksPath, 'utf8'));
} catch {
  fail('required check evidence is not valid JSON');
}
if (
  !checkEvidence ||
  typeof checkEvidence !== 'object' ||
  Array.isArray(checkEvidence) ||
  checkEvidence.schemaVersion !== 'aurora.required-checks.v1' ||
  checkEvidence.exactHead !== expectedHead ||
  !Array.isArray(checkEvidence.requiredChecks)
) {
  fail('required check evidence envelope is invalid');
}
const requiredNames = ['quality', 'security-gate', 'test-build'];
if (checkEvidence.requiredChecks.length !== requiredNames.length) {
  fail('required check evidence must contain exactly the baseline gates');
}
for (const name of requiredNames) {
  const matches = checkEvidence.requiredChecks.filter((check) => check?.name === name);
  if (matches.length !== 1) fail(`required check ${name} must appear exactly once`);
  const [check] = matches;
  if (
    check.headSha !== expectedHead ||
    check.app !== 'github-actions' ||
    check.status !== 'completed' ||
    check.conclusion !== 'success' ||
    typeof check.detailsUrl !== 'string' ||
    !check.detailsUrl.startsWith(`https://github.com/${expectedRepository}/actions/runs/`)
  ) {
    fail(`required check ${name} is not exact-head successful GitHub Actions evidence`);
  }
}

const normalized = {
  schemaVersion: 'aurora.acceptance.v1',
  repository: expectedRepository,
  prNumber: expectedPrNumber,
  decision: result.decision,
  exactHead: result.exactHead,
  main: result.main,
  riskGates: {
    A: result.riskGates.A,
    B: result.riskGates.B,
    C: result.riskGates.C,
    D: result.riskGates.D,
  },
  requiredChecks: checkEvidence.requiredChecks
    .map((check) => ({
      name: check.name,
      headSha: check.headSha,
      app: check.app,
      status: check.status,
      conclusion: check.conclusion,
      detailsUrl: check.detailsUrl,
      completedAt: typeof check.completedAt === 'string' ? check.completedAt : null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name)),
  blockers: result.blockers.map((item) => item.trim()),
  summary: result.summary.trim(),
};

process.stdout.write(`${JSON.stringify(normalized)}\n`);
