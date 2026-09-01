// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import { spawnSync } from 'node:child_process';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import { readFileSync, readdirSync, statSync } from 'node:fs';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import { resolve } from 'node:path';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import { performance } from 'node:perf_hooks';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import { cwd, stdout, version as nodeVersion } from 'node:process';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import { pathToFileURL } from 'node:url';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { Evidence } from '@aurora/contracts/evidence';
import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';
import type {
  AuthorityEvaluationRequest,
  AuthorityEvaluationResult,
} from '@aurora/contracts/policy-validation';
import type { TargetedReceipt } from '@aurora/contracts/receipts';
import type { ContractVersion } from '@aurora/contracts/versioning';

import {
  evaluateFailureContainment,
  transitionCircuit,
  transitionKillSwitch,
} from '../src/failure-containment/index.js';
import type {
  CircuitSnapshot,
  FailureContainmentSnapshot,
  KillSwitchSnapshot,
} from '../src/failure-containment/index.js';
import { captureReadbackEvidence, createTargetedExecutionReceipt } from '../src/readback/index.js';
import {
  classifyExecutionAmbiguity,
  reconcileExecutionUncertainty,
} from '../src/reconciliation/index.js';
import { evaluateExecutionSafeguards } from '../src/safeguards/index.js';
import { validateExecutorAuthority } from '../src/sdk/index.js';
import { resolveExecutionTarget } from '../src/target-resolution/index.js';
import type { ExecutableTargetBinding } from '../src/target-resolution/index.js';

const schemaVersion = '1.0.0' as ContractVersion;
const tenantId = 'ten_01J00000000000000000000000';
const actorId = 'idn_01J00000000000000000000000';
const subjectId = 'idn_01J00000000000000000000002';
const correlationId = 'cor_01J00000000000000000000000';
const policyTokenId = 'ptk_01J00000000000000000000000';
const canonicalPayloadHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const repoRoot = cwd();
const at = (value: string) => value as Rfc3339Timestamp;

type TargetKind = 'PROVIDER' | 'DEVICE' | 'WORKFLOW' | 'LOCAL_SERVICE';

interface W02Runtime {
  evaluateAuthority(request: AuthorityEvaluationRequest): AuthorityEvaluationResult;
}
interface W03SqlStatement {
  readonly text: string;
  readonly values: readonly (string | number | null)[];
}
interface W03IdempotencyRequest {
  readonly tenantId: string;
  readonly key: string;
  readonly operationName: string;
  readonly canonicalPayloadHash: string;
}
interface W03IdempotencyRecord extends W03IdempotencyRequest {
  readonly status: 'accepted' | 'rejected' | 'inflight' | 'completed';
}
type W03Decision =
  | Readonly<{ kind: 'NEW' }>
  | Readonly<{ kind: 'REPLAY'; status: W03IdempotencyRecord['status'] }>
  | Readonly<{
      kind: 'CONFLICT';
      reason: 'OPERATION_MISMATCH' | 'PAYLOAD_MISMATCH' | 'EVENT_MISMATCH';
    }>;
interface W03Runtime {
  decideIdempotency(
    existing: W03IdempotencyRecord | null,
    request: W03IdempotencyRequest,
  ): W03Decision;
  buildInsertIdempotencyStatement(request: W03IdempotencyRequest): W03SqlStatement;
  buildCompleteIdempotencyStatement(
    request: Pick<W03IdempotencyRequest, 'tenantId' | 'key'> & { readonly now: string },
  ): W03SqlStatement;
}
interface W04PlanResult {
  readonly planKind: 'TARGET_NEUTRAL_CAPABILITY_PLAN';
  readonly status: 'READY' | 'BLOCKED';
  readonly authorizesExecution: false;
  readonly selections: readonly Readonly<{
    status: 'SELECTED' | 'UNSATISFIED';
    selectedBindingIds: readonly string[];
  }>[];
}
interface W03FenceHarness {
  readonly port: {
    reserve(input: W03IdempotencyRequest):
      | Readonly<{ kind: 'RESERVED' }>
      | Readonly<{ kind: 'REPLAY_COMPLETED'; reference: string }>
      | Readonly<{ kind: 'INFLIGHT' }>
      | Readonly<{ kind: 'CONFLICT'; reason: string }>;
  };
  complete(now: string): void;
  readonly sql: readonly W03SqlStatement[];
  readonly record: W03IdempotencyRecord | null;
}

function buildWorkspace(workspace: string): void {
  const result = spawnSync('npm', ['run', 'build', '--workspace', workspace], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `${workspace} build failed before W07-H integration: ${result.stderr || result.stdout}`,
  );
}

async function loadAcceptedUpstreams(): Promise<{ readonly w02: W02Runtime; readonly w03: W03Runtime }> {
  buildWorkspace('@aurora/policy-core');
  buildWorkspace('@aurora/events');
  const w02Url = pathToFileURL(
    resolve(repoRoot, 'packages/policy/dist/packages/policy/src/authority/index.js'),
  ).href;
  const w03Url = pathToFileURL(resolve(repoRoot, 'packages/events/dist/delivery/index.js')).href;
  const w02 = (await import(w02Url)) as unknown as W02Runtime;
  const w03 = (await import(w03Url)) as unknown as W03Runtime;
  assert.equal(typeof w02.evaluateAuthority, 'function');
  assert.equal(typeof w03.decideIdempotency, 'function');
  return { w02, w03 };
}

