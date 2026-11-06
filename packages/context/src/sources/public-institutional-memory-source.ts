import type { PublicModelContextBinding } from '../minimal-context/current-public-model-context.js';
import { readMemoryProjection } from '../memory-fabric/fabric.js';
import type { MemoryFabricSnapshot, MemoryProjectionRecord } from '../memory-fabric/types.js';
import { MEMORY_PRODUCER_KINDS } from '../memory-fabric/types.js';
import type { ContextQuery } from '../query/types.js';
import { validateContextQuery } from '../query/validate.js';
import { AURORA_INSTITUTIONAL_CONTENT as CONTENT } from './aurora-institutional-content.js';
import type { ContextSourceAdapter, ContextSourceItem, ContextSourceReadRequest } from './types.js';

/** The existing COMPANY adapter identity, not a second source registry. */
export const PUBLIC_INSTITUTIONAL_ADAPTER_ID = 'aurora-memory-fabric:company';

export interface InstitutionalPublicMemorySourceDependencies {
  readonly binding: PublicModelContextBinding;
  readonly projectionReference: string;
  /** Current owning source only: synchronous, side-effect-free and non-blocking. */
  readonly readCurrentSnapshot: (binding: PublicModelContextBinding) => MemoryFabricSnapshot | null;
  readonly now: () => number;
}

export interface InstitutionalPublicMemorySource {
  readonly adapter: ContextSourceAdapter;
  readCurrentSource(
    binding: PublicModelContextBinding,
    adapterId: string,
    sourceReference: string,
  ): ContextSourceItem | null;
}

const BINDING_KEYS = [
  'tenantId',
  'actorIdentityId',
  'correlationId',
  'gatewaySessionId',
  'connectionId',
  'gatewayGeneration',
  'deviceSessionId',
  'deviceId',
  'registrationVersion',
  'requestId',
  'deadlineMs',
] as const;
const RECORD_KEYS = [
  'kind',
  'projectionReference',
  'memoryKey',
  'boundary',
  'tenant',
  'subject',
  'classification',
  'sourceOwner',
  'sourceReference',
  'sourceRevision',
  'provenanceReference',
  'observedAt',
  'retentionPolicyReference',
  'conflictState',
  'conflictsWithProjectionReferences',
  'producer',
  'content',
  'lifecycle',
  'lifecycleRevision',
  'sourceCommitReference',
  'sourceCommitRevision',
  'validationReference',
  'promotionReference',
  'supersededByProjectionReference',
  'supersedeReference',
  'revocationReference',
  'authorizesExecution',
] as const;
const RECORD_REQUIRED_KEYS = [
  'kind',
  'projectionReference',
  'memoryKey',
  'boundary',
  'tenant',
  'classification',
  'sourceOwner',
  'sourceReference',
  'provenanceReference',
  'observedAt',
  'conflictState',
  'conflictsWithProjectionReferences',
  'producer',
  'content',
  'lifecycle',
  'lifecycleRevision',
  'sourceCommitReference',
  'sourceCommitRevision',
  'validationReference',
  'authorizesExecution',
] as const;
const READ_KEYS = [
  'schemaVersion',
  'tenant',
  'correlation',
  'actor',
  'subject',
  'purpose',
  'jurisdiction',
  'consent',
  'maxDataClassification',
  'currentness',
  'selector',
  'requestedFields',
  'deadline',
  'limit',
] as const;
const READ_REQUIRED_KEYS = [
  'schemaVersion',
  'tenant',
  'correlation',
  'actor',
  'purpose',
  'jurisdiction',
  'maxDataClassification',
  'currentness',
  'selector',
  'deadline',
  'limit',
] as const;
const MAX_TIME_MS = 8_640_000_000_000_000;
const MAX_CAPTURE_MS = 10_000;
const MAX_REQUEST_MS = 30_000;
const EMPTY = Object.freeze({ items: Object.freeze([]), truncated: false });
const encoder = new TextEncoder();
const contentBytes = encoder.encode(CONTENT.text);

function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new Error('INSTITUTIONAL_PUBLIC_SOURCE_UNAVAILABLE');
}
function text(value: unknown, max = 512): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
function token(value: unknown): value is string {
  return text(value, 256) && /^[A-Za-z0-9._:-]+$/u.test(value);
}
function time(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIME_MS
  );
}
function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: unknown, allowed: readonly string[], required = allowed): boolean {
  return (
    plain(value) &&
    Object.keys(value).every((key) => allowed.includes(key)) &&
    required.every((key) => Object.hasOwn(value, key))
  );
}
function drainNativePromise(value: unknown): void {
  try {
    void Promise.prototype.then.call(
      value,
      () => undefined,
      () => undefined,
    );
  } catch {
    // Never inspect or assimilate a thenable supplied in place of synchronous owner data.
  }
}

