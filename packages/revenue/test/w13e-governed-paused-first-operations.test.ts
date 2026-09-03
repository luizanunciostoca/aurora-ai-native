// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';
import type { CorrelationId, TenantId } from '@aurora/contracts';
import {
  planGoogleAdsDomainIntent,
  type GoogleAdsCapabilityPlan,
  type GoogleAdsOperation,
} from '../src/google-ads/contracts.js';
import {
  executeGoogleAdsGovernedOperation,
  type GoogleAdsGovernedOperationInput,
  type GoogleAdsW08GovernedWriteRequest,
  type GoogleAdsW08WritePort,
  type GoogleAdsW08WriteResult,
} from '../src/google-ads/governed-operations.js';
import {
  prepareGoogleAdsFinancialMutation,
  type GoogleAdsFinancialGovernanceInput,
} from '../src/google-ads/financial-governance.js';

const TENANT = 'ten_01JW13ETENANT000000000000' as TenantId;
const CORRELATION = 'cor_01JW13ECORRELATION0000000' as CorrelationId;
const NOW = 1_800_000_000_000;

function domainPlan(operation: GoogleAdsOperation = 'CREATE_PAUSED'): GoogleAdsCapabilityPlan {
  const result = planGoogleAdsDomainIntent({
    tenantId: TENANT,
    correlationId: CORRELATION,
    intentId: `intent-w13e-${operation.toLowerCase()}`,
    surface: 'SEARCH',
    resourceKind: 'CAMPAIGN',
    operation,
    providerBindingReference: 'w08:google-ads:binding-1',
    customerId: '1234567890',
    managerCustomerId: '9988776655',
    target:
      operation === 'CREATE_PAUSED'
        ? {}
        : {
            googleAds: {
              provider: 'GOOGLE_ADS',
              resourceKind: 'CAMPAIGN',
              customerId: '1234567890',
              managerCustomerId: '9988776655',
              resourceName: 'customers/1234567890/campaigns/42',
            },
          },
    capability: {
      source: 'W04_CAPABILITY_REGISTRY',
      capabilityId: `google-ads:${operation.toLowerCase()}`,
      registryVersion: 'w04-v7',
      targetKind: 'PROVIDER',
      compatibilityKey: 'google-ads',
      authorizesExecution: false,
    },
    ...(operation === 'SET_BUDGET' || operation === 'SET_BID' || operation === 'ACTIVATE'
      ? {
          financialScope: {
            currency: 'BRL',
            ceilingMicros: 50_000_000,
            horizon: 'DAILY' as const,
          },
        }
      : {}),
    expectedProviderState: operation === 'CREATE_PAUSED' ? 'ABSENT' : 'PAUSED',
  });
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') throw new Error('fixture must produce a W13-A plan');
  return result.plan;
}

function input(
  operation: GoogleAdsOperation = 'CREATE_PAUSED',
  overrides: Partial<GoogleAdsGovernedOperationInput> = {},
): GoogleAdsGovernedOperationInput {
  const plan = domainPlan(operation);
  return {
    nowMs: NOW,
    plan,
    actionIntentId: `action-w13e-${operation.toLowerCase()}`,
    idempotencyKey: `idem:w13e:${operation.toLowerCase()}:1`,
    payloadReference: `payload:w13e:${operation.toLowerCase()}:1`,
    executionProof: {
      source: 'W07_PROVIDER_EXECUTION_PROOF',
      actionIntentId: `action-w13e-${operation.toLowerCase()}`,
      currentAuthorityValidated: true,
      executionEligible: true,
      authorizesExecution: false,
    },
    precheck: {
      source: 'W08_PROVIDER_PRECHECK',
      tenantId: TENANT,
      providerBindingReference: plan.providerBindingReference,
      customerId: plan.customerId,
      ...(plan.managerCustomerId ? { managerCustomerId: plan.managerCustomerId } : {}),
      bindingState: 'ACTIVE',
      verificationState: 'VERIFIED',
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 30_000,
      expectedResourceState: operation === 'CREATE_PAUSED' ? null : 'PAUSED',
      authorizesExecution: false,
    },
    ...overrides,
  };
}