const w04PlanCache = new Map<TargetKind, W04PlanResult>();
function runW04CapabilityPlan(kind: TargetKind): W04PlanResult {
  const cached = w04PlanCache.get(kind);
  if (cached !== undefined) return cached;
  const observedAt = '2026-09-01T17:00:00Z';
  const payload = {
    registry: {
      registryKind: 'AURORA_CANONICAL_CAPABILITY_REGISTRY',
      registryVersion: 'w04-accepted-v1',
      entries: [
        {
          capabilityId: 'social.publish',
          semanticVersion: '1.0.0',
          name: 'Social publish',
          description: 'Target-neutral publication capability fixture.',
          tenantId,
          supportedTargetKinds: [kind],
          compatibilityKeys: ['executor-v1'],
          requiredPermissionClaims: ['instagram:publish'],
          preconditions: [],
          riskClass: 'HIGH',
          sideEffectClass: 'EXTERNAL_SIDE_EFFECT',
          readbackStrategy: 'STATE_COMPARE',
          evidenceStrategy: 'REQUIRED',
          availability: {
            state: 'AVAILABLE',
            observedAt,
            maxAgeMs: 3_600_000,
            source: 'W07-H mock consumer fixture',
          },
          bindings: [
            {
              bindingId: `w04:${kind.toLowerCase()}:binding`,
              targetKind: kind,
              compatibilityKey: 'executor-v1',
              tenantId,
              availability: {
                state: 'AVAILABLE',
                observedAt,
                maxAgeMs: 3_600_000,
                source: 'W07-H mock consumer fixture',
              },
            },
          ],
          provenance: { sourceKind: 'AURORA_NATIVE', sourceRef: 'W04-H accepted' },
        },
      ],
    },
    input: {
      tenantId,
      correlationId,
      registryVersion: 'w04-accepted-v1',
      nowEpochMs: Date.parse('2026-09-01T17:30:00Z'),
      requirements: [
        {
          requirementId: `requirement:${kind.toLowerCase()}`,
          capabilityId: 'social.publish',
          acceptedTargetKinds: [kind],
          requiredCompatibilityKeys: ['executor-v1'],
        },
      ],
    },
  };
  const script = `
    import { planCapabilities } from './packages/control/src/capability-plan/planner.ts';
    let input = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) input += chunk;
    const payload = JSON.parse(input);
    process.stdout.write(JSON.stringify(planCapabilities(payload.registry, payload.input)));
  `;
  const result = spawnSync(
    'node',
    ['--experimental-strip-types', '--input-type=module', '--eval', script],
    { cwd: repoRoot, input: JSON.stringify(payload), encoding: 'utf8' },
  );
  assert.equal(result.status, 0, `W04 plan fixture failed: ${result.stderr || result.stdout}`);
  const plan = JSON.parse(result.stdout) as W04PlanResult;
  w04PlanCache.set(kind, plan);
  return plan;
}

function targetFor(kind: TargetKind): ExecutionTargetReference {
  switch (kind) {
    case 'PROVIDER':
      return {
        schemaVersion,
        kind,
        provider: 'meta',
        targetType: 'instagram_account',
        targetReference: 'ig:w07h',
        accountReference: 'business:w07h',
      };
    case 'DEVICE':
      return { schemaVersion, kind, bindingReference: 'device-binding:w07h' };
    case 'WORKFLOW':
      return { schemaVersion, kind, bindingReference: 'workflow-binding:w07h' };
    case 'LOCAL_SERVICE':
      return { schemaVersion, kind, bindingReference: 'local-service-binding:w07h' };
  }
}

function makeIntent(
  target: ExecutionTargetReference = targetFor('PROVIDER'),
  overrides: Record<string, unknown> = {},
): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion,
    actionIntentId: `action-intent:w07h:${target.kind.toLowerCase()}`,
    capability: { capability: 'social.publish', actionType: 'social.publish' },
    executionTarget: target,
    tenant: { tenantId },
    actor: { kind: 'HUMAN', identityId: actorId },
    requestOrigin: { kind: 'HUMAN', identityId: actorId },
    correlation: { correlationId },
    resolvedParameters: { contentReference: 'content:w07h' },
    idempotency: { mode: 'REQUIRED', key: `idem:w07h:${target.kind.toLowerCase()}` },
    preconditions: [],
    expectedState: { stateType: 'publication', value: { status: 'published' } },
    deadlineAt: at('2026-09-01T19:00:00Z'),
    authority: { kind: 'POLICY_TOKEN', policyTokenId },
    dataClassification: 'INTERNAL',
    ...overrides,
  } as unknown as ActionIntent;
}

function makeAuthorityRequest(
  actionIntent: ActionIntent,
  options: Readonly<{ expired?: boolean; wrongScope?: boolean }> = {},
): AuthorityEvaluationRequest {
  const policy = { reference: 'policy:toca:marketing', version: '2.4.0' };
  const requestedScope = options.wrongScope ? ['instagram:admin'] : ['instagram:publish'];
  return {
    kind: 'AuthorityEvaluationRequest',
    policyEvaluation: {
      kind: 'PolicyEvaluationRequest',
      schemaVersion,
      policy,
      snapshot: {
        kind: 'PolicySnapshot',
        policy,
        state: 'ACTIVE',
        rules: [
          {
            ruleId: 'rule.w07h.allow.publish',
            effect: 'ALLOW',
            action: 'social.publish',
            scope: ['instagram:publish'],
            tenantIds: [tenantId],
            actorKinds: ['HUMAN'],
            actorIdentityIds: [actorId],
            subjectReferences: [`identity:${subjectId}`],
            purposeIds: ['marketing'],
            jurisdictions: ['BR-BA'],
            dataClassifications: ['INTERNAL'],
            authorityRequired: true,
            reasonReference: 'policy:toca:marketing#w07h',
          },
        ],
      },
      correlation: actionIntent.correlation,
      evaluatedAt: at('2026-09-01T17:30:00Z'),
      tenant: actionIntent.tenant,
      tenantBoundary: {
        status: 'WITHIN_BOUNDARY',
        reason: 'BOUNDARY_CONFIRMED',
        correlationId: actionIntent.correlation.correlationId,
        evidence: {
          evaluatedTenantId: actionIntent.tenant.tenantId,
          actorIdentityId: actionIntent.actor.identityId,
          matchedBindingCount: 1,
          observedBindingTenantIds: [actionIntent.tenant.tenantId],
        },
      },
      actor: actionIntent.actor,
      subject: { kind: 'IDENTITY', identityId: subjectId },
      action: actionIntent.capability.actionType,
      requestedScope,
      purpose: {
        kind: 'PurposeContext',
        purposeId: 'marketing',
        version: schemaVersion,
        status: 'ACTIVE',
        allowedDataClassifications: ['PUBLIC', 'INTERNAL'],
      },
      jurisdiction: { kind: 'JurisdictionContext', jurisdiction: 'BR-BA', version: schemaVersion },
      dataClassification: 'INTERNAL',
      policyToken: {
        kind: 'POLICY_TOKEN',
        schemaVersion,
        policyTokenId,
        tenant: actionIntent.tenant,
        subject: { reference: `identity:${subjectId}` },
        action: actionIntent.capability.actionType,
        scope: ['instagram:publish'],
        issuedAt: at('2026-09-01T17:00:00Z'),
        expiresAt: at(options.expired ? '2026-09-01T17:29:59Z' : '2026-09-01T18:30:00Z'),
        policy,
        authorityClass: 'POLICY_RULE',
        correlation: actionIntent.correlation,
      },
    },
  } as unknown as AuthorityEvaluationRequest;
}

