import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const PACKAGE = 'ai.aurora.device.local';
const MAIN = `${PACKAGE}/ai.aurora.device.MainActivity`;
const DEVLAB = process.env.AURORA_DEVLAB_ROOT ?? join(homedir(), 'aurora-devlab');
const HOST = join(DEVLAB, 'worktrees', 'host');
const STATE = join(DEVLAB, 'state');
const MATERIAL = join(DEVLAB, 'config', 'w15j-dp5-material.json');
const EVIDENCE = join(DEVLAB, 'evidence', 'w15j-dp5');
const PHASE_FILE = join(STATE, 'dp5-life004-phase.json');
const MAX_BOOTSTRAP_PRINCIPAL_AGE_SECONDS = 240;

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

export function buildActionIntent(material) {
  return Object.freeze({
    kind: 'ACTION_INTENT',
    schemaVersion: '1.0.0',
    actionIntentId: material.actionIntentId,
    capability: Object.freeze({
      capability: 'audio.volume.set',
      actionType: 'AUDIO_VOLUME_STEP_UP',
    }),
    executionTarget: Object.freeze({
      schemaVersion: '1.0.0',
      kind: 'DEVICE',
      bindingReference: material.deviceId,
    }),
    tenant: Object.freeze({ tenantId: material.tenantId }),
    actor: Object.freeze({ kind: 'HUMAN', identityId: material.actorIdentityId }),
    requestOrigin: Object.freeze({ kind: 'HUMAN', identityId: material.actorIdentityId }),
    correlation: Object.freeze({ correlationId: material.correlationId }),
    resolvedParameters: Object.freeze({}),
    idempotency: Object.freeze({ mode: 'REQUIRED', key: material.idempotencyKey }),
    preconditions: Object.freeze([]),
    deadlineAt: material.expiresAt,
    authority: Object.freeze({ kind: 'POLICY_TOKEN', policyTokenId: material.policyTokenId }),
    dataClassification: 'INTERNAL',
  });
}

export function gatewaySessionIdFromConnectionId(connectionId) {
  const match = /^conn:(gws_[^:]+):[1-9][0-9]*$/u.exec(connectionId ?? '');
  if (match === null) throw new Error('gateway session id unavailable from connection id');
  return match[1];
}

export function parseSessionPrefs(xml) {
  const value = (name) => {
    const stringMatch = new RegExp(`<string name="${name}">([^<]+)</string>`, 'u').exec(xml);
    if (stringMatch !== null) return stringMatch[1];
    const numberMatch = new RegExp(`<(?:int|long) name="${name}" value="([^"]+)"`, 'u').exec(xml);
    return numberMatch?.[1];
  };
  const connectionId = value('connection_id');
  return Object.freeze({
    tenantId: value('tenant_id'),
    deviceSessionId: value('device_session_id'),
    deviceId: value('device_id'),
    connectionId,
    gatewaySessionId: gatewaySessionIdFromConnectionId(connectionId),
    registrationVersion: Number(value('registration_version')),
  });
}

export function executionStateCompatible(seed, attempt, containment) {
  if (attempt === null || containment === null) return false;
  const expectedQuota = seed.quota ?? null;
  const actualQuota = attempt.quota ?? null;
  return (
    attempt.tenantId === seed.tenantId &&
    attempt.actionIntentId === seed.actionIntentId &&
    attempt.executionRef === seed.executionRef &&
    attempt.attemptNumber === seed.attemptNumber &&
    attempt.maxAttempts === seed.maxAttempts &&
    JSON.stringify(actualQuota) === JSON.stringify(expectedQuota) &&
    containment.tenantId === seed.tenantId &&
    containment.circuitKey === seed.circuitKey &&
    containment.authorizesExecution === false &&
    containment.snapshot.circuit.state === seed.containment.circuit.state &&
    containment.snapshot.circuit.consecutiveFailures ===
      seed.containment.circuit.consecutiveFailures &&
    containment.snapshot.circuit.halfOpenProbeInFlight ===
      seed.containment.circuit.halfOpenProbeInFlight &&
    containment.snapshot.killSwitch.state === seed.containment.killSwitch.state &&
    containment.snapshot.dependencyHealth === seed.containment.dependencyHealth &&
    containment.snapshot.cancellationRequested === seed.containment.cancellationRequested &&
    containment.snapshot.currentInFlight === seed.containment.currentInFlight &&
    containment.snapshot.maxInFlight === seed.containment.maxInFlight &&
    containment.snapshot.retryDepth === seed.containment.retryDepth &&
    containment.snapshot.maxRetryDepth === seed.containment.maxRetryDepth
  );
}

