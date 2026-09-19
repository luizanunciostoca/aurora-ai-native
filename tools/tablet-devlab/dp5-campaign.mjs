#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DP5_SCENARIOS, DP5_SCENARIO_BY_ID } from './dp5-scenario-catalog.mjs';

const PACKAGE_ID = process.env.AURORA_PACKAGE_ID || 'ai.aurora.device.local';
const ADB = process.env.ADB_BIN || 'adb';
const DEFAULT_EVIDENCE_DIR =
  process.env.AURORA_EVIDENCE_DIR ||
  join(process.env.HOME || '.', 'aurora-devlab/evidence/w15j-dp5');
const DEFAULT_CONTROL_TOWER =
  process.env.AURORA_CONTROL_TOWER_TUPLE ||
  join(process.env.HOME || '.', 'aurora-devlab/evidence/control-tower-tuple.json');
const FINAL = new Set(['PASS', 'FAIL', 'BLOCKED']);

function fail(message) {
  throw new Error(message);
}

function now() {
  return new Date().toISOString();
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
}

function secureWrite(path, content) {
  ensureDir(dirname(path));
  writeFileSync(path, content);
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort on filesystems that do not expose POSIX mode bits.
  }
}

function readJson(path, label = path) {
  if (!existsSync(path)) fail(label + ' is required: ' + path);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(label + ' is invalid JSON: ' + error.message);
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function redact(value) {
  return String(value)
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/gu, '[REDACTED_PEM]')
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gu,
      '[REDACTED_JWT]',
    )
    .replace(
      /\b(?:gbr|session|sess|credential|secret|token)_[A-Za-z0-9._-]{12,}\b/giu,
      '[REDACTED_SECRET_REF]',
    )
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/giu, '$1[REDACTED]')
    .replace(
      /((?:password|secret|credential|access[_-]?token)\s*[=:]\s*)[^\s]+/giu,
      '$1[REDACTED]',
    );
}

function commandAvailable(command) {
  return (
    (spawnSync('sh', ['-lc', 'command -v ' + command], { encoding: 'utf8' }).status ?? 1) === 0
  );
}

function capture(path, command, args, filter) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 8_000_000,
  });
  let output = String(result.stdout || '');
  if (result.stderr) output += '\n[stderr]\n' + result.stderr;
  if (filter) output = filter(output);
  output = redact(output);
  if (Buffer.byteLength(output) > 2_000_000) output = output.slice(-2_000_000);
  secureWrite(path, output);
  secureWrite(path + '.exit-code', String(result.status ?? 127) + '\n');
  return result.status ?? 127;
}

function screenshot(path, serial) {
  const result = spawnSync(ADB, ['-s', serial, 'exec-out', 'screencap', '-p'], {
    encoding: null,
    maxBuffer: 20_000_000,
  });
  writeFileSync(path, result.stdout || Buffer.alloc(0));
  secureWrite(path + '.exit-code', String(result.status ?? 127) + '\n');
  return result.status ?? 127;
}

function physicalSerial() {
  const result = spawnSync(ADB, ['devices'], { encoding: 'utf8' });
  if ((result.status ?? 1) !== 0) fail('adb devices failed');
  const devices = result.stdout
    .split(/\r?\n/u)
    .slice(1)
    .map((line) => line.trim().split(/\s+/u))
    .filter((parts) => parts[1] === 'device')
    .map((parts) => parts[0]);
  if (devices.length !== 1) fail('exactly one authorized self-ADB physical device is required');
  const serial = devices[0];
  const qemu = spawnSync(ADB, ['-s', serial, 'shell', 'getprop', 'ro.kernel.qemu'], {
    encoding: 'utf8',
  }).stdout.trim();
  if (qemu === '1' || serial.startsWith('emulator-')) fail('emulator is not valid DP5 evidence');
  return serial;
}

