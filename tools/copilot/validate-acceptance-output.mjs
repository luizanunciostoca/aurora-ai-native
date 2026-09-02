import fs from 'node:fs/promises';

const [outputPath, expectedHead, expectedMain] = process.argv.slice(2);

function fail(message) {
  throw new Error(message);
}

if (!outputPath) fail('output path is required');
if (!/^[0-9a-f]{40}$/i.test(expectedHead || '')) fail('valid expected HEAD SHA is required');
if (!/^[0-9a-f]{40}$/i.test(expectedMain || '')) fail('valid expected main SHA is required');

const text = await fs.readFile(outputPath, 'utf8');
const lines = text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
const marker = [...lines]
  .reverse()
  .find((line) => line.startsWith('AURORA_ACCEPTANCE_RESULT='));
if (!marker) fail('missing AURORA_ACCEPTANCE_RESULT marker');

let result;
try {
  result = JSON.parse(marker.slice('AURORA_ACCEPTANCE_RESULT='.length));
} catch {
  fail('AURORA_ACCEPTANCE_RESULT is not valid JSON');
}

if (!result || typeof result !== 'object' || Array.isArray(result)) {
  fail('result must be an object');
}
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
if (!Array.isArray(result.blockers) || result.blockers.some((item) => typeof item !== 'string')) {
  fail('blockers must be a string array');
}
if (typeof result.summary !== 'string' || result.summary.trim().length === 0) {
  fail('non-empty summary is required');
}

if (result.decision === 'ACCEPT_RECOMMENDED') {
  if (result.blockers.length !== 0) fail('ACCEPT_RECOMMENDED cannot contain blockers');
  for (const gate of ['A', 'B', 'C', 'D']) {
    if (result.riskGates[gate] !== 'PASS') {
      fail('ACCEPT_RECOMMENDED requires all Risk Gates PASS');
    }
  }
}

const normalized = {
  decision: result.decision,
  exactHead: result.exactHead,
  main: result.main,
  riskGates: {
    A: result.riskGates.A,
    B: result.riskGates.B,
    C: result.riskGates.C,
    D: result.riskGates.D,
  },
  blockers: result.blockers,
  summary: result.summary.trim(),
};

process.stdout.write(`${JSON.stringify(normalized)}\n`);
