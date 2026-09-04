// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';
import type { CorrelationId, TenantId } from '@aurora/contracts';
import {
  planMetaAdsDomainIntent,
  type MetaAdsCapabilityPlan,
  type MetaAdsOperation,
  type MetaAdsResourceKind,
} from '../src/meta-ads/contracts.js';
import {
  executeMetaAdsGovernedOperation,
  type MetaAdsGovernedOperationInput,
  type MetaAdsW08GovernedWriteRequest,
  type MetaAdsW08WritePort,
  type MetaAdsW08WriteResult,
} from '../src/meta-ads/governed-operations.js';
import {
  prepareMetaAdsFinancialMutation,
  type MetaAdsFinancialGovernanceInput,
  type MetaAdsFinancialOperation,
} from '../src/meta-ads/financial-governance.js';

const TENANT = 'ten_01JW12DTENANT000000000000' as TenantId;
const CORRELATION = 'cor_01JW12DCORRELATION0000000' as CorrelationId;
const NOW = 1_800_000_000_000;

function expectedState(operation: MetaAdsOperation): string {
  if (operation === 'CREATE_PAUSED') return 'ABSENT';
  if (operation === 'PAUSE') return 'ACTIVE';
  return 'PAUSED';
}

function domainPlan(
  operation: MetaAdsOperation = 'CREATE_PAUSED',
  resourceKind: MetaAdsResourceKind = 'CAMPAIGN',
): MetaAdsCapabilityPlan {
  const result = planMetaAdsDomainIntent({
    tenantId: TENANT,
    correlationId: CORRELATION,
    intentId: `intent-w12d-${resourceKind.toLowerCase()}-${operation.toLowerCase()}`,
    resourceKind,
    operation,
    providerBindingReference: 'w08:meta:binding-1',
    adAccountExternalId: 'act_123456789',
    target:
      operation === 'CREATE_PAUSED'
        ? {}
        : {
            meta: {
              provider: 'META_ADS',
              resourceKind,
              externalId: `${resourceKind.toLowerCase()}-42`,
            },
          },
    capability: {
      source: 'W04_CAPABILITY_REGISTRY',
      capabilityId: `meta-ads:${operation.toLowerCase()}`,
      registryVersion: 'w04-v7',
      targetKind: 'PROVIDER',
      compatibilityKey: 'meta-ads',
      authorizesExecution: false,
    },
    ...(operation === 'ACTIVATE' ||
    operation === 'SET_BUDGET' ||
    operation === 'SET_BID' ||
    operation === 'WIDEN_TARGETING'
      ? {
          financialScope: {
            currency: 'BRL',
            ceilingMinor: 5_000_000,
            horizon: 'DAILY' as const,
          },
        }
      : {}),
    expectedProviderState: expectedState(operation),
  });
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') throw new Error('fixture must produce a W12-A plan');
  return result.plan;
}

function input(
  operation: MetaAdsOperation = 'CREATE_PAUSED',
  overrides: Partial<MetaAdsGovernedOperationInput> = {},
): MetaAdsGovernedOperationInput {
  const plan = domainPlan(operation);
  return {
    nowMs: NOW,
    plan,
    actionIntentId: `action-w12d-${operation.toLowerCase()}`,
    idempotencyKey: `idem:w12d:${operation.toLowerCase()}:1`,
    payloadReference: `payload:w12d:${operation.toLowerCase()}:1`,
    executionProof: {
      source: 'W07_PROVIDER_EXECUTION_PROOF',
      actionIntentId: `action-w12d-${operation.toLowerCase()}`,
      currentAuthorityValidated: true,
      executionEligible: true,
      authorizesExecution: false,
    },
    precheck: {
      source: 'W08_PROVIDER_PRECHECK',
      tenantId: TENANT,
      providerBindingReference: plan.providerBindingReference,
      adAccountExternalId: plan.adAccountExternalId,
      bindingState: 'ACTIVE',
      verificationState: 'VERIFIED',
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 30_000,
      expectedResourceState: operation === 'CREATE_PAUSED' ? null : expectedState(operation),
      authorizesExecution: false,
    },
    ...overrides,
  };
}