function logFilter(text, correlationId) {
  const needles = [
    PACKAGE_ID,
    correlationId,
    'Aurora',
    'AURORA',
    'W15',
    'W14',
    'W07',
    'wake',
    'Wake',
    'STT',
    'TTS',
    'receipt',
    'Receipt',
    'reconcil',
    'command',
    'session',
    'gateway',
    'lifecycle',
    'FATAL EXCEPTION',
    'ANR',
  ].filter(Boolean);
  return (
    String(text)
      .split(/\r?\n/u)
      .filter((line) => needles.some((needle) => line.includes(needle)))
      .slice(-5000)
      .join('\n') + '\n'
  );
}

function snapshot(attemptDir, phase, scenario, correlationId) {
  const serial = physicalSerial();
  const dir = join(attemptDir, phase);
  ensureDir(dir);
  const captures = [];
  const shell = (name, command) => {
    const path = join(dir, name);
    const exitCode = capture(path, ADB, ['-s', serial, 'shell', 'sh', '-c', command]);
    captures.push({ reference: relative(attemptDir, path).replaceAll('\\', '/'), exitCode });
  };

  shell(
    'device-state.txt',
    [
      'echo manufacturer=$(getprop ro.product.manufacturer)',
      'echo model=$(getprop ro.product.model)',
      'echo product=$(getprop ro.build.product)',
      'echo sdk=$(getprop ro.build.version.sdk)',
      'echo fingerprint=$(getprop ro.build.fingerprint)',
      'echo uptime=$(cat /proc/uptime 2>/dev/null || true)',
    ].join('; '),
  );
  shell('package-state.txt', 'dumpsys package ' + PACKAGE_ID + ' 2>&1 | head -n 1200');
  shell(
    'process-state.txt',
    'echo pid=$(pidof ' +
      PACKAGE_ID +
      ' 2>/dev/null || true); dumpsys activity processes ' +
      PACKAGE_ID +
      ' 2>&1 | head -n 800',
  );
  shell('service-state.txt', 'dumpsys activity services ' + PACKAGE_ID + ' 2>&1 | head -n 1200');
  shell(
    'activity-state.txt',
    "dumpsys activity activities 2>&1 | grep -i -E '" +
      PACKAGE_ID +
      "|mResumedActivity|topResumedActivity' | tail -n 300",
  );
  shell(
    'permission-appops.txt',
    'cmd appops get ' +
      PACKAGE_ID +
      ' RECORD_AUDIO 2>&1; dumpsys package ' +
      PACKAGE_ID +
      " 2>&1 | grep -A2 -B2 -E 'RECORD_AUDIO|granted=true|granted=false' | head -n 300",
  );
  shell('memory.txt', 'dumpsys meminfo ' + PACKAGE_ID + ' 2>&1 | head -n 500');
  shell('cpu.txt', "dumpsys cpuinfo 2>&1 | grep -i -E '" + PACKAGE_ID + "|TOTAL' | tail -n 120");
  shell('battery.txt', 'dumpsys battery 2>&1');
  shell('thermal.txt', 'dumpsys thermalservice 2>&1 | head -n 500');
  shell(
    'network.txt',
    "dumpsys connectivity 2>&1 | grep -i -E 'NetworkAgent|NetworkRequest|WIFI|TRANSPORT|validated|internet' | tail -n 500",
  );

  const logPath = join(dir, 'logcat.txt');
  captures.push({
    reference: relative(attemptDir, logPath).replaceAll('\\', '/'),
    exitCode: capture(logPath, ADB, ['-s', serial, 'logcat', '-d', '-v', 'threadtime'], (text) =>
      logFilter(text, correlationId),
    ),
  });

  if (commandAvailable('curl')) {
    for (const port of [8080, 8081]) {
      const path = join(dir, 'host-instance-' + port + '.json');
      captures.push({
        reference: relative(attemptDir, path).replaceAll('\\', '/'),
        exitCode: capture(path, 'curl', [
          '--silent',
          '--show-error',
          '--max-time',
          '3',
          'http://127.0.0.1:' + port + '/v1/local-host/instance',
        ]),
      });
    }
  }
  if (commandAvailable('ss')) {
    const path = join(dir, 'listeners.txt');
    captures.push({
      reference: relative(attemptDir, path).replaceAll('\\', '/'),
      exitCode: capture(path, 'ss', ['-ltnp']),
    });
  }
  if (scenario.screenshotEvidence !== 'OPTIONAL') {
    const path = join(dir, 'screen.png');
    captures.push({
      reference: relative(attemptDir, path).replaceAll('\\', '/'),
      exitCode: screenshot(path, serial),
    });
  }

  const record = {
    schemaVersion: 'dp5-snapshot-v1',
    phase,
    scenarioId: scenario.id,
    scenarioPath: scenario.path,
    correlationId,
    observedAtUtc: now(),
    monotonicNs: process.hrtime.bigint().toString(),
    deviceSerialSha256: sha256(serial),
    captures,
    captureFailures: captures.filter((entry) => entry.exitCode !== 0),
    authorizesExecution: false,
    retryAuthorized: false,
    physicalAcceptance: false,
  };
  secureWrite(join(dir, 'snapshot.json'), JSON.stringify(record, null, 2) + '\n');
  return record;
}

