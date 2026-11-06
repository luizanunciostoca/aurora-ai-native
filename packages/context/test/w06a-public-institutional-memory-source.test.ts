// @ts-expect-error -- the context harness uses Node 22 built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- the context harness uses Node 22 built-ins without @types/node.
import { createHash } from 'node:crypto';
// @ts-expect-error -- the context harness uses Node 22 built-ins without @types/node.
import test from 'node:test';

import type { Rfc3339Timestamp, TenantContext } from '@aurora/contracts/context';
import type { PublicModelContextBinding } from '../src/minimal-context/current-public-model-context.js';
import {
  createMemoryFabricSnapshot,
  stageMemoryProposal,
  transitionMemoryProjection,
} from '../src/memory-fabric/fabric.js';
import type { MemoryFabricSnapshot, MemoryProjectionRecord } from '../src/memory-fabric/types.js';
import { AURORA_INSTITUTIONAL_CONTENT as CONTENT } from '../src/sources/aurora-institutional-content.js';
import {
  prepareInstitutionalPublicMemorySource,
  PUBLIC_INSTITUTIONAL_ADAPTER_ID as ADAPTER,
  type InstitutionalPublicMemorySource,
  type InstitutionalPublicMemorySourceDependencies,
} from '../src/sources/public-institutional-memory-source.js';
import type { ContextSourceReadRequest } from '../src/sources/types.js';

// Only CONTENT is real owner-delegated source data. Identity, provider, lifecycle evidence
// and clock below are explicitly synthetic fixtures, not an installed owner or consent.
const NOW = Date.parse('2026-11-06T18:00:00.000Z');
const OBSERVED_AT = '2026-11-05T18:00:00.000Z' as Rfc3339Timestamp;
const PROJECTION = 'fixture:institutional-projection';
const TENANT = { tenantId: 'fixture:institutional-tenant' } as TenantContext;
const at = (value: number) => new Date(value).toISOString();

function binding(): PublicModelContextBinding {
  return {
    tenantId: TENANT.tenantId,
    actorIdentityId: 'fixture:actor',
    correlationId: 'fixture:correlation',
    gatewaySessionId: 'fixture:gateway',
    connectionId: 'fixture:connection',
    gatewayGeneration: 1,
    deviceSessionId: 'fixture:device-session',
    deviceId: 'fixture:device',
    registrationVersion: 1,
    requestId: 'fixture:request',
    deadlineMs: NOW + 20_000,
  };
}

function memory(
  lifecycle: 'CANDIDATE' | 'VALIDATED' | 'CANONICAL' = 'CANONICAL',
): MemoryFabricSnapshot {
  const staged = stageMemoryProposal({
    snapshot: createMemoryFabricSnapshot(TENANT),
    maxDataClassification: 'PUBLIC',
    proposal: {
      kind: 'MemoryWriteProposal',
      proposalReference: PROJECTION,
      memoryKey: CONTENT.memoryKey,
      boundaryCandidate: {
        boundary: 'COMPANY',
        tenant: TENANT,
        classification: 'PUBLIC',
        sourceOwner: 'COMPANY_KNOWLEDGE',
        sourceReference: CONTENT.sourceReference,
        provenanceReference: CONTENT.provenanceReference,
        observedAt: OBSERVED_AT,
        conflictState: 'NONE',
      },
      producer: { kind: 'AGENT', producerReference: 'fixture:delegated-content-producer' },
      content: { kind: 'TEXT', digest: CONTENT.sourceRevision, payload: CONTENT.text },
    },
  });
  assert.equal(staged.status, 'STAGED');
  if (lifecycle === 'CANDIDATE') return staged.snapshot;
  const validated = transitionMemoryProjection({
    snapshot: staged.snapshot,
    tenant: TENANT,
    projectionReference: PROJECTION,
    expectedLifecycleRevision: 0,
    to: 'VALIDATED',
    evidenceReference: 'fixture:source-owner-validation',
    sourceCommitReference: CONTENT.sourceReference,
    sourceCommitRevision: CONTENT.sourceRevision,
  });
  assert.equal(validated.applied, true);
  if (lifecycle === 'VALIDATED') return validated.snapshot;
  const promoted = transitionMemoryProjection({
    snapshot: validated.snapshot,
    tenant: TENANT,
    projectionReference: PROJECTION,
    expectedLifecycleRevision: 1,
    to: 'CANONICAL',
    evidenceReference: 'fixture:source-owner-promotion',
  });
  assert.equal(promoted.applied, true);
  return promoted.snapshot;
}