/** Private bounded own-data capture, never a registry or an authority token. */
function capture(value: unknown): unknown {
  let nodes = 0;
  let units = 0;
  const active = new Set<object>();
  const visit = (part: unknown, depth: number): unknown => {
    nodes += 1;
    requireValue(nodes <= 4_096 && depth <= 24);
    if (typeof part === 'string') {
      units += part.length;
      requireValue(units <= 131_072);
      return part;
    }
    if (part === null || part === undefined || typeof part === 'boolean') return part;
    if (typeof part === 'number' && Number.isFinite(part)) return part;
    requireValue(typeof part === 'object' && !active.has(part));
    const array = Array.isArray(part);
    const prototype = Object.getPrototypeOf(part);
    if (prototype !== null && prototype !== (array ? Array.prototype : Object.prototype)) {
      drainNativePromise(part);
      throw new Error('INSTITUTIONAL_PUBLIC_SOURCE_UNAVAILABLE');
    }
    const ownKeys = Reflect.ownKeys(part);
    requireValue(ownKeys.length <= 129 && ownKeys.every((key) => typeof key === 'string'));
    active.add(part);
    try {
      if (array) {
        const length = Object.getOwnPropertyDescriptor(part, 'length')?.value as unknown;
        requireValue(
          typeof length === 'number' &&
            Number.isSafeInteger(length) &&
            length >= 0 &&
            length <= 128 &&
            ownKeys.length === length + 1,
        );
        const result: unknown[] = [];
        for (let index = 0; index < length; index += 1) {
          const property = Object.getOwnPropertyDescriptor(part, String(index));
          requireValue(property && 'value' in property);
          result.push(visit(property.value, depth + 1));
        }
        return Object.freeze(result);
      }
      const result: Record<string, unknown> = {};
      for (const key of ownKeys as string[]) {
        requireValue(key !== 'then' && key !== 'toJSON');
        const property = Object.getOwnPropertyDescriptor(part, key);
        requireValue(property && 'value' in property);
        Object.defineProperty(result, key, {
          value: visit(property.value, depth + 1),
          enumerable: true,
        });
      }
      return Object.freeze(result);
    } finally {
      active.delete(part);
    }
  };
  return visit(value, 0);
}
function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(left) !== Array.isArray(right)
  )
    return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        same((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
    )
  );
}
function bound(value: unknown): PublicModelContextBinding {
  const result = capture(value);
  requireValue(keys(result, BINDING_KEYS));
  const binding = result as unknown as PublicModelContextBinding;
  for (const key of BINDING_KEYS) {
    if (key === 'gatewayGeneration' || key === 'registrationVersion') {
      requireValue(Number.isSafeInteger(binding[key]) && binding[key] >= 1);
    } else if (key === 'deadlineMs') requireValue(time(binding[key]));
    else requireValue(token(binding[key]));
  }
  requireValue(binding.requestId.length <= 128 && binding.gatewaySessionId.length <= 128);
  return binding;
}
function timestamp(value: unknown): number {
  requireValue(
    typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value),
  );
  const result = Date.parse(value);
  requireValue(time(result));
  return result;
}
function readClock(now: () => number): number {
  const result = now();
  if (!time(result)) {
    drainNativePromise(result);
    throw new Error('INSTITUTIONAL_PUBLIC_SOURCE_UNAVAILABLE');
  }
  return result;
}

