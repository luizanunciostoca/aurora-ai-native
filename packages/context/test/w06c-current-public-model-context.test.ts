// @ts-expect-error -- W06 service harness uses Node built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- W06 service harness uses Node built-ins without @types/node.
import test from 'node:test';

import type { ConsentRecord } from '@aurora/contracts/consent';
import type { PolicySnapshot } from '@aurora/contracts/policy-engine';
import {
  CurrentPublicModelContext,
  type CurrentPublicModelContextRecord,
  type CurrentPublicModelContextPreparation,
  type PublicModelContextBinding,
} from '../src/minimal-context/current-public-model-context.js';
import type { ContextQuery } from '../src/query/types.js';
import type {
  ContextSourceAdapter,
  ContextSourceItem,
  ContextSourceReadResult,
} from '../src/sources/types.js';

const NOW = Date.parse('2026-11-06T18:00:00.000Z');
const at = (value: number) => new Date(value).toISOString();
const TENANT = 'tenant:public-one';
const ACTOR = 'actor:public-one';
const CORRELATION = 'correlation:public-one';
const SOURCE = 'public-source:opening';
const ADAPTER = 'public.docs';

function bound(overrides: Partial<PublicModelContextBinding> = {}): PublicModelContextBinding {
  return {
    tenantId: TENANT,
    actorIdentityId: ACTOR,
    correlationId: CORRELATION,
    gatewaySessionId: 'gateway:one',
    connectionId: 'connection:one',
    gatewayGeneration: 1,
    deviceSessionId: 'device-session:one',
    deviceId: 'device:one',
    registrationVersion: 1,
    requestId: 'request:one',
    deadlineMs: NOW + 6_000,
    ...overrides,
  };
}

function makeRecord(binding = bound()): CurrentPublicModelContextRecord {
  const query = {
    kind: 'ContextQuery',
    schemaVersion: '1.0.0',
    tenant: { tenantId: binding.tenantId },
    correlation: { correlationId: binding.correlationId },
    actor: { kind: 'HUMAN', identityId: binding.actorIdentityId },
    purpose: {
      kind: 'PurposeContext',
      purposeId: 'model.public.information',
      version: '1.0.0',
      status: 'ACTIVE',
      allowedDataClassifications: ['PUBLIC'],
    },
    jurisdiction: { kind: 'JurisdictionContext', jurisdiction: 'BR', version: '1.0.0' },
    consent: { kind: 'CONSENT_RECORD', reference: 'consent:public-one', version: '1.0.0' },
    requiresConsent: true,
    maxDataClassification: 'PUBLIC',
    currentness: 'CURRENT_REQUIRED',
    selectors: [
      {
        adapterId: ADAPTER,
        sourceClass: 'COMPANY_KNOWLEDGE',
        key: 'documentRef',
        value: 'opening',
      },
    ],
    limits: { maxSourceFanout: 1, maxItemsPerSource: 2, maxTotalItems: 2 },
    deadline: { deadlineAt: at(binding.deadlineMs) },
  } as unknown as ContextQuery;
  const consent = {
    kind: 'ConsentRecord',
    schemaVersion: '1.0.0',
    reference: query.consent,
    tenantId: binding.tenantId,
    subject: { kind: 'IDENTITY', identityId: binding.actorIdentityId },
    status: 'ACTIVE',
    grantedAt: at(NOW - 10_000),
    expiresAt: at(NOW + 30_000),
    scope: { purposeIds: [query.purpose.purposeId], jurisdictions: ['BR'] },
    provenance: {
      source: 'fixture-owner-ledger',
      reference: 'fixture-consent-evidence',
      capturedAt: at(NOW - 10_000),
    },
  } as unknown as ConsentRecord;
  return {
    kind: 'CURRENT_PUBLIC_MODEL_CONTEXT_RECORD',
    reference: 'request-input:one',
    binding,
    observedAtEpochMs: NOW,
    expiresAtEpochMs: NOW + 5_000,
    query,
    policyEvaluation: {
      kind: 'PolicyEvaluationRequest',
      schemaVersion: query.schemaVersion,
      policy: { reference: 'policy:public-model', version: '1.0.0' },
      correlation: query.correlation,
      tenant: query.tenant,
      actor: query.actor,
      subject: consent.subject,
      tenantBoundary: {
        status: 'WITHIN_BOUNDARY',
        reason: 'BOUNDARY_CONFIRMED',
        correlationId: query.correlation.correlationId,
        evidence: {
          evaluatedTenantId: query.tenant.tenantId,
          actorIdentityId: query.actor.identityId,
          matchedBindingCount: 1,
          observedBindingTenantIds: [query.tenant.tenantId],
        },
      },
      action: 'model.public.process',
      requestedScope: ['context:public'],
      purpose: query.purpose,
      jurisdiction: query.jurisdiction,
      dataClassification: 'PUBLIC',
      consent,
    },
    instruction: 'Resuma o horário público.',
    retrievalPolicy: {
      minimumTrustBps: 6_000,
      trustBpsByAdapter: { [ADAPTER]: 9_500 },
      maxAgeMsBySourceClass: { COMPANY_KNOWLEDGE: 10_000 },
    },
    compilerLimits: { maxItems: 2, maxCanonicalUnits: 100_000 },
    allowedAdapterIds: [ADAPTER],
  } as unknown as CurrentPublicModelContextRecord;
}