function paths(evidenceDir) {
  const harness = join(evidenceDir, 'harness');
  return {
    evidenceDir,
    harness,
    dossier: join(evidenceDir, 'w15j-evidence.json'),
    state: join(harness, 'dp5-campaign.json'),
    report: join(harness, 'DP5_FINAL_PHYSICAL_ACCEPTANCE_DOSSIER.md'),
    summary: join(harness, 'dp5-campaign-summary.json'),
  };
}

function dossierScenario(dossier, scenarioPath) {
  const [group, key] = scenarioPath.split('.');
  const record = dossier.scenarios?.[group]?.[key];
  if (!record) fail('canonical dossier scenario missing: ' + scenarioPath);
  return record;
}

function validatePreparedDossier(dossier) {
  if (dossier.schemaVersion !== '1.2.0' || dossier.wave !== 'W15-J') {
    fail('prepared canonical W15-J dossier schemaVersion 1.2.0 is required');
  }
  if (!/^[0-9a-f]{40}$/u.test(String(dossier.candidateSha || ''))) fail('invalid candidate SHA');
  if (!/^[0-9a-f]{64}$/u.test(String(dossier.apk?.sha256 || ''))) fail('invalid APK SHA-256');
  if (dossier.device?.physicalDeviceVerified !== true)
    fail('verified physical device binding required');
  for (const scenario of DP5_SCENARIOS) dossierScenario(dossier, scenario.path);
}

export function createCampaign({ dossier, controlTower, operator }) {
  validatePreparedDossier(dossier);
  if (!controlTower || typeof controlTower !== 'object') fail('Control Tower tuple is required');
  if (!operator || !String(operator).trim()) fail('operator is required');
  const timestamp = now();
  return {
    schemaVersion: 'dp5-physical-campaign-v1',
    campaignId: 'dp5-' + randomUUID(),
    status: 'IN_PROGRESS',
    createdAtUtc: timestamp,
    updatedAtUtc: timestamp,
    operator: String(operator),
    authorityInvariant: 'INTELLIGENCE != AUTHORITY != EXECUTION',
    tuple: {
      candidateSha: dossier.candidateSha,
      apk: dossier.apk,
      device: dossier.device,
      environment: dossier.environment,
      provenance: dossier.provenance,
      controlTowerSchemaVersion: controlTower.schemaVersion || null,
      controlTowerSha256: sha256(JSON.stringify(controlTower)),
    },
    scenarios: DP5_SCENARIOS.map((scenario) => ({
      ...scenario,
      status: 'NOT_RUN',
      attempts: [],
      observedAtUtc: null,
      failureCause: null,
      evidenceReferences: [],
    })),
    findings: [],
    waivers: [],
    regressions: [],
    conclusion: 'PHYSICAL_CAMPAIGN_INCOMPLETE',
    physicalAcceptance: false,
    w15jAccepted: false,
    w16BuildUnblocked: false,
  };
}