function selected(
  value: unknown,
  binding: PublicModelContextBinding,
  projectionReference: string,
  now: number,
): { readonly revision: number; readonly record: MemoryProjectionRecord } {
  const captured = capture(value);
  requireValue(keys(captured, ['kind', 'tenant', 'revision', 'records', 'authorizesExecution']));
  const snapshot = captured as unknown as MemoryFabricSnapshot;
  requireValue(
    snapshot.kind === 'MemoryFabricSnapshot' &&
      keys(snapshot.tenant, ['tenantId']) &&
      snapshot.tenant.tenantId === binding.tenantId &&
      Number.isSafeInteger(snapshot.revision) &&
      snapshot.revision >= 0 &&
      snapshot.authorizesExecution === false &&
      Array.isArray(snapshot.records),
  );
  // Reject duplicate identity even if one duplicate is not read-eligible.
  requireValue(
    snapshot.records.every((item) => plain(item)) &&
      snapshot.records.filter((item) => item.projectionReference === projectionReference).length ===
        1,
  );
  const result = readMemoryProjection({
    snapshot,
    tenant: snapshot.tenant,
    boundary: 'COMPANY',
    key: 'projectionReference',
    value: projectionReference,
    limit: 1,
  });
  requireValue(
    !result.truncated && result.records.length === 1 && result.authorizesExecution === false,
  );
  const record = result.records[0];
  requireValue(record && keys(record, RECORD_KEYS, RECORD_REQUIRED_KEYS));
  requireValue(
    record.kind === 'MemoryProjectionRecord' &&
      record.projectionReference === projectionReference &&
      record.memoryKey === CONTENT.memoryKey &&
      record.boundary === 'COMPANY' &&
      keys(record.tenant, ['tenantId']) &&
      record.tenant.tenantId === binding.tenantId &&
      record.subject === undefined &&
      record.sourceOwner === 'COMPANY_KNOWLEDGE' &&
      record.classification === 'PUBLIC' &&
      record.sourceReference === CONTENT.sourceReference &&
      (record.sourceRevision === undefined || record.sourceRevision === CONTENT.sourceRevision) &&
      record.provenanceReference === CONTENT.provenanceReference &&
      timestamp(record.observedAt) <= now &&
      record.conflictState === 'NONE' &&
      Array.isArray(record.conflictsWithProjectionReferences) &&
      record.conflictsWithProjectionReferences.length === 0 &&
      record.authorizesExecution === false &&
      (record.lifecycle === 'VALIDATED' || record.lifecycle === 'CANONICAL') &&
      Number.isSafeInteger(record.lifecycleRevision) &&
      record.lifecycleRevision >= 1 &&
      record.sourceCommitReference === CONTENT.sourceReference &&
      record.sourceCommitRevision === CONTENT.sourceRevision &&
      text(record.validationReference) &&
      (record.lifecycle !== 'CANONICAL' ||
        (record.lifecycleRevision >= 2 && text(record.promotionReference))) &&
      (record.lifecycle !== 'VALIDATED' || record.promotionReference === undefined) &&
      record.revocationReference === undefined &&
      record.supersededByProjectionReference === undefined &&
      record.supersedeReference === undefined &&
      (record.retentionPolicyReference === undefined || text(record.retentionPolicyReference)),
  );
  requireValue(
    keys(
      record.producer,
      ['kind', 'producerReference', 'providerReference', 'modelReference'],
      ['kind', 'producerReference'],
    ) &&
      MEMORY_PRODUCER_KINDS.includes(record.producer.kind) &&
      text(record.producer.producerReference) &&
      (record.producer.providerReference === undefined ||
        text(record.producer.providerReference)) &&
      (record.producer.modelReference === undefined || text(record.producer.modelReference)),
  );
  requireValue(
    keys(record.content, ['kind', 'digest', 'payload']) &&
      record.content.kind === 'TEXT' &&
      record.content.digest === CONTENT.sourceRevision &&
      CONTENT.sourceRevision === `sha256:${CONTENT.contentSha256}` &&
      record.content.payload === CONTENT.text &&
      contentBytes.byteLength === CONTENT.utf8Bytes &&
      contentBytes.byteLength <= 1_024,
  );
  // Exact bytes are checked against the versioned source, not against two supplied digests.
  // Its SHA-256 is independently verified in the source/proof tests; no async crypto or new hash primitive.
  const bytes = encoder.encode(record.content.payload as string);
  requireValue(
    bytes.byteLength === contentBytes.byteLength &&
      bytes.every((byte, index) => byte === contentBytes[index]),
  );
  return Object.freeze({ revision: snapshot.revision, record });
}

function validRead(
  value: unknown,
  binding: PublicModelContextBinding,
  projectionReference: string,
): boolean {
  const captured = capture(value);
  requireValue(keys(captured, READ_KEYS, READ_REQUIRED_KEYS));
  const request = captured as unknown as ContextSourceReadRequest;
  requireValue(
    keys(request.tenant, ['tenantId']) &&
      request.tenant.tenantId === binding.tenantId &&
      request.correlation?.correlationId === binding.correlationId &&
      request.actor?.identityId === binding.actorIdentityId &&
      request.subject === undefined &&
      request.maxDataClassification === 'PUBLIC' &&
      request.currentness === 'CURRENT_REQUIRED' &&
      request.limit === 1 &&
      keys(request.selector, ['adapterId', 'sourceClass', 'key', 'value']) &&
      request.selector.adapterId === PUBLIC_INSTITUTIONAL_ADAPTER_ID &&
      request.selector.sourceClass === 'COMPANY_KNOWLEDGE' &&
      request.selector.key === 'projectionReference' &&
      request.selector.value === projectionReference &&
      keys(request.deadline, ['deadlineAt']) &&
      timestamp(request.deadline?.deadlineAt) === binding.deadlineMs &&
      (request.requestedFields === undefined ||
        (Array.isArray(request.requestedFields) &&
          request.requestedFields.length === 1 &&
          request.requestedFields[0] === 'payload')),
  );
  // Reuse W06's structural validation. Policy/consent evaluation remains with W02/current owner.
  const { selector, limit, ...queryFields } = request;
  const query: ContextQuery = {
    ...queryFields,
    kind: 'ContextQuery',
    selectors: [selector],
    limits: { maxSourceFanout: 1, maxItemsPerSource: limit, maxTotalItems: limit },
  };
  requireValue(validateContextQuery(query).valid);
  return true;
}