function request(bound = binding()): ContextSourceReadRequest {
  return {
    schemaVersion: '1.0.0',
    tenant: { tenantId: bound.tenantId },
    correlation: { correlationId: bound.correlationId },
    actor: { kind: 'HUMAN', identityId: bound.actorIdentityId },
    purpose: {
      kind: 'PurposeContext',
      purposeId: 'fixture:institutional-information',
      version: '1.0.0',
      status: 'ACTIVE',
      allowedDataClassifications: ['PUBLIC'],
    },
    jurisdiction: { kind: 'JurisdictionContext', jurisdiction: 'BR', version: '1.0.0' },
    maxDataClassification: 'PUBLIC',
    currentness: 'CURRENT_REQUIRED',
    selector: {
      adapterId: ADAPTER,
      sourceClass: 'COMPANY_KNOWLEDGE',
      key: 'projectionReference',
      value: PROJECTION,
    },
    deadline: { deadlineAt: at(bound.deadlineMs) },
    limit: 1,
  } as unknown as ContextSourceReadRequest;
}

function fixture(lifecycle: 'CANDIDATE' | 'VALIDATED' | 'CANONICAL' = 'CANONICAL') {
  const state = { now: NOW, snapshot: memory(lifecycle) as unknown, binding: binding(), reads: 0 };
  const dependencies: InstitutionalPublicMemorySourceDependencies = {
    binding: state.binding,
    projectionReference: PROJECTION,
    now: () => state.now,
    readCurrentSnapshot: (candidateBinding) => {
      assert.deepEqual(candidateBinding, state.binding);
      state.reads += 1;
      return state.snapshot as MemoryFabricSnapshot | null;
    },
  };
  const prepare = () => prepareInstitutionalPublicMemorySource(dependencies);
  return { state, dependencies, prepare };
}
function ready(f: ReturnType<typeof fixture>): InstitutionalPublicMemorySource {
  const result = f.prepare();
  if (result === null) throw new Error('Fixture preparation unexpectedly failed');
  return result;
}
function read(source: InstitutionalPublicMemorySource, bound = binding()) {
  return source.readCurrentSource(bound, ADAPTER, CONTENT.sourceReference);
}
function modifyRecord(snapshot: unknown, change: Record<string, unknown>): MemoryFabricSnapshot {
  const current = snapshot as MemoryFabricSnapshot;
  return { ...current, records: [{ ...current.records[0], ...change } as MemoryProjectionRecord] };
}

test('institutional source uses actual authorized UTF-8 content, independently verified SHA-256 and explicit authorship', () => {
  const bytes = new TextEncoder().encode(CONTENT.text);
  assert.equal(bytes.byteLength, 353);
  assert.equal(bytes.byteLength, CONTENT.utf8Bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), CONTENT.contentSha256);
  assert.equal(CONTENT.sourceRevision, `sha256:${CONTENT.contentSha256}`);
  assert.equal(CONTENT.authorship, 'ASSISTANT_AUTHORED_UNDER_OWNER_DELEGATION');
  assert.equal(CONTENT.authorizesExecution, false);
  assert.equal(CONTENT.canInvokeTools, false);
  assert.ok(CONTENT.provenanceReference.endsWith('#issuecomment-6691169203'));
});