function loadCampaign(path) {
  const campaign = readJson(path, 'DP5 campaign');
  if (campaign.schemaVersion !== 'dp5-physical-campaign-v1') fail('unsupported campaign schema');
  if (!Array.isArray(campaign.scenarios) || campaign.scenarios.length !== 48) {
    fail('campaign must contain exactly 48 scenarios');
  }
  return campaign;
}

function saveCampaign(path, campaign) {
  campaign.updatedAtUtc = now();
  secureWrite(path, JSON.stringify(campaign, null, 2) + '\n');
}

function scenario(campaign, id) {
  const record = campaign.scenarios.find((entry) => entry.id === id);
  if (!record || !DP5_SCENARIO_BY_ID[id]) fail('unknown DP5 scenario id: ' + id);
  return record;
}

function filesRecursive(directory, base = directory) {
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...filesRecursive(path, base));
    else if (entry.isFile())
      out.push({ path, relative: relative(base, path).replaceAll('\\', '/') });
  }
  return out;
}

function manifest(attemptDir) {
  const output = join(attemptDir, 'scenario-manifest.sha256');
  const lines = filesRecursive(attemptDir)
    .filter((entry) => entry.path !== output)
    .sort((a, b) => a.relative.localeCompare(b.relative))
    .map((entry) => sha256File(entry.path) + '  ' + entry.relative);
  secureWrite(output, lines.join('\n') + '\n');
  return output;
}

function instructions(record) {
  return [
    record.id + ' — ' + record.name,
    'Path: ' + record.path,
    '',
    'Preconditions:',
    ...record.preconditions.map((value) => '- ' + value),
    '',
    'Setup:',
    ...record.setup.map((value) => '- ' + value),
    '',
    'System/test action:',
    ...record.actions.map((value) => '- ' + value),
    '',
    'Human physical action:',
    ...record.manualActions.map((value) => '- ' + value),
    '',
    'Expected result: ' + record.expectedResult,
    'Expected signals:',
    ...record.expectedSignals.map((value) => '- ' + value),
    'Forbidden signals:',
    ...record.forbiddenSignals.map((value) => '- ' + value),
    '',
    'Timeout: ' + record.timeoutMs + ' ms',
    'Screenshot: ' + record.screenshotEvidence,
    'VERDICT RULE: telemetry never decides PASS; finish explicitly as PASS, FAIL, or BLOCKED.',
  ].join('\n');
}

export function applyOperatorVerdict({
  scenario: record,
  status,
  failureCause,
  evidenceReferences,
  observedAtUtc,
  operatorObserved,
}) {
  if (!FINAL.has(status)) fail('status must be PASS, FAIL, or BLOCKED');
  if (status === 'PASS' && operatorObserved !== true) {
    fail('PASS requires explicit --observed physical operator attestation');
  }
  if ((status === 'FAIL' || status === 'BLOCKED') && !String(failureCause || '').trim()) {
    fail(status + ' requires --cause');
  }
  if (!Array.isArray(evidenceReferences) || evidenceReferences.length === 0) {
    fail('concrete evidence references are required');
  }
  return {
    ...record,
    status,
    observedAtUtc,
    failureCause: status === 'PASS' ? null : String(failureCause).trim(),
    evidenceReferences: [...new Set(evidenceReferences)],
  };
}

function initialize(evidenceDir, controlTowerPath, operator) {
  const p = paths(evidenceDir);
  ensureDir(p.harness);
  if (existsSync(p.state)) fail('refusing to overwrite existing campaign');
  if (!existsSync(controlTowerPath)) fail('Control Tower tuple is required: ' + controlTowerPath);
  const dossier = readJson(p.dossier, 'prepared w15j-evidence.json');
  const controlTower = readJson(controlTowerPath, 'Control Tower tuple');
  const campaign = createCampaign({ dossier, controlTower, operator });
  saveCampaign(p.state, campaign);
  generateReport(evidenceDir, campaign, dossier);
  return p;
}