/**
 * Data-only facade for one preparation, not an installed owner, policy or consent source.
 * The trusted owner must supply a genuinely current synchronous snapshot on EVERY read;
 * a W03 async load or a cached MemoryFabricSession.snapshot() cannot impersonate that port.
 * Only the authorized original institutional text is projected. All producer/lifecycle/
 * source-commit/validation/promotion data remain in the private immutable comparison.
 * Never register this facade together with the broad COMPANY adapter under the same id.
 */
export function prepareInstitutionalPublicMemorySource(
  dependencies: InstitutionalPublicMemorySourceDependencies,
): InstitutionalPublicMemorySource | null {
  try {
    requireValue(
      plain(dependencies) && [Object.prototype, null].includes(Object.getPrototypeOf(dependencies)),
    );
    const ownKeys = Reflect.ownKeys(dependencies);
    const allowed = ['binding', 'projectionReference', 'readCurrentSnapshot', 'now'];
    requireValue(
      ownKeys.length === allowed.length &&
        ownKeys.every((key) => typeof key === 'string' && allowed.includes(key)),
    );
    const fields = Object.getOwnPropertyDescriptors(dependencies);
    requireValue(allowed.every((key) => fields[key] && 'value' in fields[key]));
    const binding = bound(fields.binding?.value);
    const projectionReference: unknown = fields.projectionReference?.value;
    const provider = fields.readCurrentSnapshot?.value as unknown;
    const clock = fields.now?.value as unknown;
    requireValue(
      token(projectionReference) && typeof provider === 'function' && typeof clock === 'function',
    );
    const readCurrentSnapshot =
      provider as InstitutionalPublicMemorySourceDependencies['readCurrentSnapshot'];
    const now = clock as () => number;
    const capturedAt = readClock(now);
    requireValue(
      binding.deadlineMs > capturedAt && binding.deadlineMs - capturedAt <= MAX_REQUEST_MS,
    );
    const expiresAt = Math.min(binding.deadlineMs, capturedAt + MAX_CAPTURE_MS);
    const baseline = selected(
      readCurrentSnapshot(binding),
      binding,
      projectionReference,
      capturedAt,
    );
    let lastCheckedAt = readClock(now);
    requireValue(lastCheckedAt >= capturedAt && lastCheckedAt < expiresAt);
    let invalid = false;
    let checking = false;
    const item = Object.freeze({
      sourceReference: baseline.record.sourceReference,
      sourceRevision: baseline.record.sourceCommitRevision,
      tenant: baseline.record.tenant,
      classification: baseline.record.classification,
      observedAt: baseline.record.observedAt,
      provenanceReference: baseline.record.provenanceReference,
      payload: baseline.record.content.payload,
    }) as ContextSourceItem;

    const current = (candidateBinding: unknown): ContextSourceItem | null => {
      if (invalid) return null;
      if (checking) {
        invalid = true;
        return null;
      }
      checking = true;
      try {
        requireValue(same(bound(candidateBinding), binding));
        const before = readClock(now);
        requireValue(before >= lastCheckedAt && before < expiresAt);
        const next = selected(readCurrentSnapshot(binding), binding, projectionReference, before);
        const after = readClock(now);
        requireValue(!invalid && after >= before && after < expiresAt && same(next, baseline));
        lastCheckedAt = after;
        return item;
      } catch {
        invalid = true;
        return null;
      } finally {
        checking = false;
      }
    };
    const adapter: ContextSourceAdapter = Object.freeze({
      descriptor: Object.freeze({
        adapterId: PUBLIC_INSTITUTIONAL_ADAPTER_ID,
        sourceClass: 'COMPANY_KNOWLEDGE' as const,
        readOnly: true as const,
        supportedSelectorKeys: Object.freeze(['projectionReference']),
        maxItemsPerRead: 1,
      }),
      read: async (request: ContextSourceReadRequest) => {
        if (invalid) return EMPTY;
        try {
          requireValue(validRead(request, binding, projectionReference));
          const value = current(binding);
          return value ? Object.freeze({ items: Object.freeze([value]), truncated: false }) : EMPTY;
        } catch {
          invalid = true;
          return EMPTY;
        }
      },
    });
    return Object.freeze({
      adapter,
      readCurrentSource(
        candidateBinding: PublicModelContextBinding,
        adapterId: string,
        sourceReference: string,
      ) {
        if (
          adapterId !== PUBLIC_INSTITUTIONAL_ADAPTER_ID ||
          sourceReference !== CONTENT.sourceReference
        ) {
          invalid = true;
          return null;
        }
        return current(candidateBinding);
      },
    });
  } catch {
    return null;
  }
}