test('projects only exact text from existing W06 COMPANY reducers; preserves old observedAt and re-reads current provider', async () => {
  const f = fixture();
  const snapshotBefore = JSON.stringify(f.state.snapshot);
  const source = ready(f);
  const item = read(source);
  assert.deepEqual(Object.keys(source).sort(), ['adapter', 'readCurrentSource']);
  assert.deepEqual(Object.keys(item ?? {}).sort(), [
    'classification',
    'observedAt',
    'payload',
    'provenanceReference',
    'sourceReference',
    'sourceRevision',
    'tenant',
  ]);
  assert.equal(item?.payload, CONTENT.text);
  assert.equal(item?.sourceRevision, CONTENT.sourceRevision);
  assert.equal(item?.provenanceReference, CONTENT.provenanceReference);
  assert.equal(item?.observedAt, OBSERVED_AT);
  assert.equal(
    (f.state.snapshot as MemoryFabricSnapshot).records[0]?.sourceRevision,
    undefined,
    'existing reducer supplies sourceCommitRevision, not a fabricated sourceRevision',
  );
  const result = await source.adapter.read(request());
  assert.deepEqual(result.items, [item]);
  assert.equal(f.state.reads, 3, 'prepare, current source and adapter each read owning port');
  f.state.now += 9_000;
  assert.equal(
    read(source)?.observedAt,
    OBSERVED_AT,
    'reading never refreshes publication/observation time',
  );
  assert.equal(
    JSON.stringify(f.state.snapshot),
    snapshotBefore,
    'data facade never stages/promotes/writes source truth',
  );
  assert.equal(source.adapter.descriptor.adapterId, ADAPTER);
  assert.equal(source.adapter.descriptor.maxItemsPerRead, 1);
  assert.equal(source.adapter.descriptor.readOnly, true);
  assert.deepEqual(source.adapter.descriptor.supportedSelectorKeys, ['projectionReference']);
});

test('VALIDATED projection is allowed without inventing promotion; CANDIDATE stays unavailable', () => {
  assert.equal(fixture('CANDIDATE').prepare(), null);
  const f = fixture('VALIDATED');
  assert.equal(read(ready(f))?.payload, CONTENT.text);
  assert.equal(
    (f.state.snapshot as MemoryFabricSnapshot).records[0]?.promotionReference,
    undefined,
  );
});