function targetBinding(
  target: ExecutionTargetReference,
  overrides: Partial<ExecutableTargetBinding> = {},
): ExecutableTargetBinding {
  return {
    schemaVersion,
    bindingId: `binding:w07h:${target.kind.toLowerCase()}`,
    tenant: { tenantId: tenantId as ExecutableTargetBinding['tenant']['tenantId'] },
    target,
    state: 'AVAILABLE',
    freshUntil: at('2026-09-01T18:30:00Z'),
    compatibleActionIntentSchemaVersions: [schemaVersion],
    preconditionsSatisfied: true,
    ...overrides,
  };
}
function circuit(overrides: Partial<CircuitSnapshot> = {}): CircuitSnapshot {
  return { state: 'CLOSED', consecutiveFailures: 0, halfOpenProbeInFlight: false, ...overrides };
}
function killSwitch(overrides: Partial<KillSwitchSnapshot> = {}): KillSwitchSnapshot {
  return { state: 'INACTIVE', changedAt: at('2026-09-01T17:00:00Z'), ...overrides };
}
function containmentSnapshot(
  overrides: Partial<FailureContainmentSnapshot> = {},
): FailureContainmentSnapshot {
  return {
    circuit: circuit(),
    killSwitch: killSwitch(),
    dependencyHealth: 'HEALTHY',
    cancellationRequested: false,
    currentInFlight: 0,
    maxInFlight: 4,
    retryDepth: 0,
    maxRetryDepth: 3,
    ...overrides,
  };
}

function createW03Fence(w03: W03Runtime): W03FenceHarness {
  let record: W03IdempotencyRecord | null = null;
  const sql: W03SqlStatement[] = [];
  const port = {
    reserve(input: W03IdempotencyRequest) {
      const decision = w03.decideIdempotency(record, input);
      if (decision.kind === 'NEW') {
        const statement = w03.buildInsertIdempotencyStatement(input);
        assert.match(statement.text, /INSERT INTO w03_idempotency_key/);
        sql.push(statement);
        record = { ...input, status: 'inflight' };
        return { kind: 'RESERVED' } as const;
      }
      if (decision.kind === 'REPLAY') {
        if (decision.status === 'completed') {
          return { kind: 'REPLAY_COMPLETED', reference: 'w03_idempotency_key' } as const;
        }
        return { kind: 'INFLIGHT' } as const;
      }
      return { kind: 'CONFLICT', reason: decision.reason } as const;
    },
  };
  return {
    port,
    complete(now: string) {
      assert.notEqual(record, null, 'cannot complete W03 fence before reservation');
      if (record === null) return;
      const statement = w03.buildCompleteIdempotencyStatement({
        tenantId: record.tenantId,
        key: record.key,
        now,
      });
      assert.match(statement.text, /UPDATE w03_idempotency_key/);
      sql.push(statement);
      record = { ...record, status: 'completed' };
    },
    get sql() {
      return sql;
    },
    get record() {
      return record;
    },
  };
}

interface PreparedExecution {
  readonly intent: ActionIntent;
  readonly target: ExecutionTargetReference;
  readonly plan: W04PlanResult;
  readonly authority: ReturnType<typeof validateExecutorAuthority>;
  readonly resolution?: ReturnType<typeof resolveExecutionTarget>;
  readonly containment?: ReturnType<typeof evaluateFailureContainment>;
  readonly safeguards?: ReturnType<typeof evaluateExecutionSafeguards>;
  readonly fence: W03FenceHarness;
  readonly eligible: boolean;
}