function port(
  outcome: GoogleAdsW08WriteResult,
  seen: GoogleAdsW08GovernedWriteRequest[] = [],
): GoogleAdsW08WritePort {
  return {
    source: 'W08_GOVERNED_PROVIDER_WRITE',
    async writeOnce(request) {
      seen.push(request);
      return outcome;
    },
  };
}

function financialInput(plan: GoogleAdsCapabilityPlan): GoogleAdsFinancialGovernanceInput {
  const manager = plan.managerCustomerId ? { managerCustomerId: plan.managerCustomerId } : {};
  return {
    nowMs: NOW,
    plan,
    proposedMicros: 25_000_000,
    precheck: {
      source: 'W08_PROVIDER_PRECHECK',
      tenantId: TENANT,
      providerBindingReference: plan.providerBindingReference,
      customerId: plan.customerId,
      ...manager,
      bindingState: 'ACTIVE',
      verificationState: 'VERIFIED',
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
    authority: {
      source: 'W02_AUTHORITY_EVALUATION',
      tenantId: TENANT,
      capabilityId: plan.capability.capabilityId,
      providerBindingReference: plan.providerBindingReference,
      customerId: plan.customerId,
      ...manager,
      operation: plan.operation as 'SET_BUDGET' | 'SET_BID',
      authorized: true,
      approvalReference: 'approval:w13e:1',
      currency: 'BRL',
      financialCeilingMicros: 40_000_000,
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
    budget: {
      source: 'W04_BUDGET_CONTROL',
      tenantId: TENANT,
      providerBindingReference: plan.providerBindingReference,
      customerId: plan.customerId,
      ...manager,
      currency: 'BRL',
      remainingMicros: 100_000_000,
      maxOperationMicros: 30_000_000,
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
    mutationWindow: {
      source: 'W04_MUTATION_BOUNDS',
      tenantId: TENANT,
      providerBindingReference: plan.providerBindingReference,
      customerId: plan.customerId,
      ...manager,
      operation: plan.operation as 'SET_BUDGET' | 'SET_BID',
      windowReference: 'w04:mutation-window:w13e',
      committedMutations: 0,
      maxMutations: 2,
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
  };
}

test('W13-E executes exactly one paused create through the W08 port and requires readback', async () => {
  const seen: GoogleAdsW08GovernedWriteRequest[] = [];
  const result = await executeGoogleAdsGovernedOperation(
    input(),
    port(
      {
        ok: true,
        providerReference: 'customers/1234567890/campaigns/77',
        providerRevision: 'rev-1',
        requiresReadback: true,
      },
      seen,
    ),
  );
  assert.equal(result.status, 'ACKNOWLEDGED_PENDING_READBACK');
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.safeMode, 'PAUSED');
  assert.equal(seen[0]?.operation, 'CREATE_PAUSED');
  assert.equal(seen[0]?.maxProviderMutationAttempts, 1);
  assert.equal(seen[0]?.authorizesExecution, false);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.canGrantRetry, false);
});

test('W13-E blocks update operations unless provider precheck proves a paused resource', async () => {
  const base = input('UPDATE_METADATA');
  const result = await executeGoogleAdsGovernedOperation(
    {
      ...base,
      precheck: { ...base.precheck, expectedResourceState: 'ENABLED' },
    },
    port({ ok: true, requiresReadback: true }),
  );
  assert.deepEqual(result, {
    status: 'BLOCKED',
    code: 'PAUSED_STATE_REQUIRED',
    authorizesExecution: false,
    canGrantRetry: false,
  });
});

test('W13-E keeps activation and destructive delete outside paused-first execution', async () => {
  const activation = await executeGoogleAdsGovernedOperation(
    input('ACTIVATE'),
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(activation.status, 'BLOCKED');
  if (activation.status === 'BLOCKED') assert.equal(activation.code, 'UNSUPPORTED_ACTIVATION');

  const deletion = await executeGoogleAdsGovernedOperation(
    input('DELETE'),
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(deletion.status, 'BLOCKED');
  if (deletion.status === 'BLOCKED') {
    assert.equal(deletion.code, 'DESTRUCTIVE_OPERATION_NOT_SUPPORTED');
  }
});

test('W13-E requires the accepted W13-F financial mutation plan for budget/bid writes', async () => {
  const base = input('SET_BUDGET');
  const missing = await executeGoogleAdsGovernedOperation(
    base,
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(missing.status, 'BLOCKED');
  if (missing.status === 'BLOCKED') assert.equal(missing.code, 'FINANCIAL_GOVERNANCE_REQUIRED');

  const governed = prepareGoogleAdsFinancialMutation(financialInput(base.plan));
  assert.equal(governed.status, 'READY');
  if (governed.status !== 'READY') return;
  const executed = await executeGoogleAdsGovernedOperation(
    { ...base, financialMutation: governed.plan },
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(executed.status, 'ACKNOWLEDGED_PENDING_READBACK');
});

test('W13-E delegates non-mutating quota/rate-limit retry decisions to W07', async () => {
  const result = await executeGoogleAdsGovernedOperation(
    input(),
    port({ ok: false, error: 'RATE_LIMITED', mutationPossible: false, retryAfterMs: 10_000 }),
  );
  assert.equal(result.status, 'FAILED_NOT_EXECUTED');
  if (result.status !== 'FAILED_NOT_EXECUTED') return;
  assert.equal(result.retryAfterMs, 10_000);
  assert.equal(result.retryDecisionOwner, 'W07');
  assert.equal(result.canGrantRetry, false);
});

test('W13-E preserves ambiguous/partial outcomes as EXECUTION_UNCERTAIN until reconciliation', async () => {
  const ambiguous = await executeGoogleAdsGovernedOperation(
    input(),
    port({
      ok: false,
      error: 'AMBIGUOUS_WRITE',
      mutationPossible: true,
      providerReference: 'customers/1234567890/campaigns/77',
    }),
  );
  assert.equal(ambiguous.status, 'EXECUTION_UNCERTAIN');
  if (ambiguous.status !== 'EXECUTION_UNCERTAIN') return;
  assert.equal(ambiguous.requiresReconciliation, true);
  assert.equal(ambiguous.retryBoundary, 'W07_RECONCILE_BEFORE_RETRY');
  assert.equal(ambiguous.canGrantRetry, false);
});

test('W13-E treats thrown transport errors and missing required readback as uncertain', async () => {
  const throwing: GoogleAdsW08WritePort = {
    source: 'W08_GOVERNED_PROVIDER_WRITE',
    async writeOnce() {
      throw new Error('connection lost after request transmission');
    },
  };
  const thrown = await executeGoogleAdsGovernedOperation(input(), throwing);
  assert.equal(thrown.status, 'EXECUTION_UNCERTAIN');

  const protocol = await executeGoogleAdsGovernedOperation(
    input(),
    port({ ok: true, requiresReadback: false }),
  );
  assert.equal(protocol.status, 'EXECUTION_UNCERTAIN');
  if (protocol.status === 'EXECUTION_UNCERTAIN') {
    assert.equal(protocol.error, 'READBACK_PROTOCOL_VIOLATION');
  }
});

test('W13-E fails closed on stale or cross-account W08 precheck evidence', async () => {
  const base = input();
  const stale = await executeGoogleAdsGovernedOperation(
    {
      ...base,
      precheck: { ...base.precheck, validUntilMs: NOW },
    },
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(stale.status, 'BLOCKED');
  if (stale.status === 'BLOCKED') assert.equal(stale.code, 'PRECHECK_STALE');

  const wrong = await executeGoogleAdsGovernedOperation(
    {
      ...base,
      precheck: { ...base.precheck, customerId: '0000000000' },
    },
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(wrong.status, 'BLOCKED');
  if (wrong.status === 'BLOCKED') assert.equal(wrong.code, 'ACCOUNT_SCOPE_MISMATCH');
});