function port(
  outcome: MetaAdsW08WriteResult,
  seen: MetaAdsW08GovernedWriteRequest[] = [],
): MetaAdsW08WritePort {
  return {
    source: 'W08_GOVERNED_PROVIDER_WRITE',
    async writeOnce(request) {
      seen.push(request);
      return outcome;
    },
  };
}

function financialInput(plan: MetaAdsCapabilityPlan): MetaAdsFinancialGovernanceInput {
  return {
    nowMs: NOW,
    plan,
    proposedFinancialExposureMinor: 2_500_000,
    precheck: {
      source: 'W08_PROVIDER_PRECHECK',
      tenantId: TENANT,
      providerBindingReference: plan.providerBindingReference,
      adAccountExternalId: plan.adAccountExternalId,
      bindingState: 'ACTIVE',
      verificationState: 'VERIFIED',
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
    authority: {
      source: 'W02_AUTHORITY_EVALUATION',
      tenantId: TENANT,
      providerBindingReference: plan.providerBindingReference,
      adAccountExternalId: plan.adAccountExternalId,
      capabilityId: plan.capability.capabilityId,
      operation: plan.operation as MetaAdsFinancialOperation,
      authorized: true,
      approvalReference: 'approval:w12d:1',
      currency: 'BRL',
      financialCeilingMinor: 4_000_000,
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
    budget: {
      source: 'W04_BUDGET_CONTROL',
      tenantId: TENANT,
      providerBindingReference: plan.providerBindingReference,
      adAccountExternalId: plan.adAccountExternalId,
      currency: 'BRL',
      remainingMinor: 10_000_000,
      maxOperationMinor: 3_000_000,
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
    mutationWindow: {
      source: 'W04_MUTATION_BOUNDS',
      tenantId: TENANT,
      providerBindingReference: plan.providerBindingReference,
      adAccountExternalId: plan.adAccountExternalId,
      operation: plan.operation as MetaAdsFinancialOperation,
      windowReference: 'w04:mutation-window:w12d',
      committedMutations: 0,
      maxMutations: 2,
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
  };
}

test('W12-D executes exactly one paused create through W08 with idempotency and readback', async () => {
  const seen: MetaAdsW08GovernedWriteRequest[] = [];
  const result = await executeMetaAdsGovernedOperation(
    input(),
    port(
      {
        ok: true,
        providerReference: 'campaign-77',
        providerRevision: 'rev-1',
        requiresReadback: true,
      },
      seen,
    ),
  );
  assert.equal(result.status, 'ACKNOWLEDGED_PENDING_READBACK');
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.source, 'W12_TO_W08_GOVERNED_WRITE');
  assert.equal(seen[0]?.safeMode, 'PAUSED');
  assert.equal(seen[0]?.operation, 'CREATE_PAUSED');
  assert.equal(seen[0]?.idempotencyKey, 'idem:w12d:create_paused:1');
  assert.equal(seen[0]?.maxProviderMutationAttempts, 1);
  assert.equal(seen[0]?.requiresReadback, true);
  assert.equal(seen[0]?.authorizesExecution, false);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.canGrantRetry, false);
});

test('W12-D requires paused provider state before metadata or financial changes', async () => {
  const base = input('UPDATE_METADATA');
  const mismatch = await executeMetaAdsGovernedOperation(
    {
      ...base,
      precheck: { ...base.precheck, expectedResourceState: 'ACTIVE' },
    },
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(mismatch.status, 'BLOCKED');
  if (mismatch.status === 'BLOCKED') assert.equal(mismatch.code, 'EXPECTED_STATE_MISMATCH');

  const unsafePlan = { ...base.plan, expectedProviderState: 'ACTIVE' };
  const pausedRequired = await executeMetaAdsGovernedOperation(
    {
      ...base,
      plan: unsafePlan,
      precheck: { ...base.precheck, expectedResourceState: 'ACTIVE' },
    },
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(pausedRequired.status, 'BLOCKED');
  if (pausedRequired.status === 'BLOCKED') assert.equal(pausedRequired.code, 'PAUSED_STATE_REQUIRED');
});

test('W12-D allows an idempotent PAUSE safety transition from an active resource', async () => {
  const seen: MetaAdsW08GovernedWriteRequest[] = [];
  const result = await executeMetaAdsGovernedOperation(
    input('PAUSE'),
    port({ ok: true, providerReference: 'campaign-42', requiresReadback: true }, seen),
  );
  assert.equal(result.status, 'ACKNOWLEDGED_PENDING_READBACK');
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.operation, 'PAUSE');
  assert.equal(seen[0]?.expectedResourceState, 'ACTIVE');
  assert.equal(seen[0]?.safeMode, 'PAUSED');
});

test('W12-D keeps activation, destructive delete and non-serving-object resources outside its lane', async () => {
  const activation = await executeMetaAdsGovernedOperation(
    input('ACTIVATE'),
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(activation.status, 'BLOCKED');
  if (activation.status === 'BLOCKED') assert.equal(activation.code, 'UNSUPPORTED_ACTIVATION');

  const deletion = await executeMetaAdsGovernedOperation(
    input('DELETE'),
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(deletion.status, 'BLOCKED');
  if (deletion.status === 'BLOCKED') {
    assert.equal(deletion.code, 'DESTRUCTIVE_OPERATION_NOT_SUPPORTED');
  }

  const audiencePlan = domainPlan('UPDATE_METADATA', 'AUDIENCE');
  const audience = await executeMetaAdsGovernedOperation(
    {
      ...input('UPDATE_METADATA'),
      plan: audiencePlan,
      precheck: {
        ...input('UPDATE_METADATA').precheck,
        providerBindingReference: audiencePlan.providerBindingReference,
        adAccountExternalId: audiencePlan.adAccountExternalId,
      },
    },
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(audience.status, 'BLOCKED');
  if (audience.status === 'BLOCKED') assert.equal(audience.code, 'UNSUPPORTED_RESOURCE_KIND');
});

test('W12-D requires the accepted W12-E financial mutation plan for budget/targeting writes', async () => {
  const base = input('SET_BUDGET');
  const missing = await executeMetaAdsGovernedOperation(
    base,
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(missing.status, 'BLOCKED');
  if (missing.status === 'BLOCKED') assert.equal(missing.code, 'FINANCIAL_GOVERNANCE_REQUIRED');

  const governed = prepareMetaAdsFinancialMutation(financialInput(base.plan));
  assert.equal(governed.status, 'READY');
  if (governed.status !== 'READY') return;
  const executed = await executeMetaAdsGovernedOperation(
    { ...base, financialMutation: governed.plan },
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(executed.status, 'ACKNOWLEDGED_PENDING_READBACK');
});

test('W12-D delegates rate-limit and duplicate-style conflict retry decisions to W07 without retrying', async () => {
  const seen: MetaAdsW08GovernedWriteRequest[] = [];
  const limited = await executeMetaAdsGovernedOperation(
    input(),
    port(
      { ok: false, error: 'RATE_LIMITED', mutationPossible: false, retryAfterMs: 10_000 },
      seen,
    ),
  );
  assert.equal(limited.status, 'FAILED_NOT_EXECUTED');
  if (limited.status !== 'FAILED_NOT_EXECUTED') return;
  assert.equal(limited.retryAfterMs, 10_000);
  assert.equal(limited.retryDecisionOwner, 'W07');
  assert.equal(limited.canGrantRetry, false);
  assert.equal(seen.length, 1);

  const conflict = await executeMetaAdsGovernedOperation(
    input(),
    port({ ok: false, error: 'CONFLICT', mutationPossible: false }),
  );
  assert.equal(conflict.status, 'FAILED_NOT_EXECUTED');
  if (conflict.status === 'FAILED_NOT_EXECUTED') assert.equal(conflict.retryDecisionOwner, 'W07');
});

test('W12-D preserves ambiguous or partial write outcomes as EXECUTION_UNCERTAIN', async () => {
  const ambiguous = await executeMetaAdsGovernedOperation(
    input(),
    port({
      ok: false,
      error: 'AMBIGUOUS_WRITE',
      mutationPossible: true,
      providerReference: 'campaign-77',
    }),
  );
  assert.equal(ambiguous.status, 'EXECUTION_UNCERTAIN');
  if (ambiguous.status !== 'EXECUTION_UNCERTAIN') return;
  assert.equal(ambiguous.requiresReconciliation, true);
  assert.equal(ambiguous.retryBoundary, 'W07_RECONCILE_BEFORE_RETRY');
  assert.equal(ambiguous.canGrantRetry, false);
});

test('W12-D treats thrown transport errors and missing required readback as uncertain', async () => {
  const throwing: MetaAdsW08WritePort = {
    source: 'W08_GOVERNED_PROVIDER_WRITE',
    async writeOnce() {
      throw new Error('connection lost after request transmission');
    },
  };
  const thrown = await executeMetaAdsGovernedOperation(input(), throwing);
  assert.equal(thrown.status, 'EXECUTION_UNCERTAIN');
  if (thrown.status === 'EXECUTION_UNCERTAIN') {
    assert.equal(thrown.retryBoundary, 'W07_RECONCILE_BEFORE_RETRY');
  }

  const protocol = await executeMetaAdsGovernedOperation(
    input(),
    port({ ok: true, requiresReadback: false }),
  );
  assert.equal(protocol.status, 'EXECUTION_UNCERTAIN');
  if (protocol.status === 'EXECUTION_UNCERTAIN') {
    assert.equal(protocol.error, 'READBACK_PROTOCOL_VIOLATION');
  }
});

test('W12-D fails closed on stale/cross-account W08 evidence and mismatched W07 proof', async () => {
  const base = input();
  const stale = await executeMetaAdsGovernedOperation(
    {
      ...base,
      precheck: { ...base.precheck, validUntilMs: NOW },
    },
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(stale.status, 'BLOCKED');
  if (stale.status === 'BLOCKED') assert.equal(stale.code, 'PRECHECK_STALE');

  const wrongAccount = await executeMetaAdsGovernedOperation(
    {
      ...base,
      precheck: { ...base.precheck, adAccountExternalId: 'act_wrong' },
    },
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(wrongAccount.status, 'BLOCKED');
  if (wrongAccount.status === 'BLOCKED') assert.equal(wrongAccount.code, 'ACCOUNT_SCOPE_MISMATCH');

  const wrongProof = await executeMetaAdsGovernedOperation(
    {
      ...base,
      executionProof: { ...base.executionProof, actionIntentId: 'action-other' },
    },
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(wrongProof.status, 'BLOCKED');
  if (wrongProof.status === 'BLOCKED') assert.equal(wrongProof.code, 'EXECUTION_PROOF_MISMATCH');
});

test('W12-D refuses direct/non-W08 mutation ports and missing idempotency references', async () => {
  let calls = 0;
  const directPort = {
    source: 'DIRECT_META_PROVIDER',
    async writeOnce() {
      calls += 1;
      return { ok: true, requiresReadback: true } as const;
    },
  } as unknown as MetaAdsW08WritePort;
  const direct = await executeMetaAdsGovernedOperation(input(), directPort);
  assert.equal(direct.status, 'BLOCKED');
  if (direct.status === 'BLOCKED') assert.equal(direct.code, 'W08_WRITE_PORT_REQUIRED');
  assert.equal(calls, 0);

  const base = input();
  const missingIdempotency = await executeMetaAdsGovernedOperation(
    { ...base, idempotencyKey: '   ' },
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(missingIdempotency.status, 'BLOCKED');
  if (missingIdempotency.status === 'BLOCKED') {
    assert.equal(missingIdempotency.code, 'INVALID_REFERENCE');
  }
});