function makePolicy(): PolicySnapshot {
  return {
    kind: 'PolicySnapshot',
    policy: { reference: 'policy:public-model', version: '1.0.0' },
    state: 'ACTIVE',
    rules: [
      {
        ruleId: 'fixture-public-model-rule',
        effect: 'ALLOW',
        action: 'model.public.process',
        scope: ['context:public'],
        tenantIds: [TENANT],
        actorKinds: ['HUMAN'],
        actorIdentityIds: [ACTOR],
        purposeIds: ['model.public.information'],
        jurisdictions: ['BR'],
        dataClassifications: ['PUBLIC'],
        consentRequired: true,
      },
    ],
  } as unknown as PolicySnapshot;
}
function makeItem(): ContextSourceItem {
  return {
    sourceReference: SOURCE,
    sourceRevision: 'revision:one',
    tenant: { tenantId: TENANT },
    classification: 'PUBLIC',
    observedAt: at(NOW - 1_000),
    provenanceReference: 'source-proof:opening',
    payload: 'Atendimento público de segunda a sexta, das 09:00 às 18:00.',
  } as unknown as ContextSourceItem;
}
function fixture() {
  const state = {
    now: NOW,
    clockReads: 0,
    failClockAt: undefined as number | undefined,
    binding: bound(),
    record: makeRecord() as CurrentPublicModelContextRecord | null,
    policy: makePolicy() as PolicySnapshot | undefined,
    item: makeItem() as ContextSourceItem | null,
    ownerReads: 0,
    policyReads: 0,
    sourceReads: 0,
    adapterReads: 0,
    read: undefined as (() => Promise<ContextSourceReadResult>) | undefined,
  };
  const adapter: ContextSourceAdapter = {
    descriptor: {
      adapterId: ADAPTER,
      sourceClass: 'COMPANY_KNOWLEDGE',
      readOnly: true,
      supportedSelectorKeys: ['documentRef'],
      maxItemsPerRead: 2,
    },
    read: async (request) => {
      state.adapterReads += 1;
      assert.equal(request.tenant.tenantId, state.binding.tenantId);
      assert.equal(request.actor.identityId, state.binding.actorIdentityId);
      assert.equal(request.purpose.purposeId, 'model.public.information');
      return state.read ? state.read() : { items: state.item ? [state.item] : [] };
    },
  };
  const owner = {
    readCurrent(binding: PublicModelContextBinding) {
      state.ownerReads += 1;
      assert.equal(binding.tenantId, state.binding.tenantId);
      return state.record;
    },
    policy: {
      getCurrent(request: { policyReference: string; tenantId: string; actorIdentityId: string }) {
        state.policyReads += 1;
        assert.equal(request.policyReference, 'policy:public-model');
        assert.equal(request.tenantId, state.binding.tenantId);
        assert.equal(request.actorIdentityId, state.binding.actorIdentityId);
        return state.policy;
      },
    },
    adapters: [adapter],
    readCurrentSource(
      binding: PublicModelContextBinding,
      adapterId: string,
      sourceReference: string,
    ) {
      state.sourceReads += 1;
      assert.equal(binding.tenantId, state.binding.tenantId);
      assert.equal(adapterId, ADAPTER);
      assert.equal(sourceReference, SOURCE);
      return state.item;
    },
  };
  const context = new CurrentPublicModelContext({
    now: () => {
      state.clockReads += 1;
      if (state.clockReads === state.failClockAt) throw new Error('fixture clock unavailable');
      return state.now;
    },
    owner,
  });
  const controller = new AbortController();
  const prepare = () => context.prepareCurrent(state.binding, controller.signal);
  return { state, owner, adapter, context, controller, prepare };
}
function currentRecord(f: ReturnType<typeof fixture>): CurrentPublicModelContextRecord {
  if (!f.state.record) throw new Error('fixture record missing');
  return f.state.record;
}
function withConsent(f: ReturnType<typeof fixture>, overrides: Record<string, unknown>): void {
  const record = currentRecord(f);
  f.state.record = {
    ...record,
    policyEvaluation: {
      ...record.policyEvaluation,
      consent: { ...record.policyEvaluation.consent, ...overrides } as ConsentRecord,
    },
  };
}
function noOutput(value: unknown): void {
  assert.equal(value, null);
}
function ready(
  value: CurrentPublicModelContextPreparation | null,
): CurrentPublicModelContextPreparation {
  assert.ok(value);
  if (!value) throw new Error('expected concrete context preparation');
  assert.equal(value.kind, 'CURRENT_PUBLIC_MODEL_CONTEXT_PREPARATION');
  assert.equal(value.minimizedPublicPrompt.authorizesExecution, false);
  assert.equal(value.minimizedPublicPrompt.canInvokeTools, false);
  assert.equal(value.minimizedPublicPrompt.purpose, 'INFORMATION_ONLY');
  return value;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function until(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('fixture checkpoint not reached');
}

test('W06 current source composes canonical policy, consent, acquisition and bounded PUBLIC prompt', async () => {
  const f = fixture();
  const result = ready(await f.prepare());
  assert.deepEqual(result.binding, f.state.binding);
  assert.equal(result.observedAtEpochMs, NOW);
  assert.equal(result.expiresAtEpochMs, NOW + 5_000);
  assert.match(result.minimizedPublicPrompt.prompt, /09:00/);
  assert.equal(result.minimizedPublicPrompt.prompt.includes(SOURCE), false);
  assert.equal(result.minimizedPublicPrompt.prompt.includes('consent:public-one'), false);
  assert.deepEqual(result.minimizedPublicPrompt.includedSourceReferences, [SOURCE]);
  assert.equal(f.state.adapterReads, 1);
  assert.ok(f.state.policyReads >= 3 && f.state.sourceReads >= 2);
  assert.equal(f.context.isCurrent(result.contextRef, f.state.binding, NOW), true);
  assert.equal(
    await f.context.revalidateCurrent(result.contextRef, f.state.binding, NOW, f.controller.signal),
    true,
  );
});

test('W06 missing current owner is unavailable, never a permissive fixture fallback', async () => {
  const context = new CurrentPublicModelContext({ now: () => NOW });
  noOutput(await context.prepareCurrent(bound(), new AbortController().signal));
  assert.equal(context.isCurrent('unknown', bound(), NOW), false);
});

test('W06 binds every W14 identity field before reading source content', async () => {
  for (const key of Object.keys(bound()) as Array<keyof PublicModelContextBinding>) {
    const f = fixture();
    const value = f.state.binding[key];
    const record = currentRecord(f);
    f.state.record = {
      ...record,
      binding: {
        ...record.binding,
        [key]: typeof value === 'number' ? value + 1 : value + ':wrong',
      },
    };
    noOutput(await f.prepare());
    assert.equal(f.state.adapterReads, 0, key);
  }
});

test('W06 requires exact ACTIVE current policy and canonical ALLOW without approval or execution authority', async () => {
  const mutations: Array<(snapshot: PolicySnapshot) => PolicySnapshot | undefined> = [
    () => undefined,
    (p) => ({ ...p, state: 'UNKNOWN' }),
    (p) => ({ ...p, policy: { ...p.policy, reference: 'policy:other' } }),
    (p) => ({ ...p, policy: { ...p.policy, version: '2.0.0' as typeof p.policy.version } }),
    (p) => ({ ...p, rules: [] }),
    (p) => ({ ...p, rules: p.rules.map((rule) => ({ ...rule, effect: 'DENY' })) }),
    (p) => ({ ...p, rules: p.rules.map((rule) => ({ ...rule, effect: 'REQUIRE_APPROVAL' })) }),
    (p) => ({ ...p, rules: p.rules.map((rule) => ({ ...rule, authorityRequired: true })) }),
    (p) => ({ ...p, rules: p.rules.map((rule) => ({ ...rule, action: 'different.action' })) }),
  ];
  for (const mutate of mutations) {
    const f = fixture();
    f.state.policy = mutate(makePolicy());
    noOutput(await f.prepare());
    assert.equal(f.state.adapterReads, 0);
  }
});

test('W06 actual consent status, time, identity, reference and provenance are checked before acquisition', async () => {
  const cases = [
    { schemaVersion: null },
    { schemaVersion: 'nonsense' },
    { schemaVersion: '2.0.0' },
    { status: 'REVOKED' },
    { status: 'EXPIRED' },
    { status: 'UNKNOWN' },
    { grantedAt: at(NOW + 1) },
    { grantedAt: 'not-a-date' },
    { expiresAt: at(NOW) },
    { tenantId: 'tenant:other' },
    { subject: { kind: 'IDENTITY', identityId: 'actor:other' } },
    { reference: { kind: 'CONSENT_RECORD', reference: 'consent:other', version: '1.0.0' } },
    { reference: { kind: 'CONSENT_RECORD', reference: 'consent:public-one', version: '2.0.0' } },
    { provenance: { source: '', reference: 'proof', capturedAt: at(NOW) } },
    { provenance: { source: 'ledger', reference: 'proof', capturedAt: at(NOW + 1) } },
    { scope: { purposeIds: ['wrong-purpose'] } },
    { scope: { purposeIds: ['model.public.information'], jurisdictions: ['US'] } },
    { scope: { purposeIds: ['model.public.information'], dataCategories: ['email'] } },
  ];
  for (const mutation of cases) {
    const f = fixture();
    withConsent(f, mutation);
    noOutput(await f.prepare());
    assert.equal(f.state.adapterReads, 0, JSON.stringify(mutation));
  }
});

test('W06 query requiresConsent=false cannot waive a policy-required consent', async () => {
  const f = fixture();
  const base = currentRecord(f);
  const { consent: queryConsent, ...query } = base.query;
  const { consent: policyConsent, ...policyEvaluation } = base.policyEvaluation;
  void queryConsent;
  void policyConsent;
  f.state.record = { ...base, query: { ...query, requiresConsent: false }, policyEvaluation };
  noOutput(await f.prepare());
  assert.equal(f.state.adapterReads, 0);
});

test('W06 no-consent case is possible only under applicable current policy and query, not a blanket waiver', async () => {
  const f = fixture();
  const base = currentRecord(f);
  const { consent: queryConsent, ...query } = base.query;
  const { consent: policyConsent, ...policyEvaluation } = base.policyEvaluation;
  void queryConsent;
  void policyConsent;
  f.state.record = { ...base, query: { ...query, requiresConsent: false }, policyEvaluation };
  const policy = makePolicy();
  f.state.policy = {
    ...policy,
    rules: policy.rules.map((rule) => ({ ...rule, consentRequired: false })),
  };
  ready(await f.prepare());
  assert.equal(f.state.adapterReads, 1);
});

test('W06 normalizes equivalent consent instants before canonical timestamp comparison', async () => {
  const f = fixture();
  withConsent(f, {
    grantedAt: '2026-11-06T14:59:50-03:00',
    expiresAt: '2026-11-06T15:00:30-03:00',
  });
  ready(await f.prepare());
});

test('W06 refuses authority injection and policy/query/tenant-boundary identity mismatch', async () => {
  const changes: Array<
    (record: CurrentPublicModelContextRecord) => CurrentPublicModelContextRecord
  > = [
    (r) =>
      ({
        ...r,
        policyEvaluation: { ...r.policyEvaluation, ownerDecision: {} },
      }) as unknown as CurrentPublicModelContextRecord,
    (r) =>
      ({
        ...r,
        policyEvaluation: { ...r.policyEvaluation, policyToken: {} },
      }) as unknown as CurrentPublicModelContextRecord,
    (r) =>
      ({
        ...r,
        policyEvaluation: { ...r.policyEvaluation, snapshot: makePolicy() },
      }) as unknown as CurrentPublicModelContextRecord,
    (r) =>
      ({
        ...r,
        policyEvaluation: { ...r.policyEvaluation, evaluatedAt: at(NOW) },
      }) as unknown as CurrentPublicModelContextRecord,
    (r) =>
      ({
        ...r,
        policyEvaluation: {
          ...r.policyEvaluation,
          actor: { ...r.policyEvaluation.actor, identityId: 'other' },
        },
      }) as unknown as CurrentPublicModelContextRecord,
    (r) =>
      ({
        ...r,
        policyEvaluation: {
          ...r.policyEvaluation,
          subject: { kind: 'IDENTITY', identityId: 'other' },
        },
      }) as unknown as CurrentPublicModelContextRecord,
    (r) =>
      ({
        ...r,
        policyEvaluation: {
          ...r.policyEvaluation,
          tenantBoundary: { ...r.policyEvaluation.tenantBoundary, correlationId: 'other' },
        },
      }) as unknown as CurrentPublicModelContextRecord,
    (r) =>
      ({
        ...r,
        policyEvaluation: {
          ...r.policyEvaluation,
          tenantBoundary: {
            ...r.policyEvaluation.tenantBoundary,
            evidence: { ...r.policyEvaluation.tenantBoundary.evidence, actorIdentityId: 'other' },
          },
        },
      }) as unknown as CurrentPublicModelContextRecord,
    (r) => ({
      ...r,
      policyEvaluation: {
        ...r.policyEvaluation,
        purpose: { ...r.policyEvaluation.purpose, purposeId: 'other' },
      },
    }),
    (r) => ({
      ...r,
      policyEvaluation: {
        ...r.policyEvaluation,
        jurisdiction: { ...r.policyEvaluation.jurisdiction, jurisdiction: 'US' },
      },
    }),
    (r) => ({ ...r, policyEvaluation: { ...r.policyEvaluation, dataClassification: 'INTERNAL' } }),
  ];
  for (const change of changes) {
    const f = fixture();
    f.state.record = change(currentRecord(f));
    noOutput(await f.prepare());
    assert.equal(f.state.adapterReads, 0);
  }
});

test('W06 refuses stale/future preparation, unbounded or expired request and unknown clock', async () => {
  for (const field of ['observedAtEpochMs', 'expiresAtEpochMs'] as const) {
    for (const value of [Number.NaN, NOW - 20_000, NOW + 20_000]) {
      const f = fixture();
      f.state.record = { ...currentRecord(f), [field]: value };
      noOutput(await f.prepare());
      assert.equal(f.state.adapterReads, 0);
    }
  }
  for (const deadlineMs of [NOW, NOW + 30_001, Number.NaN]) {
    const f = fixture();
    f.state.binding = bound({ deadlineMs });
    noOutput(await f.prepare());
    assert.equal(f.state.adapterReads, 0);
  }
  const f = fixture();
  f.state.now = Number.NaN;
  noOutput(await f.prepare());
  assert.equal(f.state.adapterReads, 0);
});

test('W06 accessor/proxy/cyclic/Promise-valued current records fail without invoking data getters', async () => {
  const f = fixture();
  let getterCalls = 0;
  const dangerous = Object.defineProperty({ ...currentRecord(f) }, 'query', {
    get() {
      getterCalls += 1;
      throw new Error('must not run');
    },
  });
  f.state.record = dangerous;
  noOutput(await f.prepare());
  assert.equal(getterCalls, 0);
  const revoked = Proxy.revocable(makeRecord(), {});
  revoked.revoke();
  f.state.record = revoked.proxy;
  noOutput(await f.prepare());
  const cyclic = { ...makeRecord(), instruction: {} } as unknown as Record<string, unknown>;
  cyclic.instruction = cyclic;
  f.state.record = cyclic as unknown as CurrentPublicModelContextRecord;
  noOutput(await f.prepare());
  f.state.record = Promise.reject(
    new Error('fixture invalid async owner'),
  ) as unknown as CurrentPublicModelContextRecord;
  noOutput(await f.prepare());
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(f.state.adapterReads, 0);
});

test('W06 snapshots the current-policy record before canonical lookup and rejects its accessors', async () => {
  const f = fixture();
  let reads = 0;
  f.state.policy = Object.defineProperty(makePolicy(), 'rules', {
    get() {
      reads += 1;
      throw new Error('no getter');
    },
  });
  noOutput(await f.prepare());
  assert.equal(reads, 0);
  assert.equal(f.state.adapterReads, 0);
});

test('W06 adapter truncation is refused instead of silently becoming a complete prompt', async () => {
  const f = fixture();
  f.state.read = async () => ({ items: [makeItem()], truncated: true });
  noOutput(await f.prepare());
  assert.equal(f.state.adapterReads, 1);
});

test('W06 refuses missing, nonpublic, stale, future, revisionless or sensitive current source content', async () => {
  const cases = [
    { classification: 'INTERNAL' },
    { observedAt: at(NOW - 20_000) },
    { observedAt: at(NOW + 1) },
    { sourceRevision: '' },
    { provenanceReference: '' },
    { payload: 'token=ghp_FAKE_SECRET_DO_NOT_USE_1234567890' },
  ];
  for (const change of cases) {
    const f = fixture();
    f.state.item = { ...makeItem(), ...change } as ContextSourceItem;
    noOutput(await f.prepare());
  }
  const f = fixture();
  f.state.item = null;
  noOutput(await f.prepare());
});

test('W06 current source readback is required and must equal acquired content, not just revision', async () => {
  const f = fixture();
  f.state.read = async () => ({
    items: [{ ...makeItem(), payload: 'Texto desatualizado com a mesma revisão.' }],
  });
  noOutput(await f.prepare());
  assert.ok(f.state.sourceReads >= 1);
});

test('W06 rejects consent revocation during awaited acquisition and never releases late public text', async () => {
  const f = fixture();
  const read = deferred<ContextSourceReadResult>();
  f.state.read = () => read.promise;
  const pending = f.prepare();
  await until(() => f.state.adapterReads === 1);
  withConsent(f, { status: 'REVOKED', revokedAt: at(NOW) });
  read.resolve({ items: [makeItem()] });
  noOutput(await pending);
});

test('W06 rejects policy revocation while awaited source acquisition is running', async () => {
  const f = fixture();
  const read = deferred<ContextSourceReadResult>();
  f.state.read = () => read.promise;
  const pending = f.prepare();
  await until(() => f.state.adapterReads === 1);
  const policy = makePolicy();
  f.state.policy = { ...policy, rules: policy.rules.map((rule) => ({ ...rule, effect: 'DENY' })) };
  read.resolve({ items: [makeItem()] });
  noOutput(await pending);
});

test('W06 each dispatch/release current lookup detects full source mutations at an unchanged revision', async () => {
  const changes = [
    { payload: 'Conteúdo público mudou.' },
    { provenanceReference: 'source-proof:changed' },
    { observedAt: at(NOW - 2_000) },
    { classification: 'INTERNAL' },
    { sourceRevision: 'revision:two' },
  ];
  for (const change of changes) {
    const f = fixture();
    const result = ready(await f.prepare());
    f.state.item = { ...makeItem(), ...change } as ContextSourceItem;
    assert.equal(f.context.isCurrent(result.contextRef, f.state.binding, NOW), false);
    f.state.item = makeItem();
    assert.equal(
      f.context.isCurrent(result.contextRef, f.state.binding, NOW),
      false,
      'invalidated preparation cannot resurrect',
    );
  }
});

test('W06 final current checks reevaluate consent/purpose/policy, never a TTL cached approval', async () => {
  const changes: Array<(f: ReturnType<typeof fixture>) => void> = [
    (f) => withConsent(f, { status: 'REVOKED' }),
    (f) => {
      const r = currentRecord(f);
      const purpose = { ...r.query.purpose, status: 'DISABLED' as const };
      f.state.record = {
        ...r,
        query: { ...r.query, purpose },
        policyEvaluation: { ...r.policyEvaluation, purpose },
      };
    },
    (f) => {
      f.state.policy = { ...makePolicy(), state: 'UNKNOWN' };
    },
    (f) => {
      const p = makePolicy();
      f.state.policy = { ...p, rules: p.rules.map((r) => ({ ...r, effect: 'DENY' })) };
    },
    (f) => {
      const r = currentRecord(f);
      f.state.record = { ...r, instruction: 'Outra tarefa.' };
    },
  ];
  for (const change of changes) {
    const f = fixture();
    const result = ready(await f.prepare());
    change(f);
    assert.equal(
      await f.context.revalidateCurrent(
        result.contextRef,
        f.state.binding,
        NOW,
        f.controller.signal,
      ),
      false,
    );
  }
});

test('W06 current checks enforce observation age and source freshness even without owner record mutation', async () => {
  const f = fixture();
  const r = currentRecord(f);
  f.state.record = {
    ...r,
    retrievalPolicy: { ...r.retrievalPolicy, maxAgeMsBySourceClass: { COMPANY_KNOWLEDGE: 1_500 } },
  };
  const result = ready(await f.prepare());
  f.state.now += 600;
  assert.equal(f.context.isCurrent(result.contextRef, f.state.binding, f.state.now), false);
});

test('W06 cancel returns promptly but pending acquisition stays BUSY and late result cannot be borrowed', async () => {
  const f = fixture();
  const read = deferred<ContextSourceReadResult>();
  f.state.read = () => read.promise;
  const pending = f.prepare();
  await until(() => f.state.adapterReads === 1);
  f.controller.abort();
  noOutput(await pending);
  noOutput(await f.context.prepareCurrent(f.state.binding, new AbortController().signal));
  assert.equal(f.state.adapterReads, 1);
  read.resolve({ items: [makeItem()] });
  await new Promise((resolve) => setTimeout(resolve, 0));
  f.state.read = undefined;
  const fresh = ready(
    await f.context.prepareCurrent(f.state.binding, new AbortController().signal),
  );
  assert.equal(f.context.isCurrent(fresh.contextRef, f.state.binding, NOW), true);
});

test('W06 timeout retains BUSY until the real source read settles', async () => {
  const f = fixture();
  const read = deferred<ContextSourceReadResult>();
  f.state.read = () => read.promise;
  f.state.binding = bound({ deadlineMs: NOW + 30 });
  const base = makeRecord(f.state.binding);
  f.state.record = {
    ...base,
    expiresAtEpochMs: NOW + 30,
    query: {
      ...base.query,
      selectors: [
        ...base.query.selectors,
        {
          adapterId: ADAPTER,
          sourceClass: 'COMPANY_KNOWLEDGE',
          key: 'documentRef',
          value: 'second-document',
        },
      ],
    },
  };
  const pending = f.prepare();
  await until(() => f.state.adapterReads === 1);
  noOutput(await pending);
  noOutput(await f.context.prepareCurrent(f.state.binding, new AbortController().signal));
  assert.equal(f.state.adapterReads, 1);
  read.resolve({ items: [makeItem()] });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    f.state.adapterReads,
    1,
    'logical timeout prevents a second read even while injected time is stationary',
  );
});