export function buildDispatchRequest(material, session, nowMs = Date.now()) {
  const actionIntent = buildActionIntent(material);
  const canonicalPayloadHash = `sha256:${createHash('sha256').update(canonicalJson(actionIntent), 'utf8').digest('hex')}`;
  return Object.freeze({
    command: Object.freeze({
      commandId: material.commandId,
      executionId: material.executionId,
      causationId: material.causationId,
      orderingKey: material.orderingKey,
      orderingSequence: material.orderingSequence,
      actionIntent,
      canonicalPayloadHash,
      authorizesExecution: false,
    }),

    context: Object.freeze({
      tenantId: material.tenantId,
      actorIdentityId: material.actorIdentityId,
      correlationId: material.correlationId,
      gatewaySessionId: session.gatewaySessionId,
      connectionId: session.connectionId,
      deviceSessionId: session.deviceSessionId,
      deviceId: session.deviceId,
      registrationVersion: session.registrationVersion,
    }),
    dispatchedAtMs: nowMs,
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.binary ? null : 'utf8',
    timeout: options.timeout ?? 20_000,
    maxBuffer: 8 * 1024 * 1024,
    env: options.env ?? process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `${command} failed status=${result.status}: ${String(result.stderr ?? '').trim()}`,
    );
  }
  return result;
}

function adb(serial, args, options = {}) {
  return run('adb', ['-s', serial, ...args], options);
}

function recordPhase(phase, detail = {}) {
  writeFileSync(
    PHASE_FILE,
    `${JSON.stringify({ phase, recordedAt: new Date().toISOString(), ...detail }, null, 2)}\n`,
    { mode: 0o600 },
  );
  chmodSync(PHASE_FILE, 0o600);
}

function serialFromAdb() {
  const result = run('adb', ['devices']);
  const serial = result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim().split(/\s+/u))
    .find((parts) => parts[1] === 'device')?.[0];
  if (!serial) throw new Error('no authorized adb device');
  return serial;
}

function nodeBounds(xml, matcher) {
  for (const match of xml.matchAll(/<node\b[^>]*>/gu)) {
    const tag = match[0];
    if (!matcher(tag)) continue;
    const bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/u.exec(tag);
    if (!bounds) continue;
    return {
      x: Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2),
      y: Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2),
      tag,
    };
  }
  throw new Error('required UI node not found');
}

function uiXml(serial, name) {
  const remote = `/sdcard/${name}.xml`;
  adb(serial, ['shell', 'uiautomator', 'dump', remote]);
  return adb(serial, ['exec-out', 'cat', remote]).stdout;
}