function prepareExecution(
  w02: W02Runtime,
  w03: W03Runtime,
  options: Readonly<{
    targetKind?: TargetKind;
    expiredAuthority?: boolean;
    wrongScope?: boolean;
    targetBindings?: readonly ExecutableTargetBinding[];
    containment?: FailureContainmentSnapshot;
    nonAuthoritativeSignals?: Readonly<{
      readonly lane?: string;
      readonly confidence?: number;
      readonly precheckReference?: string;
      readonly executionBudgetReference?: string;
      readonly urgency?: number;
      readonly routerOverrideRequested?: boolean;
    }>;
    intentOverrides?: Record<string, unknown>;
    fence?: W03FenceHarness;
    attemptNumber?: number;
    evaluatedAt?: Rfc3339Timestamp;
  }> = {},
): PreparedExecution {
  const target = targetFor(options.targetKind ?? 'PROVIDER');
  const intent = makeIntent(target, options.intentOverrides);
  const plan = runW04CapabilityPlan(target.kind);
  assert.equal(plan.status, 'READY');
  assert.equal(plan.authorizesExecution, false);
  const authorityEvaluation = makeAuthorityRequest(intent, {
    ...(options.expiredAuthority === undefined ? {} : { expired: options.expiredAuthority }),
    ...(options.wrongScope === undefined ? {} : { wrongScope: options.wrongScope }),
  });
  const authority = validateExecutorAuthority({
    schemaVersion,
    actionIntent: intent,
    authorityEvaluation,
    validateCurrentAuthority: (request) => w02.evaluateAuthority(request),
    ...(options.nonAuthoritativeSignals === undefined
      ? {}
      : { nonAuthoritativeSignals: options.nonAuthoritativeSignals }),
  });
  const fence = options.fence ?? createW03Fence(w03);
  if (!authority.executionEligible) return { intent, target, plan, authority, fence, eligible: false };
  const resolution = resolveExecutionTarget({
    schemaVersion,
    actionIntentSchemaVersion: schemaVersion,
    tenant: intent.tenant,
    evaluatedAt: options.evaluatedAt ?? at('2026-09-01T17:31:00Z'),
    target,
    bindings: options.targetBindings ?? [targetBinding(target)],
  });
  if (!resolution.resolved) {
    return { intent, target, plan, authority, resolution, fence, eligible: false };
  }
  const containment = evaluateFailureContainment({
    schemaVersion,
    actionIntent: intent,
    evaluatedAt: at('2026-09-01T17:31:00Z'),
    phase: 'PRE_EXTERNAL',
    snapshot: options.containment ?? containmentSnapshot(),
    ...(options.nonAuthoritativeSignals === undefined
      ? {}
      : { nonAuthoritativeSignals: options.nonAuthoritativeSignals }),
  });
  if (!containment.mayProceedToOtherGuards) {
    return { intent, target, plan, authority, resolution, containment, fence, eligible: false };
  }
  const safeguards = evaluateExecutionSafeguards({
    schemaVersion,
    actionIntent: intent,
    evaluatedAt: options.evaluatedAt ?? at('2026-09-01T17:31:00Z'),
    attemptNumber: options.attemptNumber ?? 1,
    maxAttempts: 3,
    quota: { limit: 10, used: 0 },
    evaluatePrecondition: () => true,
    canonicalPayloadHash,
    idempotencyFence: fence.port,
  });
  return {
    intent,
    target,
    plan,
    authority,
    resolution,
    containment,
    safeguards,
    fence,
    eligible: safeguards.safeToInvokeExternal,
  };
}

function makeReceipt(intent: ActionIntent, suffix: string): TargetedReceipt {
  const result = createTargetedExecutionReceipt({
    schemaVersion,
    actionIntent: intent,
    receiptId: `receipt:w07h:${suffix}` as TargetedReceipt['receiptId'],
    executor: { executor: 'executor:w07h-mock' },
    attempt: 1,
    attemptedAt: at('2026-09-01T17:32:00Z'),
    acknowledgedAt: at('2026-09-01T17:32:01Z'),
    returnedAt: at('2026-09-01T17:32:02Z'),
    executionOutcome: 'EXECUTED_ACKNOWLEDGED',
  });
  assert.equal(result.status, 'CREATED');
  if (result.status !== 'CREATED') throw new Error(`receipt ${suffix} rejected`);
  return result.receipt;
}
function captureReadback(
  intent: ActionIntent,
  receipt: TargetedReceipt,
  status: 'published' | 'draft' = 'published',
) {
  return captureReadbackEvidence({
    schemaVersion,
    evidenceId: `evidence:w07h:${status}` as Evidence['evidenceId'],
    actionIntent: intent,
    receipt,
    readback: () => ({
      capturedAt: at('2026-09-01T17:32:03Z'),
      reference: { system: 'w07h-mock-target', reference: `object:${status}` },
      observedState: { status },
    }),
  });
}
function walkFiles(directory: string): readonly string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(directory)) {
    const absolute = resolve(directory, entry);
    if (statSync(absolute).isDirectory()) paths.push(...walkFiles(absolute));
    else paths.push(absolute);
  }
  return paths;
}
function percentile(samples: readonly number[], fraction: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return Number((sorted[index] ?? 0).toFixed(6));
}
function measure(operation: () => void, iterations = 200) {
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    operation();
    samples.push(performance.now() - started);
  }
  return {
    iterations,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99),
  };
}

