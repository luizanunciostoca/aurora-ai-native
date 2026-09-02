import type { DataClassification, Rfc3339Timestamp, SubjectRef } from '@aurora/contracts/context';

import { validateContextQuery } from '../query/validate.js';
import { CONTEXT_SOURCE_CLASSES } from '../query/types.js';
import type { ContextSourceClass } from '../query/types.js';
import type { AcquiredContextItem } from '../sources/types.js';
import type {
  ContextFreshnessEvaluation,
  ContextRetrievalPolicy,
  ContextRetrievalRejection,
  ContextRetrievalRequest,
  ContextRetrievalResult,
  ContextRetrievalUncertainty,
  RankedContextItem,
} from './types.js';

const CLASSIFICATION_ORDER: Readonly<Record<DataClassification, number>> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
};

const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_CANONICAL_PAYLOAD_DEPTH = 32;
const MAX_CANONICAL_PAYLOAD_NODES = 10_000;

interface EvaluatedCandidate {
  readonly item: AcquiredContextItem;
  readonly trustBps: number;
  readonly freshness: ContextFreshnessEvaluation;
  readonly payloadKey: string;
  readonly conflictKey: string;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' && RFC3339_PATTERN.test(value) && Number.isFinite(Date.parse(value))
  );
}

function validBps(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10_000;
}

function validAgeLimit(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
  );
}

function plainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownDataProperty(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function classificationRank(value: unknown): number | undefined {
  if (
    typeof value !== 'string' ||
    !Object.prototype.hasOwnProperty.call(CLASSIFICATION_ORDER, value)
  ) {
    return undefined;
  }
  return CLASSIFICATION_ORDER[value as DataClassification];
}

function validSubject(value: unknown): value is SubjectRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const subject = value as Record<string, unknown>;
  if (subject.kind === 'IDENTITY') return nonEmptyString(subject.identityId);
  if (subject.kind !== 'EXTERNAL_IDENTITY') return false;
  const external = subject.externalIdentity;
  if (!external || typeof external !== 'object' || Array.isArray(external)) return false;
  const identity = external as Record<string, unknown>;
  return nonEmptyString(identity.provider) && nonEmptyString(identity.externalId);
}

function sameSubject(a: SubjectRef, b: SubjectRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'IDENTITY' && b.kind === 'IDENTITY') return a.identityId === b.identityId;
  if (a.kind === 'EXTERNAL_IDENTITY' && b.kind === 'EXTERNAL_IDENTITY') {
    return (
      a.externalIdentity.provider === b.externalIdentity.provider &&
      a.externalIdentity.externalId === b.externalIdentity.externalId
    );
  }
  return false;
}

function policyValid(policy: ContextRetrievalPolicy): boolean {
  if (!policy || !validTimestamp(policy.evaluatedAt) || !validBps(policy.minimumTrustBps)) {
    return false;
  }
  if (!plainRecord(policy.trustBpsByAdapter)) return false;
  for (const adapterId of Object.keys(policy.trustBpsByAdapter)) {
    const value = ownDataProperty(policy.trustBpsByAdapter, adapterId);
    if (!nonEmptyString(adapterId) || !validBps(value)) return false;
  }
  if (!plainRecord(policy.maxAgeMsBySourceClass)) return false;
  for (const sourceClass of Object.keys(policy.maxAgeMsBySourceClass)) {
    const value = ownDataProperty(policy.maxAgeMsBySourceClass, sourceClass);
    if (
      !CONTEXT_SOURCE_CLASSES.includes(sourceClass as ContextSourceClass) ||
      !validAgeLimit(value)
    ) {
      return false;
    }
  }
  if (policy.conflictKeyBySourceReference !== undefined) {
    if (!plainRecord(policy.conflictKeyBySourceReference)) return false;
    for (const sourceReference of Object.keys(policy.conflictKeyBySourceReference)) {
      const conflictKey = ownDataProperty(policy.conflictKeyBySourceReference, sourceReference);
      if (!nonEmptyString(sourceReference) || !nonEmptyString(conflictKey)) return false;
    }
  }
  return true;
}

function acquisitionValid(request: ContextRetrievalRequest): boolean {
  const acquisition = request.acquisition;
  return (
    acquisition?.kind === 'ContextAcquisitionResult' &&
    Array.isArray(acquisition.items) &&
    Array.isArray(acquisition.rejections) &&
    Array.isArray(acquisition.invokedAdapters) &&
    acquisition.authorizesExecution === false
  );
}

function sourceRequested(request: ContextRetrievalRequest, item: AcquiredContextItem): boolean {
  return request.query.selectors.some(
    (selector) =>
      selector.adapterId === item.adapterId && selector.sourceClass === item.sourceClass,
  );
}