async function bootstrapAndroid(serial, reference) {
  adb(serial, ['shell', 'am', 'start', '-W', '-n', MAIN]);
  let xml = uiXml(serial, 'dp5-life004-inprocess-nav');
  if (!xml.includes('Bootstrap LOCAL')) {
    if (!xml.includes('Conectar runtime LOCAL')) {
      const developer = nodeBounds(xml, (tag) => /text="Modo desenvolvedor"/u.test(tag));
      adb(serial, ['shell', 'input', 'tap', String(developer.x), String(developer.y)]);
      run('sleep', ['0.3']);
      xml = uiXml(serial, 'dp5-life004-inprocess-developer');
    }
    const connectLocal = nodeBounds(xml, (tag) => /text="Conectar runtime LOCAL"/u.test(tag));
    adb(serial, ['shell', 'input', 'tap', String(connectLocal.x), String(connectLocal.y)]);
    run('sleep', ['0.4']);
    xml = uiXml(serial, 'dp5-life004-inprocess-bootstrap');
  }
  if (!xml.includes('Bootstrap LOCAL')) throw new Error('Bootstrap LOCAL screen unavailable');
  const field = nodeBounds(xml, (tag) => /class="android\.widget\.EditText"/u.test(tag));
  adb(serial, ['shell', 'input', 'tap', String(field.x), String(field.y)]);
  adb(serial, ['shell', 'for i in $(seq 1 180); do input keyevent KEYCODE_DEL; done']);
  adb(serial, ['shell', 'input', 'text', reference]);

  let button = null;
  for (let index = 0; index < 20; index += 1) {
    xml = uiXml(serial, 'dp5-life004-inprocess-filled');
    if (xml.includes(reference)) {
      try {
        button = nodeBounds(
          xml,
          (tag) => /text="Conectar runtime governado"/u.test(tag) && /enabled="true"/u.test(tag),
        );
        break;
      } catch {
        // Compose can lag the text field update; keep polling within the bounded window.
      }
    }
    run('sleep', ['0.15']);
  }
  if (button === null) {
    throw new Error('bootstrap reference/button did not become ready');
  }

  adb(serial, ['shell', 'input', 'tap', String(button.x), String(button.y)]);

  // The Host HTTP server runs in this same Node process. Yield the event loop after
  // the tap so Android can complete the bootstrap exchange before any sync ADB polling.
  await delay(1200);
  for (let index = 0; index < 16; index += 1) {
    xml = uiXml(serial, 'dp5-life004-inprocess-result');
    if (
      xml.includes(
        'Canal W14 autenticado pronto; comandos de voz seguem para avaliação W07 governada.',
      )
    ) {
      return;
    }
    await delay(250);
  }
  if (/Bootstrap rejeitado|composição bloqueada|indisponível/u.test(xml)) {
    throw new Error('Android bootstrap rejected after connect timeout');
  }
  throw new Error('Android bootstrap did not become ready');
}

function readSession(serial) {
  const xml = adb(serial, [
    'exec-out',
    'run-as',
    PACKAGE,
    'sh',
    '-c',
    'cat shared_prefs/aurora_device_session_metadata.xml',
  ]).stdout;
  return parseSessionPrefs(xml);
}

