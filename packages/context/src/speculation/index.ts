import type { Rfc3339Timestamp } from '@aurora/contracts/context';

import type { MinimalContextPackage } from '../minimal-context/types.js';
import { evaluateSemanticCache } from '../semantic-cache/index.js';
import type { SemanticCacheEntry } from '../semantic-cache/types.js';
import { compileContextSnapshot } from '../snapshots/index.js';
import type { ContextSnapshot, ContextSnapshotSourceState } from '../snapshots/types.js';
import type {
  SpeculativeCancellationResult,
  SpeculativeCancellationSignal,
  SpeculativePreparation,
  SpeculativePreparationReason,
  SpeculativePreparationRequest,
  SpeculativePreparationResult,
  SpeculativePreparationUnit,
  SpeculativeReuseRequest,
  SpeculativeReuseResult,
  SpeculativeReuseStatus,
  SpeculativeSourceBinding,
} from './types.js';

const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_SPECULATION_UNITS = 256;

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validTimestamp(value: unknown): value is Rfc3339Timestamp {
  return (
    typeof value === 'string' && RFC3339_PATTERN.test(value) && Number.isFinite(Date.parse(value))
  );
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

function sourceBindingsFor(snapshot: ContextSnapshot): SpeculativeSourceBinding[] | undefined {
  const seen = new Set<string>();
  const bindings: SpeculativeSourceBinding[] = [];
  for (const state of snapshot.sourceStates) {
    if (
      !nonEmptyString(state.sourceReference) ||
      !nonEmptyString(state.sourceRevision) ||
      seen.has(state.sourceReference)
    ) {
      return undefined;
    }
    seen.add(state.sourceReference);
    bindings.push({
      sourceReference: state.sourceReference,
      sourceRevision: state.sourceRevision,
    });
  }
  return bindings.sort((left, right) => left.sourceReference.localeCompare(right.sourceReference));
}

function sameSourceBindings(
  left: readonly SpeculativeSourceBinding[],
  right: readonly SpeculativeSourceBinding[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (binding, index) =>
      binding.sourceReference === right[index]?.sourceReference &&
      binding.sourceRevision === right[index]?.sourceRevision,
  );
}

function sameSourceProjection(
  left: readonly ContextSnapshotSourceState[],
  right: readonly ContextSnapshotSourceState[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((state, index) => {
    const peer = right[index];
    return (
      peer !== undefined &&
      state.sourceReference === peer.sourceReference &&
      state.sourceRevision === peer.sourceRevision &&
      state.provenanceReference === peer.provenanceReference &&
      state.boundary === peer.boundary &&
      state.classification === peer.classification &&
      state.observedAt === peer.observedAt
    );
  });
}

function snapshotMatchesPackage(
  packageResult: MinimalContextPackage,
  snapshot: ContextSnapshot,
): boolean {
  if (
    packageResult?.kind !== 'MinimalContextPackage' ||
    packageResult.authorizesExecution !== false ||
    snapshot?.kind !== 'ContextSnapshot' ||
    snapshot.authorizesExecution !== false ||
    snapshot.status !== 'CURRENT' ||
    snapshot.invalidatedSourceReferences.length !== 0 ||
    !Number.isSafeInteger(snapshot.version) ||
    snapshot.version < 1 ||
    !nonEmptyString(snapshot.snapshotHash) ||
    !nonEmptyString(snapshot.contentHash)
  ) {
    return false;
  }

  const compiled = compileContextSnapshot({
    package: packageResult,
    compiledAt: snapshot.compiledAt,
  });
  if (!compiled.valid) return false;
  const canonical = compiled.snapshot;

  return (
    snapshot.tenant.tenantId === packageResult.query.tenant.tenantId &&
    snapshot.tenant.tenantId === canonical.tenant.tenantId &&
    snapshot.queryFingerprint === canonical.queryFingerprint &&
    snapshot.contentHash === canonical.contentHash &&
    snapshot.retrievalEvaluatedAt === canonical.retrievalEvaluatedAt &&
    sameStrings(snapshot.includedSourceReferences, canonical.includedSourceReferences) &&
    sameStrings(snapshot.excludedSourceReferences, canonical.excludedSourceReferences) &&
    sameStrings(snapshot.provenanceReferences, canonical.provenanceReferences) &&
    sameSourceProjection(snapshot.sourceStates, canonical.sourceStates)
  );
}

function cacheIsCompatible(
  cacheEntry: SemanticCacheEntry,
  packageResult: MinimalContextPackage,
  snapshot: ContextSnapshot,
  configVersion: string,
  evaluatedAt: Rfc3339Timestamp,
): boolean {
  if (
    cacheEntry?.kind !== 'SemanticCacheEntry' ||
    cacheEntry.authorizesExecution !== false ||
    cacheEntry.tenant.tenantId !== snapshot.tenant.tenantId ||
    cacheEntry.queryFingerprint !== snapshot.queryFingerprint
  ) {
    return false;
  }

  const expectedSourceVersions = sourceBindingsFor(snapshot);
  if (!expectedSourceVersions) return false;
  return (
    evaluateSemanticCache({
      query: packageResult.query,
      entry: cacheEntry,
      evaluatedAt,
      configVersion,
      expectedSourceVersions,
    }).status === 'HIT'
  );
}

function invalidPreparationResult(
  reasons: readonly SpeculativePreparationReason[],
): SpeculativePreparationResult {
  return {
    kind: 'SpeculativePreparationResult',
    valid: false,
    reasons: [...new Set(reasons)],
    authorizesExecution: false,
  };
}

function buildUnits(
  packageResult: MinimalContextPackage,
  bindings: readonly SpeculativeSourceBinding[],
  cacheEntry?: SemanticCacheEntry,
): SpeculativePreparationUnit[] {
  const units: SpeculativePreparationUnit[] = bindings.map((binding) => ({
    kind: 'PREFETCH_BINDING',
    unitKey: fnv1a64(`prefetch|${binding.sourceReference}|${binding.sourceRevision}`),
    sourceReference: binding.sourceReference,
    sourceRevision: binding.sourceRevision,
    authorizesExecution: false,
  }));

  units.push({
    kind: 'PRE_RANK_PACKAGE',
    unitKey: fnv1a64(`pre-rank|${JSON.stringify(packageResult.includedSourceReferences)}`),
    orderedSourceReferences: [...packageResult.includedSourceReferences],
    authorizesExecution: false,
  });

  if (cacheEntry) {
    units.push({
      kind: 'PRECOMPUTE_CACHE_LOOKUP',
      unitKey: fnv1a64(`cache-lookup|${cacheEntry.cacheKey}|${cacheEntry.configVersion}`),
      cacheKey: cacheEntry.cacheKey,
      authorizesExecution: false,
    });
  }
  return units;
}

export function prepareSpeculativeContext(
  request: SpeculativePreparationRequest,
): SpeculativePreparationResult {
  const reasons: SpeculativePreparationReason[] = [];
  const packageResult = request?.package;
  const snapshot = request?.snapshot;

  if (!packageResult || !snapshot) reasons.push('INVALID_REQUEST');
  if (!validTimestamp(request?.preparedAt) || !validTimestamp(request?.deadlineAt)) {
    reasons.push('INVALID_TIME');
  }
  if (!nonEmptyString(request?.policyCompatibilityVersion)) {
    reasons.push('INVALID_POLICY_VERSION');
  }
  if (!nonEmptyString(request?.configVersion)) reasons.push('INVALID_CONFIG_VERSION');
  if (
    !Number.isSafeInteger(request?.limits?.maxUnits) ||
    request.limits.maxUnits < 1 ||
    request.limits.maxUnits > MAX_SPECULATION_UNITS
  ) {
    reasons.push('INVALID_LIMITS');
  }

  if (packageResult && snapshot) {
    if (snapshot.status !== 'CURRENT' || snapshot.invalidatedSourceReferences.length > 0) {
      reasons.push('SNAPSHOT_NOT_CURRENT');
    }
    if (!snapshotMatchesPackage(packageResult, snapshot)) reasons.push('SNAPSHOT_MISMATCH');
  }

  if (validTimestamp(request?.preparedAt) && validTimestamp(request?.deadlineAt)) {
    if (Date.parse(request.preparedAt) >= Date.parse(request.deadlineAt)) {
      reasons.push('DEADLINE_EXPIRED');
    }
    const queryDeadline = packageResult?.query?.deadline?.deadlineAt;
    if (
      validTimestamp(queryDeadline) &&
      Date.parse(request.deadlineAt) > Date.parse(queryDeadline)
    ) {
      reasons.push('QUERY_DEADLINE_EXCEEDED');
    }
  }

  const bindings = snapshot ? sourceBindingsFor(snapshot) : undefined;
  if (snapshot && !bindings) reasons.push('SNAPSHOT_MISMATCH');

  if (
    request?.cacheEntry &&
    packageResult &&
    snapshot &&
    validTimestamp(request.preparedAt) &&
    nonEmptyString(request.configVersion) &&
    !cacheIsCompatible(
      request.cacheEntry,
      packageResult,
      snapshot,
      request.configVersion,
      request.preparedAt,
    )
  ) {
    reasons.push('CACHE_INCOMPATIBLE');
  }

  const units = packageResult && bindings ? buildUnits(packageResult, bindings, request.cacheEntry) : [];
  if (
    Number.isSafeInteger(request?.limits?.maxUnits) &&
    units.length > request.limits.maxUnits
  ) {
    reasons.push('SPECULATION_LIMIT_EXCEEDED');
  }

  if (
    reasons.length > 0 ||
    !packageResult ||
    !snapshot ||
    !bindings ||
    !validTimestamp(request.preparedAt) ||
    !validTimestamp(request.deadlineAt)
  ) {
    return invalidPreparationResult(reasons);
  }

  const preparationId = fnv1a64(
    [
      'speculation',
      snapshot.snapshotHash,
      snapshot.contentHash,
      snapshot.queryFingerprint,
      request.policyCompatibilityVersion,
      request.configVersion,
      request.preparedAt,
      request.deadlineAt,
      JSON.stringify(bindings),
      JSON.stringify(units),
    ].join('|'),
  );

  const preparation: SpeculativePreparation = {
    kind: 'SpeculativePreparation',
    preparationId,
    tenant: snapshot.tenant,
    queryFingerprint: snapshot.queryFingerprint,
    snapshotHash: snapshot.snapshotHash,
    snapshotContentHash: snapshot.contentHash,
    snapshotVersion: snapshot.version,
    policyCompatibilityVersion: request.policyCompatibilityVersion,
    configVersion: request.configVersion,
    preparedAt: request.preparedAt,
    deadlineAt: request.deadlineAt,
    sourceBindings: bindings,
    ...(request.cacheEntry
      ? {
          cacheBinding: {
            cacheKey: request.cacheEntry.cacheKey,
            expiresAt: request.cacheEntry.expiresAt,
          },
        }
      : {}),
    units,
    status: 'PREPARED',
    commitState: 'UNCOMMITTED',
    authorizesExecution: false,
  };

  return {
    kind: 'SpeculativePreparationResult',
    valid: true,
    reasons: [],
    preparation,
    authorizesExecution: false,
  };
}

function reuseResult(status: SpeculativeReuseStatus): SpeculativeReuseResult {
  return {
    kind: 'SpeculativeReuseResult',
    status,
    authorizesExecution: false,
  };
}

export function evaluateSpeculativeReuse(request: SpeculativeReuseRequest): SpeculativeReuseResult {
  const preparation = request?.preparation;
  const packageResult = request?.package;
  const snapshot = request?.snapshot;

  if (!preparation || preparation.status === 'CANCELLED') {
    return reuseResult('CANCELLED_REJECTED');
  }
  if (!validTimestamp(request?.evaluatedAt) || Date.parse(request.evaluatedAt) >= Date.parse(preparation.deadlineAt)) {
    return reuseResult('DEADLINE_REJECTED');
  }
  if (request.policyCompatibilityVersion !== preparation.policyCompatibilityVersion) {
    return reuseResult('POLICY_REJECTED');
  }
  if (request.configVersion !== preparation.configVersion) {
    return reuseResult('CONFIG_REJECTED');
  }
  if (
    !packageResult ||
    !snapshot ||
    packageResult.query.tenant.tenantId !== preparation.tenant.tenantId ||
    snapshot.tenant.tenantId !== preparation.tenant.tenantId
  ) {
    return reuseResult('TENANT_REJECTED');
  }
  if (!snapshotMatchesPackage(packageResult, snapshot)) {
    return reuseResult('SNAPSHOT_REJECTED');
  }
  if (
    snapshot.snapshotHash !== preparation.snapshotHash ||
    snapshot.contentHash !== preparation.snapshotContentHash ||
    snapshot.version !== preparation.snapshotVersion ||
    snapshot.queryFingerprint !== preparation.queryFingerprint
  ) {
    return reuseResult('SNAPSHOT_REJECTED');
  }

  const currentBindings = sourceBindingsFor(snapshot);
  if (!currentBindings || !sameSourceBindings(preparation.sourceBindings, currentBindings)) {
    return reuseResult('SOURCE_REJECTED');
  }

  if (preparation.cacheBinding) {
    if (
      !request.cacheEntry ||
      request.cacheEntry.cacheKey !== preparation.cacheBinding.cacheKey ||
      request.cacheEntry.expiresAt !== preparation.cacheBinding.expiresAt ||
      !cacheIsCompatible(
        request.cacheEntry,
        packageResult,
        snapshot,
        request.configVersion,
        request.evaluatedAt,
      )
    ) {
      return reuseResult('CACHE_REJECTED');
    }
  }

  return reuseResult('REUSABLE');
}

function cancellationResult(
  status: SpeculativeCancellationResult['status'],
  preparation: SpeculativePreparation,
): SpeculativeCancellationResult {
  return {
    kind: 'SpeculativeCancellationResult',
    status,
    preparation,
    authorizesExecution: false,
  };
}

export function cancelSpeculativePreparation(
  preparation: SpeculativePreparation,
  signal: SpeculativeCancellationSignal,
): SpeculativeCancellationResult {
  if (
    signal?.kind !== 'SpeculativeCancellationSignal' ||
    signal.authorizesExecution !== false ||
    !nonEmptyString(signal.preparationId) ||
    !nonEmptyString(signal.streamKey) ||
    !nonEmptyString(signal.eventId) ||
    !Number.isSafeInteger(signal.sequence) ||
    signal.sequence < 1 ||
    !validTimestamp(signal.occurredAt)
  ) {
    return cancellationResult('INVALID_SIGNAL', preparation);
  }
  if (signal.preparationId !== preparation.preparationId) {
    return cancellationResult('PREPARATION_MISMATCH', preparation);
  }
  if (signal.tenant?.tenantId !== preparation.tenant.tenantId) {
    return cancellationResult('TENANT_REJECTED', preparation);
  }

  const cursor = preparation.cancellationCursor;
  if (
    cursor?.streamKey === signal.streamKey &&
    cursor.sequence === signal.sequence &&
    cursor.eventId === signal.eventId
  ) {
    return cancellationResult('DUPLICATE', preparation);
  }
  if (
    (cursor?.streamKey && cursor.streamKey !== signal.streamKey) ||
    (cursor && signal.sequence <= cursor.sequence)
  ) {
    return cancellationResult('OUT_OF_ORDER_REJECTED', preparation);
  }

  return cancellationResult('CANCELLED', {
    ...preparation,
    status: 'CANCELLED',
    cancelledAt: preparation.cancelledAt ?? signal.occurredAt,
    cancellationCursor: {
      streamKey: signal.streamKey,
      sequence: signal.sequence,
      eventId: signal.eventId,
    },
    authorizesExecution: false,
  });
}

export type {
  SpeculativeCancellationCursor,
  SpeculativeCancellationResult,
  SpeculativeCancellationSignal,
  SpeculativeCancellationStatus,
  SpeculativePreparation,
  SpeculativePreparationLimits,
  SpeculativePreparationReason,
  SpeculativePreparationRequest,
  SpeculativePreparationResult,
  SpeculativePreparationUnit,
  SpeculativePreparationUnitKind,
  SpeculativeReuseRequest,
  SpeculativeReuseResult,
  SpeculativeReuseStatus,
  SpeculativeSourceBinding,
} from './types.js';