function baseItemReason(
  request: ContextRetrievalRequest,
  item: AcquiredContextItem,
): ContextRetrievalRejection['reason'] | undefined {
  if (
    !item ||
    !nonEmptyString(item.sourceReference) ||
    !nonEmptyString(item.adapterId) ||
    !CONTEXT_SOURCE_CLASSES.includes(item.sourceClass) ||
    !item.tenant ||
    !nonEmptyString(item.tenant.tenantId) ||
    item.payload === undefined ||
    (item.subject !== undefined && !validSubject(item.subject)) ||
    (item.sourceRevision !== undefined && !nonEmptyString(item.sourceRevision))
  ) {
    return 'INVALID_SOURCE_ITEM';
  }
  if (!sourceRequested(request, item)) return 'UNREQUESTED_SOURCE_ITEM';
  if (item.tenant.tenantId !== request.query.tenant.tenantId) return 'CROSS_TENANT_ITEM';
  if (request.query.subject && item.subject && !sameSubject(request.query.subject, item.subject)) {
    return 'SUBJECT_MISMATCH';
  }
  const itemRank = classificationRank(item.classification);
  const maxRank = classificationRank(request.query.maxDataClassification);
  if (itemRank === undefined || maxRank === undefined) return 'CLASSIFICATION_INVALID';
  if (itemRank > maxRank) return 'CLASSIFICATION_EXCEEDED';
  if (!nonEmptyString(item.provenanceReference)) return 'MISSING_PROVENANCE';
  if (!validTimestamp(item.observedAt)) return 'INVALID_OBSERVED_AT';
  return undefined;
}

function freshnessFor(
  request: ContextRetrievalRequest,
  item: AcquiredContextItem,
): ContextFreshnessEvaluation | ContextRetrievalRejection['reason'] {
  const evaluatedMs = Date.parse(request.policy.evaluatedAt);
  const observedMs = Date.parse(item.observedAt);
  const ageMs = evaluatedMs - observedMs;
  if (ageMs < 0) return 'FUTURE_OBSERVATION';

  const configuredMaxAgeMs = ownDataProperty(
    request.policy.maxAgeMsBySourceClass,
    item.sourceClass,
  );
  const maxAgeMs = validAgeLimit(configuredMaxAgeMs) ? configuredMaxAgeMs : undefined;
  if (maxAgeMs === undefined) {
    if (request.query.currentness === 'CURRENT_REQUIRED') return 'FRESHNESS_RULE_MISSING';
    return {
      state: 'UNKNOWN',
      evaluatedAt: request.policy.evaluatedAt,
      observedAt: item.observedAt,
      ageMs,
    };
  }

  if (ageMs <= maxAgeMs) {
    return {
      state: 'CURRENT',
      evaluatedAt: request.policy.evaluatedAt,
      observedAt: item.observedAt,
      ageMs,
      maxAgeMs,
    };
  }
  if (request.query.currentness === 'CURRENT_REQUIRED') return 'STALE_CURRENT_REQUIRED';
  return {
    state: 'HISTORICAL',
    evaluatedAt: request.policy.evaluatedAt,
    observedAt: item.observedAt,
    ageMs,
    maxAgeMs,
  };
}

interface CanonicalState {
  nodes: number;
  readonly seen: Set<object>;
}