function readEnvValue(path, key) {
  const line = readFileSync(path, 'utf8')
    .split(/\r?\n/u)
    .find((item) => item.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} missing from ${path}`);
  return line.slice(key.length + 1);
}

function stopExistingHost() {
  const pointer = join(STATE, 'last-readiness-termux.txt');
  if (!existsSync(pointer)) return;
  const readiness = readFileSync(pointer, 'utf8').trim();
  const announcement = join(readiness, 'host-ready-announcement.txt');
  if (!existsSync(announcement)) return;
  const pidMatch = /^process_id=(\d+)$/mu.exec(readFileSync(announcement, 'utf8'));
  if (!pidMatch) return;
  const pid = Number(pidMatch[1]);
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      run('sleep', ['0.2']);
    } catch {
      return;
    }
  }
  throw new Error('existing host did not stop');
}

function verifyExistingExecutionState(databaseUrl, seed) {
  const { PsqlW03SyncExecutor } = require(
    join(HOST, 'services/mobile-gateway/dist/physical-host/w03-postgres-reservations.js'),
  );
  const { W03PostgresExecutionAttemptQuotaSource } = require(
    join(HOST, 'services/mobile-gateway/dist/physical-host/w03-attempt-quota-source.js'),
  );
  const { W03PostgresCurrentContainmentStateSource } = require(
    join(HOST, 'services/mobile-gateway/dist/physical-host/w03-containment-state.js'),
  );
  const sql = new PsqlW03SyncExecutor({ databaseUrl });
  const attemptSource = new W03PostgresExecutionAttemptQuotaSource(sql);
  const containmentSource = new W03PostgresCurrentContainmentStateSource(sql);
  const attempt = attemptSource.lookup({
    tenantId: seed.tenantId,
    actionIntentId: seed.actionIntentId,
    executionRef: seed.executionRef,
  });
  const containment = containmentSource.resolveCurrent({
    tenantId: seed.tenantId,
    circuitKey: seed.circuitKey,
    evaluatedAt: new Date().toISOString(),
  });
  return executionStateCompatible(seed, attempt, containment);
}

function assertCleanHostSha() {
  const expected = readFileSync(join(STATE, 'worktrees.txt'), 'utf8')
    .split(/\r?\n/u)
    .find((line) => line.startsWith('host='))
    ?.slice(5);
  const actual = run('git', ['-C', HOST, 'rev-parse', 'HEAD']).stdout.trim();
  if (!expected || actual !== expected) throw new Error('host SHA drift');
  if (run('git', ['-C', HOST, 'status', '--porcelain']).stdout.trim()) {
    throw new Error('host worktree is dirty');
  }
  return actual;
}

const ROOT = process.env.AURORA_REPO_ROOT ?? join(homedir(), 'aurora-ai-native');

function campaign(...args) {
  return run(process.execPath, [join(ROOT, 'tools/tablet-devlab/dp5-campaign.mjs'), ...args]);
}

function latestAttemptDir() {
  const base = join(EVIDENCE, 'harness', 'DP5-LIFE-004');
  const found = run('bash', [
    '-lc',
    `find "${base}" -maxdepth 1 -type d -name 'attempt-*' | sort | tail -n1`,
  ]).stdout.trim();
  if (!found) throw new Error('LIFE-004 attempt directory unavailable');
  return found;
}

function physicalControl(operation, commandId) {
  const args = [join(ROOT, 'tools/tablet-devlab/dp5-physical-control.sh'), operation];
  if (commandId) args.push(commandId);
  return run('bash', args).stdout;
}

function queueBytes(serial) {
  return adb(
    serial,
    [
      'exec-out',
      'run-as',
      PACKAGE,
      'sh',
      '-c',
      'cat shared_prefs/aurora_offline_execution_queue.xml',
    ],
    { binary: true },
  ).stdout;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function executeLife004() {
  recordPhase('PRECHECK');
  const hostSha = assertCleanHostSha();
  run('bash', [join(ROOT, 'tools/tablet-devlab/verify-host-prebuild.sh')]);
  recordPhase('PREBUILD_VERIFIED', { hostSha });
  run('bash', [join(ROOT, 'tools/tablet-devlab/prepare-dp5-provider.sh')], {
    env: { ...process.env, AURORA_DP5_EFFECT_APPROVED: 'YES' },
  });
  recordPhase('PROVIDER_PREPARED');
  run('python', [
    join(ROOT, 'tools/tablet-devlab/check-bootstrap-principal-age.py'),
    MATERIAL,
    String(MAX_BOOTSTRAP_PRINCIPAL_AGE_SECONDS),
  ]);
  recordPhase('BOOTSTRAP_PRINCIPAL_FRESH');
  stopExistingHost();

  const databaseUrl = readEnvValue(join(STATE, 'postgres.env'), 'AURORA_W15J_DATABASE_URL');
  const providerUrl = pathToFileURL(
    join(HOST, 'tools/physical/w15j-local-dp5-provider-runtime.mjs'),
  ).href;
  const provider = await import(providerUrl);
  const input = await provider.createW15JLocalDp5OperatorInput({
    databaseUrl,
    materialPath: MATERIAL,
  });

  const { W15JLocalPhysicalHost } = require(
    join(HOST, 'services/mobile-gateway/dist/physical-host/local-physical-host.js'),
  );
  const host = new W15JLocalPhysicalHost(
    {
      databaseUrl,
      gatewayPort: 8080,
      bootstrapPort: 8081,
      bootstrapCredentialTtlMs: 10 * 60_000,
      bootstrapMaxPrincipalAgeMs: MAX_BOOTSTRAP_PRINCIPAL_AGE_SECONDS * 1000,
    },
    input.dependencies,
  );

  for (const seed of input.executionStateSeed) {
    const result = host.stageExecutionState(seed);
    if (result.ok) continue;
    if (
      result.code !== 'ATTEMPT_ALREADY_EXISTS' ||
      !verifyExistingExecutionState(databaseUrl, seed)
    ) {
      throw new Error(`execution state stage failed: ${result.code}`);
    }
    console.log(`W03_EXISTING_STATE_COMPATIBLE=${seed.executionRef}`);
  }
  recordPhase('W03_RECONCILED');

  let started = false;
  try {
    const address = await host.start();
    started = true;
    recordPhase('HOST_STARTED', { hostInstanceId: address.hostInstanceId });
    const bootstrap = host.stageBootstrap(input.principal);
    if (!bootstrap.ok)
      throw new Error(`bootstrap stage failed: ${bootstrap.error?.code ?? 'unknown'}`);
    recordPhase('BOOTSTRAP_STAGED', { hostInstanceId: address.hostInstanceId });

    const serial = serialFromAdb();
    await bootstrapAndroid(serial, bootstrap.value.bootstrapReference);
    recordPhase('BOOTSTRAP_COMPOSED', { hostInstanceId: address.hostInstanceId });
    const session = readSession(serial);
    const material = provider.loadAndValidateW15JDp5Material(MATERIAL);

    if (
      session.tenantId !== material.tenantId ||
      session.deviceSessionId !== material.deviceSessionId ||
      session.deviceId !== material.deviceId ||
      !Number.isSafeInteger(session.registrationVersion) ||
      session.registrationVersion <= 0
    ) {
      throw new Error('Android session binding does not match fresh DP5 material');
    }

    campaign('start', 'DP5-LIFE-004');
    const attempt = latestAttemptDir();
    recordPhase('CAMPAIGN_STARTED', { attempt });
    const before = JSON.parse(readFileSync(join(attempt, 'before', 'snapshot.json'), 'utf8'));
    if ((before.captureFailures ?? []).length !== 0) {
      throw new Error('baseline capture incomplete; physical action withheld');
    }

    const dispatchRequest = buildDispatchRequest(material, session);
    const dispatch = host.governedDeviceDispatch.dispatch(dispatchRequest);
    writeFileSync(
      join(attempt, 'governed-dispatch.json'),
      `${JSON.stringify(dispatch, null, 2)}\n`,
    );
    if (
      !dispatch.ok ||
      dispatch.authorizesExecution !== false ||
      dispatch.retryAuthorized !== false
    ) {
      throw new Error(`governed dispatch rejected: ${dispatch.code ?? 'protocol'}`);
    }
    recordPhase('GOVERNED_DISPATCH_READY', { attempt });

    const prepare = physicalControl('OFFLINE_PREPARE', material.commandId);
    writeFileSync(join(attempt, 'offline-prepare.txt'), prepare);
    if (!prepare.includes('OFFLINE_PREPARE_QUEUED_PASS')) {
      throw new Error('OFFLINE_PREPARE did not queue safe deferred work');
    }
    recordPhase('SAFE_DEFERRED_QUEUED', { attempt });

    const snapshot = physicalControl('OFFLINE_SNAPSHOT');
    writeFileSync(join(attempt, 'offline-snapshot-before.txt'), snapshot);
    const beforeQueue = queueBytes(serial);
    const beforeQueuePath = join(attempt, 'offline-queue-before.xml');
    writeFileSync(beforeQueuePath, beforeQueue);
    const beforeHash = sha256(beforeQueue);

    const pidBefore = adb(serial, ['shell', 'pidof', PACKAGE], {
      allowFailure: true,
    }).stdout.trim();
    if (!pidBefore) throw new Error('Aurora process missing before process-death action');
    const transitionPath = join(attempt, 'process-death-transition.txt');
    writeFileSync(
      transitionPath,
      `host_sha=${hostSha}\nhost_instance_id=${address.hostInstanceId}\nqueue_sha_before=${beforeHash}\npid_before=${pidBefore}\n`,
    );

    adb(serial, ['shell', 'am', 'force-stop', PACKAGE]);
    run('sleep', ['0.8']);
    const pidStopped = adb(serial, ['shell', 'pidof', PACKAGE], {
      allowFailure: true,
    }).stdout.trim();
    writeFileSync(transitionPath, `pid_after_force_stop=${pidStopped}\n`, { flag: 'a' });
    if (pidStopped) throw new Error('Aurora process remained alive after force-stop');
    recordPhase('PROCESS_STOPPED', { attempt });

    const relaunch = adb(serial, ['shell', 'am', 'start', '-W', '-n', MAIN]).stdout;
    writeFileSync(join(attempt, 'relaunch.txt'), relaunch);
    run('sleep', ['1.2']);

    const pidAfter = adb(serial, ['shell', 'pidof', PACKAGE], { allowFailure: true }).stdout.trim();
    if (!pidAfter || pidAfter === pidBefore) throw new Error('Aurora relaunch PID is not fresh');
    writeFileSync(transitionPath, `pid_after_relaunch=${pidAfter}\n`, { flag: 'a' });
    recordPhase('PROCESS_RELAUNCHED', { attempt });

    const afterQueue = queueBytes(serial);
    const afterQueuePath = join(attempt, 'offline-queue-after.xml');
    writeFileSync(afterQueuePath, afterQueue);
    const afterHash = sha256(afterQueue);
    writeFileSync(
      transitionPath,
      `queue_sha_after=${afterHash}\nqueue_persisted_across_process_death=${beforeHash === afterHash ? 'YES' : 'NO'}\n`,
      { flag: 'a' },
    );
    if (beforeHash !== afterHash)
      throw new Error('safe deferred queue changed across process death');

    const activity = adb(serial, [
      'shell',
      "dumpsys activity activities 2>&1 | grep -m1 -E 'mResumedActivity|topResumedActivity|ResumedActivity'",
    ]).stdout;
    writeFileSync(join(attempt, 'relaunch-activity.txt'), activity);
    const logcat = adb(serial, ['logcat', '-d', '-t', '1200', '-v', 'threadtime']).stdout;
    writeFileSync(join(attempt, 'relaunch-logcat.txt'), logcat);
    const screenshot = adb(serial, ['exec-out', 'screencap', '-p'], { binary: true }).stdout;
    writeFileSync(join(attempt, 'relaunch-screen.png'), screenshot);

    const evidenceFiles = [
      'governed-dispatch.json',
      'offline-prepare.txt',
      'offline-snapshot-before.txt',
      'offline-queue-before.xml',
      'offline-queue-after.xml',
      'process-death-transition.txt',
      'relaunch.txt',
      'relaunch-activity.txt',
      'relaunch-logcat.txt',
      'relaunch-screen.png',
    ];

    const manifest = evidenceFiles.map((name) => {
      const path = join(attempt, name);
      chmodSync(path, 0o600);
      return `${sha256(readFileSync(path))}  ${name}`;
    });
    writeFileSync(join(attempt, 'action-evidence.sha256'), `${manifest.join('\n')}\n`, {
      mode: 0o600,
    });

    const crashAnr = /FATAL EXCEPTION|ANR in ai\.aurora\.device\.local|am_crash|am_anr/u.test(
      logcat,
    );
    writeFileSync(
      join(attempt, 'action-observation.txt'),
      [
        `governed_dispatch=${dispatch.disposition}`,
        'offline_prepare=QUEUED_PASS',
        'queue_persisted_across_process_death=YES',
        `crash_anr_signals=${crashAnr ? 'FOUND' : 'NONE'}`,
        'physical_acceptance=false',
        'operator_verdict=NOT_RECORDED',
      ].join('\n') + '\n',
      { mode: 0o600 },
    );

    recordPhase('EVIDENCE_RECORDED_NOT_VERDICT', { attempt });
    console.log('DP5_LIFE_004_ACTION=RECORDED_NOT_VERDICT');
    console.log(`attempt=${attempt}`);
    console.log(`host_sha=${hostSha}`);
    console.log(`host_instance_id=${address.hostInstanceId}`);
    console.log(`dispatch=${dispatch.disposition}`);
    console.log('queue_persisted_across_process_death=YES');
    console.log(`crash_anr_signals=${crashAnr ? 'FOUND' : 'NONE'}`);
  } finally {
    if (started) await host.stop();
  }
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invoked) {
  executeLife004().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    recordPhase('ERROR', { error: message });
    console.error(`DP5_LIFE_004_INPROCESS_ERROR=${message}`);
    process.exitCode = 2;
  });
}