function start(evidenceDir, id, requestedCorrelationId) {
  const p = paths(evidenceDir);
  const campaign = loadCampaign(p.state);
  const record = scenario(campaign, id);
  if (record.attempts.some((entry) => entry.status === 'STARTED'))
    fail(id + ' already has an active attempt');
  const attemptNumber = record.attempts.length + 1;
  const attemptDir = join(p.harness, id, 'attempt-' + String(attemptNumber).padStart(2, '0'));
  ensureDir(attemptDir);
  const correlationId = requestedCorrelationId || 'dp5-' + id.toLowerCase() + '-' + randomUUID();
  const startedAtUtc = now();
  const startedMonotonicNs = process.hrtime.bigint().toString();
  const before = snapshot(attemptDir, 'before', DP5_SCENARIO_BY_ID[id], correlationId);
  record.attempts.push({
    attempt: attemptNumber,
    status: 'STARTED',
    correlationId,
    startedAtUtc,
    startedMonotonicNs,
    finishedAtUtc: null,
    elapsedMs: null,
    operatorVerdict: null,
    failureCause: null,
    before,
  });
  secureWrite(
    join(attemptDir, 'operator-instructions.txt'),
    instructions(DP5_SCENARIO_BY_ID[id]) + '\n',
  );
  manifest(attemptDir);
  saveCampaign(p.state, campaign);
  return { record, attemptDir };
}

function finish(evidenceDir, id, status, cause, observed) {
  const p = paths(evidenceDir);
  const campaign = loadCampaign(p.state);
  const record = scenario(campaign, id);
  const attempt = [...record.attempts].reverse().find((entry) => entry.status === 'STARTED');
  if (!attempt) fail(id + ' has no active attempt');
  const attemptDir = join(p.harness, id, 'attempt-' + String(attempt.attempt).padStart(2, '0'));
  const after = snapshot(attemptDir, 'after', DP5_SCENARIO_BY_ID[id], attempt.correlationId);
  const finishedAtUtc = now();
  const finishedNs = process.hrtime.bigint();
  const elapsedMs = Number(finishedNs - BigInt(attempt.startedMonotonicNs)) / 1_000_000;
  const receiptPath = join(attemptDir, 'scenario-receipt.json');
  const refs = filesRecursive(attemptDir).map((entry) =>
    relative(evidenceDir, entry.path).replaceAll('\\', '/'),
  );
  refs.push(relative(evidenceDir, receiptPath).replaceAll('\\', '/'));
  const updated = applyOperatorVerdict({
    scenario: record,
    status,
    failureCause: cause,
    evidenceReferences: refs,
    observedAtUtc: finishedAtUtc,
    operatorObserved: observed,
  });
  Object.assign(record, updated);
  attempt.status = 'FINISHED';
  attempt.finishedAtUtc = finishedAtUtc;
  attempt.finishedMonotonicNs = finishedNs.toString();
  attempt.elapsedMs = Math.round(elapsedMs * 1000) / 1000;
  attempt.operatorVerdict = status;
  attempt.operatorObservedPhysicalResult = observed;
  attempt.failureCause = record.failureCause;
  attempt.after = after;

  secureWrite(
    receiptPath,
    JSON.stringify(
      {
        schemaVersion: 'dp5-scenario-receipt-v1',
        campaignId: campaign.campaignId,
        scenarioId: id,
        scenarioPath: record.path,
        attempt: attempt.attempt,
        correlationId: attempt.correlationId,
        startedAtUtc: attempt.startedAtUtc,
        finishedAtUtc,
        startedMonotonicNs: attempt.startedMonotonicNs,
        finishedMonotonicNs: attempt.finishedMonotonicNs,
        elapsedMs: attempt.elapsedMs,
        operatorVerdict: status,
        operatorObservedPhysicalResult: observed,
        failureCause: record.failureCause,
        verdictSource: 'EXPLICIT_OPERATOR_INPUT',
        automationDisposition: 'EVIDENCE_CAPTURE_ONLY_NOT_VERDICT',
        candidateSha: campaign.tuple.candidateSha,
        apkSha256: campaign.tuple.apk.sha256,
        deviceSerialSha256: campaign.tuple.device.serialSha256,
        authorizesExecution: false,
        provesExecutionSuccessByItself: false,
        retryAuthorized: false,
        physicalAcceptance: false,
      },
      null,
      2,
    ) + '\n',
  );
  const manifestPath = manifest(attemptDir);
  const manifestRef = relative(evidenceDir, manifestPath).replaceAll('\\', '/');
  if (!record.evidenceReferences.includes(manifestRef)) record.evidenceReferences.push(manifestRef);

  const dossier = readJson(p.dossier, 'prepared w15j-evidence.json');
  const dossierRecord = dossierScenario(dossier, record.path);
  dossierRecord.status = status;
  dossierRecord.observedAtUtc = finishedAtUtc;
  dossierRecord.evidenceReferences = [...record.evidenceReferences];
  secureWrite(p.dossier, JSON.stringify(dossier, null, 2) + '\n');

  campaign.conclusion = campaign.scenarios.every((entry) => entry.status === 'PASS')
    ? 'READY_FOR_INDEPENDENT_REVIEW_NOT_ACCEPTED'
    : 'PHYSICAL_CAMPAIGN_INCOMPLETE';
  saveCampaign(p.state, campaign);
  generateReport(evidenceDir, campaign, dossier);
  return { receiptPath, manifestPath };
}

