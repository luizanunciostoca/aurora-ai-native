import type { Rfc3339Timestamp } from '@aurora/contracts/context';

import type { MinimalContextPackage } from '../minimal-context/types.js';
import type { ContextQuery } from '../query/types.js';
import { validateContextQuery } from '../query/validate.js';
import type {
  SemanticCacheCreateReason,
  SemanticCacheCreateRequest,
  SemanticCacheCreateResult,
  SemanticCacheEntry,
  SemanticCacheEvaluationRequest,
  SemanticCacheEvaluationResult,
  SemanticCacheInvalidationResult,
  SemanticCacheInvalidationSignal,
  SemanticCacheSourceVersion,
} from './types.js';

const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_CANONICAL_DEPTH = 32;
const MAX_CANONICAL_NODES = 20_000;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'credential',
  'credentials',
  'secret',
  'secrets',
  'password',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'policytoken',
  'ownerdecision',
  'approvaltoken',
]);

interface CanonicalState {
  nodes: number;
  readonly seen: Set<object>;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validTimestamp(value: unknown): value is Rfc3339Timestamp {
  return (
    typeof value === 'string' && RFC3339_PATTERN.test(value) && Number.isFinite(Date.parse(value))
  );
}

function canonicalPart(value: unknown, state: CanonicalState, depth: number): string | undefined {
  if (depth > MAX_CANONICAL_DEPTH || state.nodes >= MAX_CANONICAL_NODES) return undefined;
  state.nodes += 1;

  if (value === null) return 'null';
  if (typeof value === 'string') return `s:${JSON.stringify(value)}`;
  if (typeof value === 'boolean') return value ? 'b:1' : 'b:0';
  if (typeof value === 'number') return Number.isFinite(value) ? `n:${String(value)}` : undefined;
  if (typeof value !== 'object') return undefined;
  if (state.seen.has(value) || Object.getOwnPropertySymbols(value).length > 0) return undefined;

  state.seen.add(value);
  try {
    if (Array.isArray(value)) {
      const parts: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !('value' in descriptor)) return undefined;
        const part = canonicalPart(descriptor.value, state, depth + 1);
        if (part === undefined) return undefined;
        parts.push(part);
      }
      return `[${parts.join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const parts: string[] = [];
    for (const key of Object.keys(value).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) return undefined;
      const part = canonicalPart(descriptor.value, state, depth + 1);
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

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

function canonicalHash(value: unknown): string | undefined {
  const canonical = canonicalPart(value, { nodes: 0, seen: new Set<object>() }, 0);
  return canonical === undefined ? undefined : fnv1a64(canonical);
}

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function payloadIsCacheable(value: unknown, seen = new Set<object>(), depth = 0): boolean {
  if (depth > MAX_CANONICAL_DEPTH) return false;
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) {
    return typeof value !== 'number' || Number.isFinite(value);
  }
  if (
    typeof value !== 'object' ||
    seen.has(value) ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    return false;
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (
          !descriptor ||
          !('value' in descriptor) ||
          !payloadIsCacheable(descriptor.value, seen, depth + 1)
        ) {
          return false;
        }
      }
      return true;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_PAYLOAD_KEYS.has(normalizedKey(key))) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !('value' in descriptor) ||
        !payloadIsCacheable(descriptor.value, seen, depth + 1)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  } finally {
    seen.delete(value);
  }
}

function packageShapeValid(
  value: MinimalContextPackage | undefined,
): value is MinimalContextPackage {
  return (
    value?.kind === 'MinimalContextPackage' &&
    value.authorizesExecution === false &&
    Array.isArray(value.items) &&
    Array.isArray(value.includedSourceReferences) &&
    Array.isArray(value.excludedSources) &&
    validTimestamp(value.retrievalEvaluatedAt) &&
    validateContextQuery(value.query).valid
  );
}

function sourceVersionsFor(
  packageResult: MinimalContextPackage,
): SemanticCacheSourceVersion[] | undefined {
  const versions: SemanticCacheSourceVersion[] = [];
  const seen = new Set<string>();
  for (const item of packageResult.items) {
    if (
      !nonEmptyString(item.sourceReference) ||
      seen.has(item.sourceReference) ||
      !nonEmptyString(item.sourceRevision) ||
      item.tenant?.tenantId !== packageResult.query.tenant.tenantId ||
      !payloadIsCacheable(item.payload)
    ) {
      return undefined;
    }
    seen.add(item.sourceReference);
    versions.push({ sourceReference: item.sourceReference, sourceRevision: item.sourceRevision });
  }
  return versions.sort((left, right) => left.sourceReference.localeCompare(right.sourceReference));
}

function sameSourceVersions(
  left: readonly SemanticCacheSourceVersion[],
  right: readonly SemanticCacheSourceVersion[],
): boolean {
  if (left.length !== right.length) return false;
  const normalizedLeft = [...left].sort((a, b) =>
    a.sourceReference.localeCompare(b.sourceReference),
  );
  const normalizedRight = [...right].sort((a, b) =>
    a.sourceReference.localeCompare(b.sourceReference),
  );
  return normalizedLeft.every(
    (value, index) =>
      value.sourceReference === normalizedRight[index]?.sourceReference &&
      value.sourceRevision === normalizedRight[index]?.sourceRevision,
  );
}

function queryFingerprint(query: ContextQuery): string | undefined {
  if (!validateContextQuery(query).valid) return undefined;
  return canonicalHash(query);
}

function cacheKeyFor(queryFingerprintValue: string, configVersion: string): string {
  return fnv1a64(`semantic-cache|${queryFingerprintValue}|${configVersion}`);
}

function invalidCreateResult(
  reasons: readonly SemanticCacheCreateReason[],
): SemanticCacheCreateResult {
  return {
    kind: 'SemanticCacheCreateResult',
    valid: false,
    reasons: [...new Set(reasons)],
    authorizesExecution: false,
  };
}

export function createSemanticCacheEntry(
  request: SemanticCacheCreateRequest,
): SemanticCacheCreateResult {
  const reasons: SemanticCacheCreateReason[] = [];
  const packageResult = request?.package;
  const packageValid = packageShapeValid(packageResult);
  if (!packageValid) reasons.push('INVALID_PACKAGE');
  if (!nonEmptyString(request?.configVersion)) reasons.push('INVALID_CONFIG_VERSION');
  if (!validTimestamp(request?.createdAt)) reasons.push('INVALID_CREATED_AT');
  if (!Number.isSafeInteger(request?.ttlMs) || request.ttlMs < 1 || request.ttlMs > MAX_TTL_MS) {
    reasons.push('INVALID_TTL');
  }

  const versions = packageValid ? sourceVersionsFor(packageResult) : undefined;
  if (packageValid && !versions) {
    if (packageResult.items.some((item) => !nonEmptyString(item?.sourceRevision))) {
      reasons.push('SOURCE_REVISION_REQUIRED');
    } else {
      reasons.push('SENSITIVE_VALUE_REJECTED');
    }
  }
  const fingerprint = packageValid ? queryFingerprint(packageResult.query) : undefined;
  if (packageValid && !fingerprint) reasons.push('INVALID_PACKAGE');

  if (
    reasons.length > 0 ||
    !packageValid ||
    !versions ||
    !fingerprint ||
    !validTimestamp(request.createdAt)
  ) {
    return invalidCreateResult(reasons);
  }

  const expiresMs = Date.parse(request.createdAt) + request.ttlMs;
  if (!Number.isFinite(expiresMs)) return invalidCreateResult(['INVALID_TTL']);
  const expiresAt = new Date(expiresMs).toISOString() as Rfc3339Timestamp;
  const entry: SemanticCacheEntry = {
    kind: 'SemanticCacheEntry',
    cacheKey: cacheKeyFor(fingerprint, request.configVersion),
    queryFingerprint: fingerprint,
    tenant: packageResult.query.tenant,
    maxDataClassification: packageResult.query.maxDataClassification,
    package: packageResult,
    configVersion: request.configVersion,
    sourceVersions: versions,
    createdAt: request.createdAt,
    expiresAt,
    invalidated: false,
    invalidationCursors: [],
    authorizesExecution: false,
  };
  return {
    kind: 'SemanticCacheCreateResult',
    valid: true,
    reasons: [],
    entry,
    authorizesExecution: false,
  };
}

function evaluationResult(
  status: SemanticCacheEvaluationResult['status'],
  packageResult?: MinimalContextPackage,
): SemanticCacheEvaluationResult {
  return {
    kind: 'SemanticCacheEvaluationResult',
    status,
    ...(packageResult ? { package: packageResult } : {}),
    authorizesExecution: false,
  };
}

export function evaluateSemanticCache(
  request: SemanticCacheEvaluationRequest,
): SemanticCacheEvaluationResult {
  if (
    !request?.query ||
    !request.entry ||
    !Array.isArray(request.expectedSourceVersions) ||
    !validTimestamp(request.evaluatedAt) ||
    !nonEmptyString(request.configVersion)
  ) {
    return evaluationResult('INCOMPATIBLE_REJECTED');
  }
  const fingerprint = queryFingerprint(request.query);
  if (!fingerprint) return evaluationResult('INCOMPATIBLE_REJECTED');
  if (request.query.tenant.tenantId !== request.entry.tenant.tenantId) {
    return evaluationResult('INCOMPATIBLE_REJECTED');
  }
  if (request.entry.maxDataClassification !== request.query.maxDataClassification) {
    return evaluationResult('INCOMPATIBLE_REJECTED');
  }
  if (request.entry.invalidated) return evaluationResult('INVALIDATED_REJECTED');
  if (
    request.entry.queryFingerprint !== fingerprint ||
    request.entry.cacheKey !== cacheKeyFor(fingerprint, request.entry.configVersion)
  ) {
    return evaluationResult('MISS');
  }
  if (request.entry.configVersion !== request.configVersion) {
    return evaluationResult('STALE_REJECTED');
  }
  if (Date.parse(request.evaluatedAt) >= Date.parse(request.entry.expiresAt)) {
    return evaluationResult('STALE_REJECTED');
  }
  if (!sameSourceVersions(request.entry.sourceVersions, request.expectedSourceVersions)) {
    return evaluationResult('STALE_REJECTED');
  }
  if (
    request.query.currentness === 'CURRENT_REQUIRED' &&
    request.entry.package.items.some((item) => item.retrieval.freshness.state !== 'CURRENT')
  ) {
    return evaluationResult('STALE_REJECTED');
  }
  return evaluationResult('HIT', request.entry.package);
}

function invalidationResult(
  status: SemanticCacheInvalidationResult['status'],
  entry: SemanticCacheEntry,
): SemanticCacheInvalidationResult {
  return {
    kind: 'SemanticCacheInvalidationResult',
    status,
    entry,
    authorizesExecution: false,
  };
}

export function applySemanticCacheInvalidation(
  entry: SemanticCacheEntry,
  signal: SemanticCacheInvalidationSignal,
): SemanticCacheInvalidationResult {
  if (
    signal?.kind !== 'SemanticCacheInvalidationSignal' ||
    signal.authorizesExecution !== false ||
    !nonEmptyString(signal.eventId) ||
    !nonEmptyString(signal.streamKey) ||
    !Number.isSafeInteger(signal.sequence) ||
    signal.sequence < 1 ||
    !validTimestamp(signal.occurredAt) ||
    !nonEmptyString(signal.sourceReference) ||
    !nonEmptyString(signal.nextSourceRevision)
  ) {
    return invalidationResult('INVALID_SIGNAL', entry);
  }
  if (signal.tenant?.tenantId !== entry.tenant.tenantId) {
    return invalidationResult('TENANT_REJECTED', entry);
  }

  const currentSource = entry.sourceVersions.find(
    (source) => source.sourceReference === signal.sourceReference,
  );
  if (!currentSource) return invalidationResult('SOURCE_NOT_PRESENT', entry);
  const currentCursor = entry.invalidationCursors.find(
    (cursor) => cursor.streamKey === signal.streamKey,
  );
  if (currentCursor?.sequence === signal.sequence && currentCursor.eventId === signal.eventId) {
    return invalidationResult('DUPLICATE', entry);
  }
  if (currentCursor && signal.sequence <= currentCursor.sequence) {
    return invalidationResult('OUT_OF_ORDER_REJECTED', entry);
  }

  const nextCursor = {
    streamKey: signal.streamKey,
    sequence: signal.sequence,
    eventId: signal.eventId,
  };
  const invalidationCursors = [
    ...entry.invalidationCursors.filter((cursor) => cursor.streamKey !== signal.streamKey),
    nextCursor,
  ].sort((left, right) => left.streamKey.localeCompare(right.streamKey));

  if (currentSource.sourceRevision === signal.nextSourceRevision) {
    return invalidationResult('NO_CHANGE', { ...entry, invalidationCursors });
  }
  return invalidationResult('APPLIED', {
    ...entry,
    invalidated: true,
    invalidatedAt: signal.occurredAt,
    invalidationCursors,
  });
}

export type {
  SemanticCacheCreateReason,
  SemanticCacheCreateRequest,
  SemanticCacheCreateResult,
  SemanticCacheEntry,
  SemanticCacheEvaluationRequest,
  SemanticCacheEvaluationResult,
  SemanticCacheEvaluationStatus,
  SemanticCacheInvalidationCursor,
  SemanticCacheInvalidationResult,
  SemanticCacheInvalidationSignal,
  SemanticCacheInvalidationStatus,
  SemanticCacheSourceVersion,
} from './types.js';