test('requires correct boundary/owner/PUBLIC/lifecycle/evidence/provenance/bytes, not matching claimed digests alone', () => {
  const cases: readonly [string, Record<string, unknown>][] = [
    ['wrong tenant', { tenant: { tenantId: 'fixture:other-tenant' } }],
    ['wrong boundary', { boundary: 'USER' }],
    ['wrong owner', { sourceOwner: 'USER_PROFILE' }],
    ['INTERNAL classification', { classification: 'INTERNAL' }],
    ['subject-scoped source', { subject: { kind: 'IDENTITY', identityId: 'fixture:actor' } }],
    ['wrong memory key', { memoryKey: 'fixture:other-memory' }],
    ['wrong source reference', { sourceReference: 'fixture:other-source' }],
    ['wrong optional source revision', { sourceRevision: 'sha256:wrong' }],
    ['wrong commit source', { sourceCommitReference: 'fixture:other-source-commit' }],
    ['wrong commit revision', { sourceCommitRevision: 'sha256:wrong' }],
    ['missing validation', { validationReference: undefined }],
    ['missing promotion', { promotionReference: undefined }],
    ['zero lifecycle revision', { lifecycleRevision: 0 }],
    ['TRANSIENT state', { lifecycle: 'TRANSIENT' }],
    ['REVOKED state', { lifecycle: 'REVOKED' }],
    ['SUPERSEDED state', { lifecycle: 'SUPERSEDED' }],
    ['revocation marker', { revocationReference: 'fixture:revoked' }],
    ['supersede marker', { supersedeReference: 'fixture:superseded' }],
    ['replacement marker', { supersededByProjectionReference: 'fixture:replacement' }],
    ['unresolved conflict', { conflictState: 'UNRESOLVED' }],
    ['conflict references', { conflictsWithProjectionReferences: ['fixture:conflict'] }],
    ['provenance drift', { provenanceReference: 'fixture:invented-provenance' }],
    ['future observation', { observedAt: at(NOW + 1) }],
    ['invalid observation', { observedAt: 'not-a-timestamp' }],
    ['execution authority', { authorizesExecution: true }],
    ['invalid producer', { producer: { kind: 'UNKNOWN', producerReference: 'fixture:producer' } }],
    [
      'structured content',
      { content: { kind: 'STRUCTURED', digest: CONTENT.sourceRevision, payload: CONTENT.text } },
    ],
    [
      'invented text with correct digest',
      { content: { kind: 'TEXT', digest: CONTENT.sourceRevision, payload: 'Texto forjado.' } },
    ],
    [
      'extra newline with correct digest',
      { content: { kind: 'TEXT', digest: CONTENT.sourceRevision, payload: CONTENT.text + '\n' } },
    ],
    [
      'wrong content digest',
      { content: { kind: 'TEXT', digest: 'sha256:wrong', payload: CONTENT.text } },
    ],
    [
      'two matching invented digests',
      {
        sourceCommitRevision: 'sha256:wrong',
        content: { kind: 'TEXT', digest: 'sha256:wrong', payload: 'Texto forjado.' },
      },
    ],
    ['extra authority field', { policyDecision: 'ALLOW' }],
  ];
  for (const [name, change] of cases) {
    const f = fixture();
    f.state.snapshot = modifyRecord(f.state.snapshot, change);
    assert.equal(f.prepare(), null, name);
  }
});

test('rejects malformed/ambiguous snapshot and duplicate projection even when duplicate lifecycle is hidden', () => {
  const mutations = [
    (s: MemoryFabricSnapshot) => ({ ...s, kind: 'Other' }),
    (s: MemoryFabricSnapshot) => ({ ...s, tenant: { tenantId: 'fixture:other' } }),
    (s: MemoryFabricSnapshot) => ({ ...s, revision: -1 }),
    (s: MemoryFabricSnapshot) => ({ ...s, revision: 0.5 }),
    (s: MemoryFabricSnapshot) => ({ ...s, authorizesExecution: true }),
    (s: MemoryFabricSnapshot) => ({ ...s, records: [] }),
    (s: MemoryFabricSnapshot) => ({ ...s, records: [...s.records, ...s.records] }),
    (s: MemoryFabricSnapshot) => ({
      ...s,
      records: [...s.records, { ...s.records[0], lifecycle: 'REVOKED' }],
    }),
    (s: MemoryFabricSnapshot) => ({ ...s, records: Array(129).fill(s.records[0]) }),
  ];
  for (const mutate of mutations) {
    const f = fixture();
    f.state.snapshot = mutate(f.state.snapshot as MemoryFabricSnapshot);
    assert.equal(f.prepare(), null);
  }
});

test('keeps lifecycle/commit/owner/producer evidence in private capture and terminally invalidates any drift', () => {
  const changes = [
    { lifecycleRevision: 3 },
    { validationReference: 'fixture:changed-validation' },
    { promotionReference: 'fixture:changed-promotion' },
    { sourceCommitReference: 'fixture:changed-commit' },
    { sourceCommitRevision: 'fixture:changed-commit-revision' },
    { sourceOwner: 'SEMANTIC_KNOWLEDGE' },
    { producer: { kind: 'AGENT', producerReference: 'fixture:changed-producer' } },
    { observedAt: at(NOW - 5_000) },
    { retentionPolicyReference: 'fixture:changed-retention' },
    { sourceRevision: CONTENT.sourceRevision },
  ];
  for (const change of changes) {
    const f = fixture();
    const source = ready(f);
    const old = f.state.snapshot;
    f.state.snapshot = modifyRecord(old, change);
    assert.equal(read(source), null, Object.keys(change)[0]);
    f.state.snapshot = old;
    assert.equal(read(source), null, 'restoring bytes must not revive a failed preparation');
    assert.equal(read(ready(f))?.payload, CONTENT.text, 'fresh preparation is a distinct capture');
  }
});