function counts(campaign) {
  const value = { PASS: 0, FAIL: 0, BLOCKED: 0, NOT_RUN: 0 };
  for (const record of campaign.scenarios) value[record.status] += 1;
  return value;
}

export function renderReport(campaign, dossier) {
  const c = counts(campaign);
  const allPass = c.PASS === 48;
  const conclusion = allPass
    ? 'READY_FOR_INDEPENDENT_REVIEW_NOT_ACCEPTED'
    : 'PHYSICAL_CAMPAIGN_INCOMPLETE';
  const matrix = campaign.scenarios
    .map(
      (record) =>
        '| ' +
        record.id +
        ' | ' +
        record.path +
        ' | ' +
        record.status +
        ' | ' +
        (record.observedAtUtc || '—') +
        ' | ' +
        (record.failureCause || '—') +
        ' | ' +
        record.evidenceReferences.length +
        ' |',
    )
    .join('\n');
  const gates = Object.entries(dossier.riskGates || {})
    .map(([key, value]) => '- ' + key + ': ' + (value.status || 'UNKNOWN'))
    .join('\n');
  const notes = (title, values) =>
    '\n## ' +
    title +
    '\n' +
    (values.length
      ? values
          .map(
            (value) =>
              '- ' +
              value.id +
              ': ' +
              value.text +
              (value.reference ? ' — ' + value.reference : ''),
          )
          .join('\n')
      : '- None recorded.') +
    '\n';

  return (
    '# DP5 FINAL PHYSICAL ACCEPTANCE DOSSIER — CAMPAIGN VIEW\n\n' +
    'Status: **' +
    conclusion +
    '**\n\n' +
    'This generated view is evidence automation only. It does not accept DP5, W15-J, or unblock W16. Scenario PASS values come only from explicit operator input.\n\n' +
    '## Exact tuple\n' +
    '- Candidate SHA: ' +
    campaign.tuple.candidateSha +
    '\n' +
    '- APK: ' +
    campaign.tuple.apk.applicationId +
    ' ' +
    campaign.tuple.apk.versionName +
    ' (' +
    campaign.tuple.apk.versionCode +
    ')\n' +
    '- APK SHA-256: ' +
    campaign.tuple.apk.sha256 +
    '\n' +
    '- Device: ' +
    campaign.tuple.device.manufacturer +
    ' ' +
    campaign.tuple.device.model +
    '\n' +
    '- Device serial SHA-256: ' +
    campaign.tuple.device.serialSha256 +
    '\n' +
    '- Operator: ' +
    campaign.operator +
    '\n' +
    '- Campaign: ' +
    campaign.campaignId +
    '\n\n' +
    '## Matrix summary\n' +
    '- PASS: ' +
    c.PASS +
    '/48\n- FAIL: ' +
    c.FAIL +
    '/48\n- BLOCKED: ' +
    c.BLOCKED +
    '/48\n- NOT RUN: ' +
    c.NOT_RUN +
    '/48\n\n' +
    '| ID | Canonical scenario | Result | Observed UTC | Failure/blocker cause | Evidence refs |\n' +
    '|---|---|---|---|---|---:|\n' +
    matrix +
    '\n\n## Risk Gates A-D\n' +
    (gates || '- Not available.') +
    '\n' +
    notes('Findings', campaign.findings) +
    notes('Waivers', campaign.waivers) +
    notes('Regressions', campaign.regressions) +
    '\n## Technical conclusion\n' +
    (allPass
      ? 'All 48 records contain explicit operator PASS dispositions, but final acceptance still requires canonical collector finalization, wake/resource/threat evidence, sealed provenance, operator attestation, independent reviewer, seven-role semantic binding, dossier doctor, and integrated Risk Gates A-D review.'
      : 'The physical campaign is incomplete or contains FAIL/BLOCKED scenarios. DP5 remains NOT_ACCEPTED.') +
    '\n\nAuthority flags: authorizes_execution=false; retry_authorized=false; physical_acceptance=false; w16_build_unblocked=false.\n'
  );
}