function canonicalPayloadPart(
  value: unknown,
  state: CanonicalState,
  depth: number,
): string | undefined {
  if (depth > MAX_CANONICAL_PAYLOAD_DEPTH || state.nodes >= MAX_CANONICAL_PAYLOAD_NODES) {
    return undefined;
  }
  state.nodes += 1;

  if (value === null) return 'null';
  if (typeof value === 'string') return `s:${JSON.stringify(value)}`;
  if (typeof value === 'boolean') return value ? 'b:1' : 'b:0';
  if (typeof value === 'number') return Number.isFinite(value) ? `n:${String(value)}` : undefined;
  if (typeof value !== 'object') return undefined;
  if (state.seen.has(value)) return undefined;

  state.seen.add(value);
  try {
    if (Array.isArray(value)) {
      const parts: string[] = [];
      for (const entry of value) {
        const part = canonicalPayloadPart(entry, state, depth + 1);
        if (part === undefined) return undefined;
        parts.push(part);
      }
      return `[${parts.join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const record = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of Object.keys(record).sort()) {
      const part = canonicalPayloadPart(record[key], state, depth + 1);
      if (part === undefined) return undefined;
      parts.push(`${JSON.stringify(key)}:${part}`);
    }
    return `{${parts.join(',')}}`;
  } catch {
    return undefined;
  } finally {
    state.seen.delete(value);
  }
}

function canonicalPayload(value: unknown): string | undefined {
  return canonicalPayloadPart(value, { nodes: 0, seen: new Set<object>() }, 0);
}

function rejection(
  item: AcquiredContextItem | undefined,
  reason: ContextRetrievalRejection['reason'],
): ContextRetrievalRejection {
  if (!item) return { reason };
  return {
    ...(nonEmptyString(item.sourceReference) ? { sourceReference: item.sourceReference } : {}),
    ...(nonEmptyString(item.adapterId) ? { adapterId: item.adapterId } : {}),
    reason,
  };
}

function evaluateCandidate(
  request: ContextRetrievalRequest,
  item: AcquiredContextItem,
): EvaluatedCandidate | ContextRetrievalRejection {
  const baseReason = baseItemReason(request, item);
  if (baseReason) return rejection(item, baseReason);

  const configuredTrustBps = ownDataProperty(request.policy.trustBpsByAdapter, item.adapterId);
  if (!validBps(configuredTrustBps)) return rejection(item, 'TRUST_UNKNOWN');
  const trustBps = configuredTrustBps;
  if (trustBps < request.policy.minimumTrustBps) {
    return rejection(item, 'TRUST_BELOW_MINIMUM');
  }

  const freshness = freshnessFor(request, item);
  if (typeof freshness === 'string') return rejection(item, freshness);

  const payloadKey = canonicalPayload(item.payload);
  if (payloadKey === undefined) return rejection(item, 'PAYLOAD_UNRANKABLE');

  const configuredConflictKey = request.policy.conflictKeyBySourceReference
    ? ownDataProperty(request.policy.conflictKeyBySourceReference, item.sourceReference)
    : undefined;

  return {
    item,
    trustBps,
    freshness,
    payloadKey,
    conflictKey: nonEmptyString(configuredConflictKey)
      ? configuredConflictKey
      : item.sourceReference,
  };
}

function sourceIdentityKey(candidate: EvaluatedCandidate): string {
  const item = candidate.item;
  return JSON.stringify([
    item.adapterId,
    item.sourceClass,
    item.tenant.tenantId,
    item.subject ?? null,
    item.classification,
    item.observedAt,
    item.sourceRevision ?? null,
    item.provenanceReference,
    candidate.payloadKey,
  ]);
}

function deduplicateSourceIdentity(
  candidates: readonly EvaluatedCandidate[],
  rejections: ContextRetrievalRejection[],
): EvaluatedCandidate[] {
  const byReference = new Map<string, EvaluatedCandidate[]>();
  for (const candidate of candidates) {
    const existing = byReference.get(candidate.item.sourceReference) ?? [];
    existing.push(candidate);
    byReference.set(candidate.item.sourceReference, existing);
  }

  const kept: EvaluatedCandidate[] = [];
  for (const sourceReference of [...byReference.keys()].sort()) {
    const group = byReference.get(sourceReference) ?? [];
    if (group.length === 1) {
      const only = group[0];
      if (only) kept.push(only);
      continue;
    }
    const identities = new Set(group.map(sourceIdentityKey));
    if (identities.size > 1) {
      for (const candidate of group) {
        rejections.push(rejection(candidate.item, 'SOURCE_IDENTITY_CONFLICT'));
      }
      continue;
    }
    const canonical = group[0];
    if (canonical) kept.push(canonical);
    for (let index = 1; index < group.length; index += 1) {
      rejections.push(rejection(group[index]?.item, 'DUPLICATE_SOURCE_ITEM'));
    }
  }
  return kept;
}

function freshnessWeight(freshness: ContextFreshnessEvaluation): number {
  if (freshness.state === 'CURRENT') return 2;
  if (freshness.state === 'HISTORICAL') return 1;
  return 0;
}

function buildRankedItems(candidates: readonly EvaluatedCandidate[]): RankedContextItem[] {
  const byConflictKey = new Map<string, EvaluatedCandidate[]>();
  for (const candidate of candidates) {
    const group = byConflictKey.get(candidate.conflictKey) ?? [];
    group.push(candidate);
    byConflictKey.set(candidate.conflictKey, group);
  }

  const annotated = candidates.map((candidate) => {
    const group = byConflictKey.get(candidate.conflictKey) ?? [candidate];
    const conflicting = new Set(group.map((entry) => entry.payloadKey)).size > 1;
    const peerSourceReferences = group
      .map((entry) => entry.item.sourceReference)
      .filter((sourceReference) => sourceReference !== candidate.item.sourceReference)
      .sort();
    const uncertainty: ContextRetrievalUncertainty[] = [];
    if (candidate.freshness.state === 'HISTORICAL') uncertainty.push('HISTORICAL_SOURCE');
    if (candidate.freshness.state === 'UNKNOWN') uncertainty.push('FRESHNESS_UNKNOWN');
    if (!candidate.item.sourceRevision) uncertainty.push('SOURCE_REVISION_UNKNOWN');
    if (conflicting) uncertainty.push('CONFLICTING_FACT');

    return {
      candidate,
      conflicting,
      peerSourceReferences,
      uncertainty,
    };
  });

  annotated.sort((a, b) => {
    if (a.candidate.trustBps !== b.candidate.trustBps) {
      return b.candidate.trustBps - a.candidate.trustBps;
    }
    const freshnessDelta =
      freshnessWeight(b.candidate.freshness) - freshnessWeight(a.candidate.freshness);
    if (freshnessDelta !== 0) return freshnessDelta;
    if (a.conflicting !== b.conflicting) return a.conflicting ? 1 : -1;
    const observedDelta =
      Date.parse(b.candidate.item.observedAt) - Date.parse(a.candidate.item.observedAt);
    if (observedDelta !== 0) return observedDelta;
    const sourceClassDelta = a.candidate.item.sourceClass.localeCompare(
      b.candidate.item.sourceClass,
    );
    if (sourceClassDelta !== 0) return sourceClassDelta;
    const adapterDelta = a.candidate.item.adapterId.localeCompare(b.candidate.item.adapterId);
    if (adapterDelta !== 0) return adapterDelta;
    const referenceDelta = a.candidate.item.sourceReference.localeCompare(
      b.candidate.item.sourceReference,
    );
    if (referenceDelta !== 0) return referenceDelta;
    return (a.candidate.item.sourceRevision ?? '').localeCompare(
      b.candidate.item.sourceRevision ?? '',
    );
  });

  return annotated.map((entry, index) => ({
    ...entry.candidate.item,
    retrieval: {
      rank: index + 1,
      trust: {
        scoreBps: entry.candidate.trustBps,
        basis: 'ADAPTER_CONFIG',
        adapterId: entry.candidate.item.adapterId,
      },
      freshness: entry.candidate.freshness,
      conflict: {
        state: entry.conflicting ? 'CONFLICTING' : 'NONE',
        key: entry.candidate.conflictKey,
        peerSourceReferences: entry.peerSourceReferences,
      },
      uncertainty: entry.uncertainty,
    },
  }));
}

/**
 * W06-B evaluates acquired read-only context evidence. Ranking/trust/freshness
 * are informational and this function can never grant execution authority.
 */
export function evaluateContextRetrieval(request: ContextRetrievalRequest): ContextRetrievalResult {
  const evaluatedAt = request?.policy?.evaluatedAt;
  const fallbackEvaluatedAt = validTimestamp(evaluatedAt)
    ? (evaluatedAt as Rfc3339Timestamp)
    : ('1970-01-01T00:00:00Z' as Rfc3339Timestamp);

  const queryValidation = request?.query ? validateContextQuery(request.query) : { valid: false };
  if (!queryValidation.valid) {
    return {
      kind: 'ContextRetrievalResult',
      evaluatedAt: fallbackEvaluatedAt,
      items: [],
      rejections: [{ reason: 'QUERY_INVALID' }],
      upstreamRejections: request?.acquisition?.rejections ?? [],
      authorizesExecution: false,
    };
  }
  if (!acquisitionValid(request)) {
    return {
      kind: 'ContextRetrievalResult',
      evaluatedAt: fallbackEvaluatedAt,
      items: [],
      rejections: [{ reason: 'ACQUISITION_INVALID' }],
      upstreamRejections: request?.acquisition?.rejections ?? [],
      authorizesExecution: false,
    };
  }
  if (!policyValid(request.policy)) {
    return {
      kind: 'ContextRetrievalResult',
      evaluatedAt: fallbackEvaluatedAt,
      items: [],
      rejections: [{ reason: 'POLICY_INVALID' }],
      upstreamRejections: request.acquisition.rejections,
      authorizesExecution: false,
    };
  }

  const rejections: ContextRetrievalRejection[] = [];
  const candidates: EvaluatedCandidate[] = [];
  for (const item of request.acquisition.items) {
    const result = evaluateCandidate(request, item);
    if ('reason' in result) rejections.push(result);
    else candidates.push(result);
  }

  const deduplicated = deduplicateSourceIdentity(candidates, rejections);
  return {
    kind: 'ContextRetrievalResult',
    evaluatedAt: request.policy.evaluatedAt,
    items: buildRankedItems(deduplicated),
    rejections,
    upstreamRejections: request.acquisition.rejections,
    authorizesExecution: false,
  };
}