test('snapshot revision change invalidates even when selected text and lifecycle are identical', () => {
  const f = fixture();
  const source = ready(f);
  const old = f.state.snapshot as MemoryFabricSnapshot;
  f.state.snapshot = { ...old, revision: old.revision + 1 };
  assert.equal(read(source), null);
  f.state.snapshot = old;
  assert.equal(read(source), null);
});

test('real W06 revoke transition removes current source and no rollback of bytes revives old facade', async () => {
  const f = fixture();
  const source = ready(f);
  const old = f.state.snapshot as MemoryFabricSnapshot;
  const revoked = transitionMemoryProjection({
    snapshot: old,
    tenant: TENANT,
    projectionReference: PROJECTION,
    expectedLifecycleRevision: 2,
    to: 'REVOKED',
    evidenceReference: 'fixture:owner-revocation',
  });
  assert.equal(revoked.applied, true);
  f.state.snapshot = revoked.snapshot;
  assert.equal(read(source), null);
  assert.deepEqual((await source.adapter.read(request())).items, []);
  f.state.snapshot = old;
  assert.equal(read(source), null);
});

test('all eleven binding fields are immutable and mismatches terminally invalidate', () => {
  for (const key of Object.keys(binding()) as (keyof PublicModelContextBinding)[]) {
    const f = fixture();
    const source = ready(f);
    const value = f.state.binding[key];
    const changed = {
      ...f.state.binding,
      [key]: typeof value === 'number' ? value + 1 : value + ':changed',
    };
    assert.equal(read(source, changed), null, key);
    assert.equal(read(source), null, `${key} restoration`);
  }
});

test('capture expires at ten seconds or earlier request deadline and never revives on clock rollback', () => {
  const f = fixture();
  const source = ready(f);
  f.state.now = NOW + 9_999;
  assert.ok(read(source));
  f.state.now = NOW + 10_000;
  assert.equal(read(source), null);
  f.state.now = NOW;
  assert.equal(read(source), null);
  const short = fixture();
  Object.assign(short.state.binding, { deadlineMs: NOW + 2_000 });
  const shorter = ready(short);
  short.state.now = NOW + 2_000;
  assert.equal(read(shorter, short.state.binding), null);
});

test('backward, invalid or slow owner clocks fail closed; no repeated reads extend expiry', () => {
  for (const badNow of [NOW - 1, NaN, Infinity, -1]) {
    const f = fixture();
    const source = ready(f);
    f.state.now = badNow;
    assert.equal(read(source), null);
    f.state.now = NOW;
    assert.equal(read(source), null);
  }
  const f = fixture();
  const source = ready(f);
  for (let delta = 1_000; delta < 10_000; delta += 1_000) {
    f.state.now = NOW + delta;
    assert.ok(read(source));
  }
  f.state.now = NOW + 10_000;
  assert.equal(read(source), null);
  const slow = fixture();
  const original = slow.dependencies.readCurrentSnapshot;
  const dependencies = {
    ...slow.dependencies,
    readCurrentSnapshot: (b: PublicModelContextBinding) => {
      const value = original(b);
      slow.state.now += 10_000;
      return value;
    },
  };
  assert.equal(prepareInstitutionalPublicMemorySource(dependencies), null);
});