function generateReport(evidenceDir, campaign, dossier) {
  const p = paths(evidenceDir);
  const c = counts(campaign);
  secureWrite(p.report, renderReport(campaign, dossier));
  secureWrite(
    p.summary,
    JSON.stringify(
      {
        schemaVersion: 'dp5-campaign-summary-v1',
        campaignId: campaign.campaignId,
        generatedAtUtc: now(),
        candidateSha: campaign.tuple.candidateSha,
        apkSha256: campaign.tuple.apk.sha256,
        counts: c,
        matrixComplete: c.PASS === 48,
        conclusion:
          c.PASS === 48
            ? 'READY_FOR_INDEPENDENT_REVIEW_NOT_ACCEPTED'
            : 'PHYSICAL_CAMPAIGN_INCOMPLETE',
        findings: campaign.findings,
        waivers: campaign.waivers,
        regressions: campaign.regressions,
        riskGates: dossier.riskGates || {},
        physicalAcceptance: false,
        w15jAccepted: false,
        w16BuildUnblocked: false,
      },
      null,
      2,
    ) + '\n',
  );
  return p;
}

function annotate(evidenceDir, kind, textValue, reference) {
  const p = paths(evidenceDir);
  const campaign = loadCampaign(p.state);
  const target =
    kind === 'finding'
      ? campaign.findings
      : kind === 'waiver'
        ? campaign.waivers
        : kind === 'regression'
          ? campaign.regressions
          : null;
  if (!target) fail('annotation kind must be finding, waiver, or regression');
  if (!String(textValue || '').trim()) fail('annotation text is required');
  target.push({
    id: kind + '-' + String(target.length + 1).padStart(3, '0'),
    recordedAtUtc: now(),
    text: String(textValue).trim(),
    reference: reference || null,
  });
  saveCampaign(p.state, campaign);
  generateReport(evidenceDir, campaign, readJson(p.dossier));
}

function parse(argv) {
  const [command = 'help', ...rest] = argv;
  const opts = { _: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      opts._.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key === 'observed') {
      opts[key] = true;
      continue;
    }
    if (index + 1 >= rest.length) fail('missing value for --' + key);
    opts[key] = rest[++index];
  }
  return { command, opts };
}

