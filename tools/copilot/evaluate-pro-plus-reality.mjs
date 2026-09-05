import fs from 'node:fs';
import path from 'node:path';

const directory = process.argv[2];
const required = Number(process.argv[3] || 4);
if (!directory || !Number.isInteger(required) || required < 2) {
  throw new Error('usage: node evaluate-pro-plus-reality.mjs <probe-dir> <required-concurrency>');
}

const files = fs
  .readdirSync(directory)
  .filter((name) => name.endsWith('.json'))
  .sort();
const probes = files.map((name) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')));
if (probes.length < required)
  throw new Error(`expected at least ${required} probe records, got ${probes.length}`);

for (const probe of probes) {
  if (
    probe.schema !== 'aurora.pro_plus.runtime_probe.v1' ||
    probe.ok !== true ||
    probe.exitCode !== 0 ||
    !Number.isFinite(probe.startedAtMs) ||
    !Number.isFinite(probe.finishedAtMs) ||
    probe.finishedAtMs < probe.startedAtMs ||
    probe.noTool !== true
  ) {
    throw new Error(`invalid or failed probe slot ${probe.slot ?? 'unknown'}`);
  }
}

const events = probes
  .flatMap((probe) => [
    { at: probe.startedAtMs, delta: 1 },
    { at: probe.finishedAtMs, delta: -1 },
  ])
  .sort((left, right) => left.at - right.at || right.delta - left.delta);
let active = 0;
let peak = 0;
for (const event of events) {
  active += event.delta;
  peak = Math.max(peak, active);
}
if (peak < required) throw new Error(`measured concurrency ${peak} is below required ${required}`);

const observedAtMs = Math.max(...probes.map((probe) => probe.finishedAtMs));
const maxAgeMinutes = Number(process.env.AURORA_ATTESTATION_MAX_AGE_MINUTES || 1440);
const result = {
  schema: 'aurora.pro_plus.runtime_attestation.v1',
  state: 'VERIFIED',
  executionMode: 'PRO_PLUS_ACTIONS_FABRIC',
  candidateSha: process.env.AURORA_CANDIDATE_SHA || null,
  workflowRunId: Number(process.env.GITHUB_RUN_ID || 0),
  observedAt: new Date(observedAtMs).toISOString(),
  expiresAt: new Date(observedAtMs + maxAgeMinutes * 60_000).toISOString(),
  probeConcurrency: probes.length,
  observedConcurrentSessions: peak,
  successfulCopilotSessions: probes.length,
  failedCopilotSessions: 0,
  allSessionsNoTool: true,
  repositorySideEffects: 0,
  providerSideEffects: 0,
  authority: false,
};
console.log(JSON.stringify(result, null, 2));