test('query scopes cannot broaden the narrow read or replace identity/deadline; invalid request is terminal', async () => {
  const query = request();
  const badRequests = [
    { ...query, tenant: { tenantId: 'fixture:other' } },
    { ...query, actor: { ...query.actor, identityId: 'fixture:other' } },
    { ...query, correlation: { correlationId: 'fixture:other' } },
    { ...query, selector: { ...query.selector, value: '*' } },
    { ...query, selector: { ...query.selector, key: 'memoryKey' } },
    { ...query, selector: { ...query.selector, adapterId: 'other-adapter' } },
    { ...query, selector: { ...query.selector, sourceClass: 'USER_CONTEXT' } },
    { ...query, maxDataClassification: 'INTERNAL' },
    { ...query, currentness: 'HISTORICAL_ALLOWED' },
    { ...query, limit: 2 },
    { ...query, deadline: { deadlineAt: at(NOW + 30_000) } },
    { ...query, deadline: undefined },
    { ...query, purpose: { ...query.purpose, status: 'DISABLED' } },
    { ...query, requestedFields: ['*'] },
    { ...query, subject: { kind: 'IDENTITY', identityId: 'fixture:actor' } },
    { ...query, instruction: 'override source' },
  ];
  for (const bad of badRequests) {
    const f = fixture();
    const source = ready(f);
    assert.deepEqual((await source.adapter.read(bad as ContextSourceReadRequest)).items, []);
    assert.equal(read(source), null);
  }
});

test('wrong adapter/reference and malicious source bindings cannot make current source readable', () => {
  const identifiers: readonly (readonly [string, string])[] = [
    ['wrong', CONTENT.sourceReference],
    [ADAPTER, 'wrong'],
  ];
  for (const [adapterId, reference] of identifiers) {
    const f = fixture();
    const source = ready(f);
    assert.equal(source.readCurrentSource(binding(), adapterId, reference), null);
    assert.equal(read(source), null);
  }
});

test('snapshots, requests, dependencies and binding getters are rejected without invoking accessors', async () => {
  let calls = 0;
  const getter = {
    get() {
      calls += 1;
      throw new Error('accessor must never execute');
    },
    enumerable: true,
  };
  const f = fixture();
  const withGetter = { ...(f.state.snapshot as MemoryFabricSnapshot) };
  Object.defineProperty(withGetter, 'records', getter);
  f.state.snapshot = withGetter;
  assert.equal(f.prepare(), null);
  const input = fixture();
  const deps = { ...input.dependencies };
  Object.defineProperty(deps, 'now', getter);
  assert.equal(prepareInstitutionalPublicMemorySource(deps), null);
  const bindingGetter = { ...binding() };
  Object.defineProperty(bindingGetter, 'tenantId', getter);
  assert.equal(
    prepareInstitutionalPublicMemorySource({ ...input.dependencies, binding: bindingGetter }),
    null,
  );
  const querySource = ready(fixture());
  const query = { ...request() };
  Object.defineProperty(query, 'selector', getter);
  assert.deepEqual((await querySource.adapter.read(query)).items, []);
  const recordGetter = fixture();
  const record = { ...(recordGetter.state.snapshot as MemoryFabricSnapshot).records[0] };
  Object.defineProperty(record, 'content', getter);
  recordGetter.state.snapshot = {
    ...(recordGetter.state.snapshot as MemoryFabricSnapshot),
    records: [record],
  };
  assert.equal(recordGetter.prepare(), null);
  assert.equal(calls, 0);
});

test('no symbol, inherited property, sparse array, cycle, excessive depth or JSON/then hooks enter a capture', () => {
  const base = memory();
  const cycle: Record<string, unknown> = { ...base };
  cycle.loop = cycle;
  let nested: unknown = {};
  for (let depth = 0; depth < 26; depth += 1) nested = { child: nested };
  const values = [
    { ...base, [Symbol('hidden')]: true },
    Object.assign(Object.create({ hidden: true }), base),
    { ...base, records: Array(2) },
    cycle,
    { ...base, nested },
    {
      ...base,
      then: () => {
        throw new Error('not assimilated');
      },
    },
    {
      ...base,
      toJSON: () => {
        throw new Error('not serialized');
      },
    },
    { ...base, extra: 'x'.repeat(131_073) },
  ];
  for (const value of values) {
    const f = fixture();
    f.state.snapshot = value;
    assert.equal(f.prepare(), null);
  }
});