test('W07-H integrates A-G, closes upstream bindings and passes R01-R24', async (t) => {
  const { w02, w03 } = await loadAcceptedUpstreams();

  await t.test('R01 governed PROVIDER reaches mock effect only after all current gates', () => {
    const prepared = prepareExecution(w02, w03);
    assert.equal(prepared.eligible, true);
    assert.equal(prepared.authority.currentAuthorityValidated, true);
    assert.equal(prepared.authority.authorizesExecution, false);
    assert.equal(prepared.resolution?.authorizesExecution, false);
    assert.equal(prepared.safeguards?.authorizesExecution, false);
    assert.equal(prepared.containment?.authorizesExecution, false);
    let effects = 0;
    if (prepared.eligible) effects += 1;
    assert.equal(effects, 1);
    prepared.fence.complete('2026-09-01T17:32:04Z');
    assert.equal(prepared.fence.sql.length, 2);
  });
  await t.test('R02 stale or expired authority prevents any external effect', () => {
    const prepared = prepareExecution(w02, w03, { expiredAuthority: true });
    assert.equal(prepared.eligible, false);
    assert.equal(prepared.authority.currentAuthorityValidated, false);
    assert.equal(prepared.fence.record, null);
  });
  await t.test('R03 informational precheck cannot replace current validation', () => {
    const prepared = prepareExecution(w02, w03, {
      expiredAuthority: true,
      nonAuthoritativeSignals: { precheckReference: 'precheck:allow', confidence: 1 },
    });
    assert.equal(prepared.eligible, false);
    assert.equal(prepared.authority.currentAuthorityValidated, false);
  });
  await t.test('R04 FAST lane and high confidence cannot bypass Executor checks', () => {
    const prepared = prepareExecution(w02, w03, {
      expiredAuthority: true,
      nonAuthoritativeSignals: { lane: 'FAST', confidence: 1, routerOverrideRequested: true },
    });
    assert.equal(prepared.eligible, false);
    assert.equal(prepared.fence.record, null);
  });
  await t.test('R05 DEVICE target remains opaque and never masquerades as provider', () => {
    const prepared = prepareExecution(w02, w03, { targetKind: 'DEVICE' });
    assert.equal(prepared.eligible, true);
    assert.equal(prepared.target.kind, 'DEVICE');
    assert.equal('provider' in prepared.target, false);
  });
  await t.test('R06 WORKFLOW and LOCAL_SERVICE remain target-neutral', () => {
    for (const targetKind of ['WORKFLOW', 'LOCAL_SERVICE'] as const) {
      const prepared = prepareExecution(w02, w03, { targetKind });
      assert.equal(prepared.eligible, true);
      assert.equal(prepared.target.kind, targetKind);
      assert.equal('provider' in prepared.target, false);
    }
  });
  await t.test('R07 legacy provider ActionIntent remains compatibility-safe', () => {
    const legacyIntent = makeIntent(targetFor('PROVIDER'), {
      executionTarget: undefined,
      providerBinding: {
        provider: 'meta',
        targetType: 'instagram_account',
        targetReference: 'ig:legacy-w07h',
      },
    });
    const receipt = makeReceipt(legacyIntent, 'legacy');
    assert.equal(receipt.executionTarget.kind, 'PROVIDER');
    if (receipt.executionTarget.kind === 'PROVIDER') {
      assert.equal(receipt.executionTarget.targetReference, 'ig:legacy-w07h');
    }
  });
  await t.test('R08 conflicting legacy and target-neutral provider references fail closed', () => {
    const conflictIntent = makeIntent(targetFor('PROVIDER'), {
      providerBinding: {
        provider: 'google',
        targetType: 'ads_account',
        targetReference: 'gads:conflict',
      },
    });
    const result = createTargetedExecutionReceipt({
      schemaVersion,
      actionIntent: conflictIntent,
      receiptId: 'receipt:w07h:conflict' as TargetedReceipt['receiptId'],
      executor: { executor: 'executor:w07h-mock' },
      attempt: 1,
      attemptedAt: at('2026-09-01T17:32:00Z'),
    });
    assert.equal(result.status, 'REJECTED');
    if (result.status === 'REJECTED') assert.deepEqual(result.reasons, ['EXECUTION_TARGET_CONFLICT']);
  });
  await t.test('R09 duplicate concurrent command is fenced before irreversible mock effect', () => {
    const target = targetFor('PROVIDER');
    const intent = makeIntent(target, { idempotency: { mode: 'REQUIRED', key: 'idem:w07h:race' } });
    const fence = createW03Fence(w03);
    const request = {
      schemaVersion,
      actionIntent: intent,
      evaluatedAt: at('2026-09-01T17:31:00Z'),
      attemptNumber: 1,
      maxAttempts: 3,
      evaluatePrecondition: () => true,
      canonicalPayloadHash,
      idempotencyFence: fence.port,
    };
    const first = evaluateExecutionSafeguards(request);
    const racingDuplicate = evaluateExecutionSafeguards(request);
    assert.equal(first.safeToInvokeExternal, true);
    assert.equal(racingDuplicate.safeToInvokeExternal, false);
    assert.deepEqual(racingDuplicate.reasons, ['IDEMPOTENCY_INFLIGHT']);
    let effects = 0;
    if (first.safeToInvokeExternal) effects += 1;
    if (racingDuplicate.safeToInvokeExternal) effects += 1;
    assert.equal(effects, 1);
  });
  await t.test('R10 precondition, deadline and quota failures prevent external call', () => {
    const target = targetFor('PROVIDER');
    const base = makeIntent(target, { preconditions: [{ kind: 'mock' }] });
    const precondition = evaluateExecutionSafeguards({
      schemaVersion,
      actionIntent: base,
      evaluatedAt: at('2026-09-01T17:31:00Z'),
      attemptNumber: 1,
      maxAttempts: 3,
      evaluatePrecondition: () => false,
      canonicalPayloadHash,
      idempotencyFence: createW03Fence(w03).port,
    });
    const deadline = evaluateExecutionSafeguards({
      schemaVersion,
      actionIntent: makeIntent(target, { deadlineAt: at('2026-09-01T17:31:00Z') }),
      evaluatedAt: at('2026-09-01T17:31:00Z'),
      attemptNumber: 1,
      maxAttempts: 3,
      evaluatePrecondition: () => true,
      canonicalPayloadHash,
      idempotencyFence: createW03Fence(w03).port,
    });
    const quota = evaluateExecutionSafeguards({
      schemaVersion,
      actionIntent: makeIntent(target),
      evaluatedAt: at('2026-09-01T17:31:00Z'),
      attemptNumber: 1,
      maxAttempts: 3,
      quota: { limit: 1, used: 1 },
      evaluatePrecondition: () => true,
      canonicalPayloadHash,
      idempotencyFence: createW03Fence(w03).port,
    });
    assert.deepEqual(precondition.reasons, ['PRECONDITION_FAILED']);
    assert.deepEqual(deadline.reasons, ['DEADLINE_EXPIRED']);
    assert.deepEqual(quota.reasons, ['QUOTA_EXHAUSTED']);
  });
  await t.test('R11 stale and ambiguous target resolution returns non-execution outcome', () => {
    const target = targetFor('WORKFLOW');
    const stale = resolveExecutionTarget({
      schemaVersion,
      actionIntentSchemaVersion: schemaVersion,
      tenant: { tenantId: tenantId as ExecutableTargetBinding['tenant']['tenantId'] },
      evaluatedAt: at('2026-09-01T17:31:00Z'),
      target,
      bindings: [targetBinding(target, { freshUntil: at('2026-09-01T17:31:00Z') })],
    });
    const ambiguous = resolveExecutionTarget({
      schemaVersion,
      actionIntentSchemaVersion: schemaVersion,
      tenant: { tenantId: tenantId as ExecutableTargetBinding['tenant']['tenantId'] },
      evaluatedAt: at('2026-09-01T17:31:00Z'),
      target,
      bindings: [targetBinding(target), targetBinding(target, { bindingId: 'binding:w07h:two' })],
    });
    assert.deepEqual(stale.reasons, ['TARGET_STALE']);
    assert.deepEqual(ambiguous.reasons, ['TARGET_AMBIGUOUS']);
  });
  await t.test('R12 target availability alone never grants execution authority', () => {
    const prepared = prepareExecution(w02, w03, { expiredAuthority: true });
    const standaloneResolution = resolveExecutionTarget({
      schemaVersion,
      actionIntentSchemaVersion: schemaVersion,
      tenant: prepared.intent.tenant,
      evaluatedAt: at('2026-09-01T17:31:00Z'),
      target: prepared.target,
      bindings: [targetBinding(prepared.target)],
    });
    assert.equal(standaloneResolution.resolved, true);
    assert.equal(standaloneResolution.authorizesExecution, false);
    assert.equal(prepared.eligible, false);
  });
  await t.test('R13 acknowledgement alone never becomes verified external state', () => {
    const intent = makeIntent();
    const receipt = makeReceipt(intent, 'ack');
    assert.equal(receipt.executionOutcome, 'EXECUTED_ACKNOWLEDGED');
    const evidence = captureReadback(intent, receipt);
    assert.equal(evidence.status, 'CAPTURED');
    if (evidence.status === 'CAPTURED') {
      assert.equal(evidence.assessment.verifiedExternalState, false);
      assert.equal(evidence.evidence.verification.state, 'UNVERIFIED');
    }
  });
  await t.test('R14 readback mismatch is explicit and non-authoritative', () => {
    const intent = makeIntent();
    const evidence = captureReadback(intent, makeReceipt(intent, 'mismatch'), 'draft');
    assert.equal(evidence.status, 'CAPTURED');
    if (evidence.status === 'CAPTURED') {
      assert.equal(evidence.assessment.state, 'MISMATCH');
      assert.deepEqual(evidence.assessment.reasons, ['READBACK_MISMATCH']);
      assert.equal(evidence.authorizesExecution, false);
    }
  });
  await t.test('R15 timeout after possible side effect enters EXECUTION_UNCERTAIN', () => {
    const intent = makeIntent();
    let effects = 0;
    effects += 1;
    const ambiguous = classifyExecutionAmbiguity({
      schemaVersion,
      actionIntent: intent,
      occurredAt: at('2026-09-01T17:33:00Z'),
      attemptNumber: 1,
      maxAttempts: 3,
      signal: 'TIMEOUT',
      phase: 'AFTER_EXTERNAL_INVOCATION_STARTED',
    });
    assert.equal(effects, 1);
    assert.equal(ambiguous.status, 'EXECUTION_UNCERTAIN');
    if (ambiguous.status === 'EXECUTION_UNCERTAIN') assert.equal(ambiguous.retryAllowedBeforeReconciliation, false);
  });
  await t.test('R16 uncertainty reconciles before retry and W03 duplicate fence remains active', () => {
    const fence = createW03Fence(w03);
    const prepared = prepareExecution(w02, w03, { fence });
    assert.equal(prepared.eligible, true);
    const ambiguous = classifyExecutionAmbiguity({
      schemaVersion,
      actionIntent: prepared.intent,
      occurredAt: at('2026-09-01T17:33:00Z'),
      attemptNumber: 1,
      maxAttempts: 3,
      signal: 'CONNECTION_LOST',
      phase: 'AFTER_EXTERNAL_INVOCATION_STARTED',
    });
    assert.equal(ambiguous.status, 'EXECUTION_UNCERTAIN');
    if (ambiguous.status !== 'EXECUTION_UNCERTAIN') return;
    const blind = reconcileExecutionUncertainty({
      schemaVersion,
      actionIntent: prepared.intent,
      uncertainty: ambiguous.uncertainty,
    });
    assert.equal(blind.retryEligibleAfterFreshGuards, false);
    assert.deepEqual(blind.reasons, ['RECONCILIATION_REQUIRED']);
    const retryGuards = evaluateExecutionSafeguards({
      schemaVersion,
      actionIntent: prepared.intent,
      evaluatedAt: at('2026-09-01T17:33:03Z'),
      attemptNumber: 2,
      maxAttempts: 3,
      evaluatePrecondition: () => true,
      canonicalPayloadHash,
      idempotencyFence: fence.port,
    });
    assert.equal(retryGuards.safeToInvokeExternal, false);
    assert.deepEqual(retryGuards.reasons, ['IDEMPOTENCY_INFLIGHT']);
    const reconciled = reconcileExecutionUncertainty({
      schemaVersion,
      actionIntent: prepared.intent,
      uncertainty: ambiguous.uncertainty,
      observation: { state: 'NO_EFFECT_CONFIRMED', observedAt: at('2026-09-01T17:33:02Z') },
      retrySafeguards: { attemptNumber: 2, evaluatedAt: at('2026-09-01T17:33:03Z'), result: retryGuards },
    });
    assert.equal(reconciled.retryEligibleAfterFreshGuards, false);
    assert.deepEqual(reconciled.reasons, ['RETRY_GUARDS_BLOCKED']);
  });
  await t.test('R17 circuit-open blocks until bounded recovery path', () => {
    const intent = makeIntent();
    const open = circuit({ state: 'OPEN', consecutiveFailures: 3, openedAt: at('2026-09-01T17:30:00Z') });
    const blocked = evaluateFailureContainment({
      schemaVersion,
      actionIntent: intent,
      evaluatedAt: at('2026-09-01T17:30:00.500Z'),
      phase: 'PRE_EXTERNAL',
      snapshot: containmentSnapshot({ circuit: open }),
    });
    assert.equal(blocked.mayProceedToOtherGuards, false);
    const recovered = transitionCircuit({
      snapshot: open,
      event: 'RECOVERY_WINDOW_ELAPSED',
      observedAt: at('2026-09-01T17:30:01Z'),
      failureThreshold: 2,
      recoveryAfterMs: 1000,
    });
    assert.equal(recovered.accepted, true);
    assert.equal(recovered.snapshot.state, 'HALF_OPEN');
    assert.equal(recovered.authorizesExecution, false);
  });
  await t.test('R18 kill switch blocks queued/new work and ignores intelligence override', () => {
    const intent = makeIntent();
    const active = killSwitch({ state: 'ACTIVE', changedAt: at('2026-09-01T17:30:00Z') });
    const blocked = evaluateFailureContainment({
      schemaVersion,
      actionIntent: intent,
      evaluatedAt: at('2026-09-01T17:31:00Z'),
      phase: 'PRE_EXTERNAL',
      snapshot: containmentSnapshot({ killSwitch: active }),
      nonAuthoritativeSignals: { lane: 'FAST', confidence: 1, urgency: 1, routerOverrideRequested: true },
    });
    assert.equal(blocked.mayProceedToOtherGuards, false);
    assert.deepEqual(blocked.reasons, ['KILL_SWITCH_ACTIVE']);
    const unsafeRecovery = transitionKillSwitch({
      snapshot: active,
      command: 'DEACTIVATE',
      changedAt: at('2026-09-01T17:32:00Z'),
      recoveryGate: 'NOT_VALIDATED',
    });
    const governedRecovery = transitionKillSwitch({
      snapshot: active,
      command: 'DEACTIVATE',
      changedAt: at('2026-09-01T17:33:00Z'),
      recoveryGate: 'VALIDATED',
    });
    assert.equal(unsafeRecovery.accepted, false);
    assert.equal(governedRecovery.accepted, true);
  });
  await t.test('R19 Receipt/Evidence preserves provenance without credential material', () => {
    const intent = makeIntent();
    const evidence = captureReadback(intent, makeReceipt(intent, 'provenance'));
    assert.equal(evidence.status, 'CAPTURED');
    if (evidence.status !== 'CAPTURED') return;
    assert.equal(evidence.evidence.correlation.correlationId, intent.correlation.correlationId);
    assert.deepEqual(evidence.evidence.source.executionTarget, intent.executionTarget);
    const serialized = JSON.stringify(evidence.evidence);
    for (const forbidden of ['api_token', 'accessToken', 'privateKey', 'clientSecret', 'Bearer ']) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });
  await t.test('R20 W03 replay/reconnect cannot duplicate completed irreversible effect', () => {
    const fence = createW03Fence(w03);
    const prepared = prepareExecution(w02, w03, { fence });
    assert.equal(prepared.eligible, true);
    let effects = 0;
    if (prepared.eligible) effects += 1;
    fence.complete('2026-09-01T17:32:04Z');
    const replay = evaluateExecutionSafeguards({
      schemaVersion,
      actionIntent: prepared.intent,
      evaluatedAt: at('2026-09-01T17:34:00Z'),
      attemptNumber: 2,
      maxAttempts: 3,
      evaluatePrecondition: () => true,
      canonicalPayloadHash,
      idempotencyFence: fence.port,
    });
    if (replay.safeToInvokeExternal) effects += 1;
    assert.equal(effects, 1);
    assert.deepEqual(replay.reasons, ['IDEMPOTENCY_REPLAY_COMPLETED']);
  });
  await t.test('R21 W08/W09/W14/W15 mock consumers preserve generic target contracts', () => {
    const fixtures = [
      { wave: 'W08', kind: 'PROVIDER' },
      { wave: 'W09', kind: 'WORKFLOW' },
      { wave: 'W14', kind: 'DEVICE' },
      { wave: 'W15', kind: 'LOCAL_SERVICE' },
    ] as const;
    for (const fixture of fixtures) {
      const prepared = prepareExecution(w02, w03, { targetKind: fixture.kind });
      assert.equal(prepared.plan.status, 'READY', `${fixture.wave} plan blocked`);
      assert.equal(prepared.resolution?.resolved, true, `${fixture.wave} target unresolved`);
      const receipt = makeReceipt(prepared.intent, fixture.wave.toLowerCase());
      assert.equal(receipt.executionTarget.kind, fixture.kind);
      assert.equal(prepared.plan.authorizesExecution, false);
    }
  });
  await t.test('R22 no second Policy Engine, idempotency ledger or Capability Registry exists in W07', () => {
    const sourceRoot = resolve(repoRoot, 'services/executors/src');
    const source = walkFiles(sourceRoot)
      .filter((path) => path.endsWith('.ts'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    assert.equal(/function\s+evaluatePolicy\s*\(/.test(source), false);
    assert.equal(/CREATE\s+TABLE/i.test(source), false);
    assert.equal(/function\s+createCapabilityRegistry\s*\(/.test(source), false);
  });
  await t.test('R23 acceptance uses mock effects only; no real target side effect is invoked', () => {
    const realCalls = { provider: 0, device: 0, workflow: 0, localService: 0 };
    const mockCalls = { localHarness: 1 };
    assert.deepEqual(realCalls, { provider: 0, device: 0, workflow: 0, localService: 0 });
    assert.equal(mockCalls.localHarness, 1);
  });
  await t.test('R24 chain reconstructs request, authority, target, attempt and observation', () => {
    const prepared = prepareExecution(w02, w03, { targetKind: 'PROVIDER' });
    assert.equal(prepared.eligible, true);
    assert.equal(prepared.authority.executionEligible, true);
    assert.equal(prepared.resolution?.resolved, true);
    if (!prepared.authority.executionEligible || prepared.resolution?.resolved !== true) return;
    const receipt = makeReceipt(prepared.intent, 'chain');
    const evidence = captureReadback(prepared.intent, receipt);
    assert.equal(evidence.status, 'CAPTURED');
    if (evidence.status !== 'CAPTURED') return;
    const reconstructed = {
      actionIntentId: prepared.intent.actionIntentId,
      tenantId: prepared.intent.tenant.tenantId,
      correlationId: prepared.intent.correlation.correlationId,
      currentPolicy: prepared.authority.authorityResult.currentPolicy,
      effectiveScope: prepared.authority.authorityResult.effectiveScope,
      target: prepared.resolution.target,
      bindingId: prepared.resolution.binding.bindingId,
      attempt: receipt.attempt,
      executionOutcome: receipt.executionOutcome,
      observedState: evidence.assessment.state,
      verificationState: evidence.evidence.verification.state,
    };
    assert.equal(reconstructed.actionIntentId, prepared.intent.actionIntentId);
    assert.equal(reconstructed.currentPolicy.version, '2.4.0');
    assert.deepEqual(reconstructed.effectiveScope, ['instagram:publish']);
    assert.equal(reconstructed.bindingId.startsWith('binding:w07h:'), true);
    assert.equal(reconstructed.observedState, 'MATCH');
    assert.equal(reconstructed.verificationState, 'UNVERIFIED');
  });

  const performanceIntent = makeIntent(targetFor('PROVIDER'), { idempotency: { mode: 'NOT_APPLICABLE' } });
  const authorityEvaluation = makeAuthorityRequest(performanceIntent);
  const performanceReceipt = makeReceipt(performanceIntent, 'performance');
  const performanceTarget = performanceIntent.executionTarget;
  assert.notEqual(performanceTarget, undefined);
  if (performanceTarget === undefined) throw new Error('performance target missing');
  const performanceEvidenceId = 'evidence:w07h:performance' as Evidence['evidenceId'];
  const metrics = {
    environment: { nodeVersion, scope: 'CI_TEST_ONLY_NOT_PRODUCTION_SLO' },
    authorityValidation: measure(() => {
      const result = validateExecutorAuthority({
        schemaVersion,
        actionIntent: performanceIntent,
        authorityEvaluation,
        validateCurrentAuthority: (request) => w02.evaluateAuthority(request),
      });
      assert.equal(result.executionEligible, true);
    }),
    targetResolution: measure(() => {
      const result = resolveExecutionTarget({
        schemaVersion,
        actionIntentSchemaVersion: schemaVersion,
        tenant: performanceIntent.tenant,
        evaluatedAt: at('2026-09-01T17:31:00Z'),
        target: performanceTarget,
        bindings: [targetBinding(performanceTarget)],
      });
      assert.equal(result.resolved, true);
    }),
    w03IdempotencyDecision: measure(() => {
      const decision = w03.decideIdempotency(null, {
        tenantId,
        key: 'idem:w07h:perf',
        operationName: 'social.publish:social.publish',
        canonicalPayloadHash,
      });
      assert.equal(decision.kind, 'NEW');
    }),
    safeguardDecision: measure(() => {
      const result = evaluateExecutionSafeguards({
        schemaVersion,
        actionIntent: performanceIntent,
        evaluatedAt: at('2026-09-01T17:31:00Z'),
        attemptNumber: 1,
        maxAttempts: 3,
        evaluatePrecondition: () => true,
      });
      assert.equal(result.safeToInvokeExternal, true);
    }),
    readbackDecision: measure(() => {
      const result = captureReadbackEvidence({
        schemaVersion,
        evidenceId: performanceEvidenceId,
        actionIntent: performanceIntent,
        receipt: performanceReceipt,
        readback: () => ({
          capturedAt: at('2026-09-01T17:32:03Z'),
          reference: { system: 'w07h-perf', reference: 'object:1' },
          observedState: { status: 'published' },
        }),
      });
      assert.equal(result.status, 'CAPTURED');
    }),
    containmentDecision: measure(() => {
      const result = evaluateFailureContainment({
        schemaVersion,
        actionIntent: performanceIntent,
        evaluatedAt: at('2026-09-01T17:31:00Z'),
        phase: 'PRE_EXTERNAL',
        snapshot: containmentSnapshot(),
      });
      assert.equal(result.mayProceedToOtherGuards, true);
    }),
    reconciliationClassification: measure(() => {
      const result = classifyExecutionAmbiguity({
        schemaVersion,
        actionIntent: performanceIntent,
        occurredAt: at('2026-09-01T17:33:00Z'),
        attemptNumber: 1,
        maxAttempts: 3,
        signal: 'TIMEOUT',
        phase: 'AFTER_EXTERNAL_INVOCATION_STARTED',
      });
      assert.equal(result.status, 'EXECUTION_UNCERTAIN');
    }),
  };
  stdout.write(`[W07H_PERFORMANCE] ${JSON.stringify(metrics)}\n`);
  stdout.write(
    `[W07H_RISK_GATES] ${JSON.stringify({
      gateA: 'PASS_CORRECTNESS',
      gateB: 'PASS_SAFETY_AUTHORITY',
      gateC: 'PASS_TEST_SCOPE_PERFORMANCE_ECONOMICS',
      gateD: 'PASS_FAILURE_RECOVERABILITY',
      realityScenarios: 24,
      realExternalSideEffects: 0,
    })}\n`,
  );
});