test('W06 clock exception during post-produce publication is contained without hanging or unhandled rejection', async () => {
  const baseline = fixture();
  ready(await baseline.prepare());
  const f = fixture();
  // Publication calls the clock, followed by isCurrent's two clock observations.
  f.state.failClockAt = baseline.state.clockReads - 2;
  const result = await Promise.race([
    f.prepare(),
    new Promise<string>((resolve) => setTimeout(() => resolve('HUNG'), 100)),
  ]);
  noOutput(result);
  f.state.failClockAt = undefined;
  ready(await f.prepare());
});

test('W06 only one preparation is retained, and old or cross-session handles cannot use a new capture', async () => {
  const f = fixture();
  const first = ready(await f.prepare());
  const second = ready(
    await f.context.prepareCurrent(f.state.binding, new AbortController().signal),
  );
  assert.notEqual(first.contextRef, second.contextRef);
  assert.equal(f.context.isCurrent(first.contextRef, f.state.binding, NOW), false);
  assert.equal(
    f.context.isCurrent(second.contextRef, bound({ connectionId: 'wrong' }), NOW),
    false,
  );
  assert.equal(f.context.isCurrent(second.contextRef, f.state.binding, NOW), true);
});

test('W06 immutable capture cannot be rewritten by a caller after preparation', async () => {
  const f = fixture();
  const result = ready(await f.prepare());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.binding), true);
  assert.throws(() => {
    (result.binding as { tenantId: string }).tenantId = 'changed';
  });
  assert.throws(() => {
    (result.minimizedPublicPrompt as { prompt: string }).prompt = 'changed';
  });
  assert.equal(f.context.isCurrent(result.contextRef, f.state.binding, NOW), true);
});

test('W06 adapter replacement and clock rollback invalidate existing preparation', async () => {
  const f = fixture();
  const result = ready(await f.prepare());
  f.owner.adapters[0] = { ...f.adapter, read: async () => ({ items: [makeItem()] }) };
  assert.equal(f.context.isCurrent(result.contextRef, f.state.binding, NOW), false);
  const g = fixture();
  const before = ready(await g.prepare());
  g.state.now -= 1;
  assert.equal(g.context.isCurrent(before.contextRef, g.state.binding, NOW), false);
});