test('missing, throwing, null and async current owners are unavailable; rejected native Promises are drained', async () => {
  const f = fixture();
  assert.equal(
    prepareInstitutionalPublicMemorySource({
      ...f.dependencies,
      readCurrentSnapshot: undefined,
    } as unknown as InstitutionalPublicMemorySourceDependencies),
    null,
  );
  assert.equal(
    prepareInstitutionalPublicMemorySource({
      ...f.dependencies,
      readCurrentSnapshot: () => {
        throw new Error('owner unavailable');
      },
    }),
    null,
  );
  f.state.snapshot = null;
  assert.equal(f.prepare(), null);
  f.state.snapshot = Promise.reject(new Error('async W03 is not current synchronous authority'));
  assert.equal(f.prepare(), null);
  await Promise.resolve();
  const active = fixture();
  const source = ready(active);
  const old = active.state.snapshot;
  active.state.snapshot = Promise.resolve(old);
  assert.equal(read(source), null);
  active.state.snapshot = old;
  assert.equal(read(source), null);
});

test('malformed identity and provider descriptors are denied before any owner read', () => {
  const f = fixture();
  for (const changed of [
    { ...binding(), requestId: '' },
    { ...binding(), deadlineMs: NOW },
    { ...binding(), deadlineMs: NOW + 30_001 },
    { ...binding(), gatewayGeneration: 0 },
    { ...binding(), registrationVersion: 0.5 },
    { ...binding(), requestId: 'x'.repeat(129) },
    { ...binding(), tenantId: 'space not token' },
    { ...binding(), extra: 'unexpected' },
  ]) {
    assert.equal(
      prepareInstitutionalPublicMemorySource({ ...f.dependencies, binding: changed }),
      null,
    );
  }
  assert.equal(f.state.reads, 0);
});

test('external mutable aliases cannot alter captured data, output or dependencies', () => {
  const f = fixture();
  const source = ready(f);
  const item = read(source);
  if (item === null) throw new Error('Fixture current source unexpectedly unavailable');
  assert.ok(Object.isFrozen(source));
  assert.ok(Object.isFrozen(source.adapter));
  assert.ok(Object.isFrozen(source.adapter.descriptor));
  assert.ok(Object.isFrozen(item));
  assert.ok(Object.isFrozen(item.tenant));
  assert.throws(() => Object.assign(item, { payload: 'replaced' }), TypeError);
  assert.throws(() => Object.assign(item.tenant, { tenantId: 'fixture:other' }), TypeError);
  const snapshot = f.state.snapshot as MemoryFabricSnapshot;
  const record = snapshot.records[0];
  if (record === undefined) throw new Error('Fixture projection unexpectedly missing');
  Object.assign(record, { validationReference: 'fixture:mutated-alias' });
  assert.equal(
    read(source),
    null,
    'private full capture detects in-place mutation of source evidence',
  );
});

test('reentrant current owner cannot bypass terminal invalidation', () => {
  const f = fixture();
  let source: InstitutionalPublicMemorySource | null = null;
  const dependencies = {
    ...f.dependencies,
    readCurrentSnapshot: (b: PublicModelContextBinding) => {
      if (source) source.readCurrentSource(b, ADAPTER, CONTENT.sourceReference);
      return f.state.snapshot as MemoryFabricSnapshot;
    },
  };
  source = prepareInstitutionalPublicMemorySource(dependencies);
  if (!source) throw new Error('Fixture preparation unexpectedly failed');
  assert.equal(read(source), null);
  assert.equal(read(source), null);
});