function help() {
  console.log(
    [
      'DP5 Physical Test Harness',
      '',
      'init --operator <id> [--evidence-dir <dir>] [--control-tower <json>]',
      'list [--evidence-dir <dir>]',
      'next [--evidence-dir <dir>]',
      'show <scenario-id>',
      'start <scenario-id> [--correlation-id <id>] [--evidence-dir <dir>]',
      'finish <scenario-id> --status PASS|FAIL|BLOCKED [--observed] [--cause <text>]',
      'annotate --kind finding|waiver|regression --text <text> [--reference <path>]',
      'report [--evidence-dir <dir>]',
      '',
      'PASS is impossible without explicit --observed. Telemetry never infers PASS.',
    ].join('\n'),
  );
}

async function main() {
  const { command, opts } = parse(process.argv.slice(2));
  const evidenceDir = resolve(opts['evidence-dir'] || DEFAULT_EVIDENCE_DIR);
  if (['help', '--help', '-h'].includes(command)) {
    help();
    return;
  }
  if (command === 'init') {
    const p = initialize(
      evidenceDir,
      resolve(opts['control-tower'] || DEFAULT_CONTROL_TOWER),
      opts.operator,
    );
    console.log('DP5_CAMPAIGN_INITIALIZED_NOT_ACCEPTED\nstate=' + p.state + '\nreport=' + p.report);
    return;
  }
  if (command === 'show') {
    const record = DP5_SCENARIO_BY_ID[opts._[0]];
    if (!record) fail('scenario id is required');
    console.log(instructions(record));
    return;
  }

  const p = paths(evidenceDir);
  const campaign = loadCampaign(p.state);
  if (command === 'list') {
    for (const record of campaign.scenarios) {
      console.log(record.id + '\t' + record.status + '\t' + record.path + '\t' + record.name);
    }
    return;
  }
  if (command === 'next') {
    const record = campaign.scenarios.find((entry) => entry.status !== 'PASS');
    console.log(
      record
        ? instructions(DP5_SCENARIO_BY_ID[record.id])
        : 'ALL_48_OPERATOR_PASS_RECORDED_READY_FOR_INDEPENDENT_REVIEW_NOT_ACCEPTED',
    );
    return;
  }
  if (command === 'start') {
    const id = opts._[0];
    if (!id) fail('scenario id is required');
    const result = start(evidenceDir, id, opts['correlation-id']);
    console.log(
      'DP5_SCENARIO_STARTED_EVIDENCE_ONLY\nid=' +
        id +
        '\npath=' +
        result.attemptDir +
        '\n' +
        instructions(DP5_SCENARIO_BY_ID[id]),
    );
    return;
  }
  if (command === 'finish') {
    const id = opts._[0];
    if (!id) fail('scenario id is required');
    const status = String(opts.status || '').toUpperCase();
    const result = finish(evidenceDir, id, status, opts.cause || '', opts.observed === true);
    console.log(
      'DP5_SCENARIO_OPERATOR_VERDICT_RECORDED_NOT_ACCEPTED\nid=' +
        id +
        '\nstatus=' +
        status +
        '\nreceipt=' +
        result.receiptPath +
        '\nmanifest=' +
        result.manifestPath,
    );
    return;
  }
  if (command === 'annotate') {
    annotate(evidenceDir, opts.kind, opts.text, opts.reference);
    console.log('DP5_CAMPAIGN_ANNOTATION_RECORDED_NOT_ACCEPTED');
    return;
  }
  if (command === 'report') {
    const out = generateReport(evidenceDir, campaign, readJson(p.dossier));
    console.log(
      'DP5_DOSSIER_VIEW_GENERATED_NOT_ACCEPTED\nreport=' + out.report + '\nsummary=' + out.summary,
    );
    return;
  }
  fail('unknown command: ' + command);
}

if (process.argv[1]?.endsWith('dp5-campaign.mjs')) {
  main().catch((error) => {
    console.error('DP5_HARNESS_BLOCKED: ' + error.message);
    process.exitCode = 1;
  });
}
