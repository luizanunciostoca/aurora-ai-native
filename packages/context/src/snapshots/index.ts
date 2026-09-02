import type { Rfc3339Timestamp } from '@aurora/contracts/context';

import type { MinimalContextPackage } from '../minimal-context/types.js';
import type { MemoryBoundaryKind } from '../memory-boundaries/types.js';
import type { ContextSourceClass } from '../query/types.js';
import { validateContextQuery } from '../query/validate.js';
import type {
  ContextSnapshot,
  ContextSnapshotCompileReason,
  ContextSnapshotCompileRequest,
  ContextSnapshotCompileResult,
  ContextSnapshotInvalidationResult,
  ContextSnapshotInvalidationSignal,
  ContextSnapshotRecompileRequest,
  ContextSnapshotRecompileResult,
  ContextSnapshotSourceState,
} from './types.js';

const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_CANONICAL_DEPTH = 32;
const MAX_CANONICAL_NODES = 20_000;

const SOURCE_BOUNDARY: Readonly<Record<ContextSourceClass, MemoryBoundaryKind>> = {
  WORKING: 'WORKING',
  EPISODIC: 'EPISODIC',
  SEMANTIC: 'SEMANTIC',
  COMPANY_KNOWLEDGE: 'COMPANY',
  USER_CONTEXT: 'USER',
  TEMPORAL_FACT: 'TEMPORAL',
  OPERATIONAL_STATE: 'OPERATIONAL',
  EVIDENCE: 'EVIDENCE',
};

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

function canonicalPart(
  value: unknown,
  state: CanonicalState,
  depth: number,
): string | undefined {
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

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function boundaryFor(sourceClass: unknown): MemoryBoundaryKind | undefined {
  if (
    typeof sourceClass !== 'string' ||
    !Object.prototype.hasOwnProperty.call(SOURCE_BOUNDARY, sourceClass)
  ) {
    return undefined;
  }
  return SOURCE_BOUNDARY[sourceClass as ContextSourceClass];
}

function sourceStatesFor(packageResult: MinimalContextPackage): ContextSnapshotSourceState[] | undefined {
  const seen = new Set<string>();
  const states: ContextSnapshotSourceState[] = [];

  for (const item of packageResult.items) {
    const boundary = boundaryFor(item.sourceClass);
    if (
      !boundary ||
      !nonEmptyString(item.sourceReference) ||
      seen.has(item.sourceReference) ||
      !nonEmptyString(item.sourceRevision) ||
      !nonEmptyString(item.provenanceReference) ||
      item.tenant?.tenantId !== packageResult.query.tenant.tenantId ||
      !validTimestamp(item.observedAt)
    ) {
      return undefined;
    }
    if (
      packageResult.query.currentness === 'CURRENT_REQUIRED' &&
      item.retrieval?.freshness?.state !== 'CURRENT'
    ) {
      return undefined;
    }
    seen.add(item.sourceReference);
    states.push({
      sourceReference: item.sourceReference,
      sourceRevision: item.sourceRevision,
      provenanceReference: item.provenanceReference,
      boundary,
      classification: item.classification,
      observedAt: item.observedAt,
    });
  }

  return states;
}

function excludedReferences(packageResult: MinimalContextPackage): string[] {
  return packageResult.excludedSources
    .map((entry) => entry.sourceReference)
    .filter((reference, index, all) => all.indexOf(reference) === index)
    .sort();
}

function contentHashFor(
  packageResult: MinimalContextPackage,
  queryFingerprint: string,
  states: readonly ContextSnapshotSourceState[],
): string | undefined {
  return canonicalHash({
    queryFingerprint,
    retrievalEvaluatedAt: packageResult.retrievalEvaluatedAt,
    sourceStates: states.map((state) => ({
      sourceReference: state.sourceReference,
      sourceRevision: state.sourceRevision,
      provenanceReference: state.provenanceReference,
      boundary: state.boundary,
      classification: state.classification,
      observedAt: state.observedAt,
    })),
    includedSourceReferences: packageResult.includedSourceReferences,
    excludedSourceReferences: excludedReferences(packageResult),
    metrics: packageResult.metrics,
  });
}

function snapshotHashFor(snapshot: Omit<ContextSnapshot, 'snapshotHash'>): string | undefined {
  return canonicalHash({
    contentHash: snapshot.contentHash,
    version: snapshot.version,
    compiledAt: snapshot.compiledAt,
    status: snapshot.status,
    invalidatedSourceReferences: snapshot.invalidatedSourceReferences,
    sourceCursors: snapshot.sourceStates.map((state) => ({
      sourceReference: state.sourceReference,
      pendingSourceRevision: state.pendingSourceRevision,
      lastInvalidationStreamKey: state.lastInvalidationStreamKey,
      lastInvalidationSequence: state.lastInvalidationSequence,
      lastInvalidationEventId: state.lastInvalidationEventId,
    })),
  });
}

function invalidCompileResult(
  reasons: readonly ContextSnapshotCompileReason[],
): ContextSnapshotCompileResult {
  return {
    kind: 'ContextSnapshotCompileResult',
    valid: false,
    reasons: [...new Set(reasons)],
    authorizesExecution: false,
  };
}

function validatePackage(
  packageResult: MinimalContextPackage,
  compiledAt: unknown,
):
  | {
      readonly valid: true;
      readonly queryFingerprint: string;
      readonly states: readonly ContextSnapshotSourceState[];
      readonly contentHash: string;
    }
  | {
      readonly valid: false;
      readonly reasons: readonly ContextSnapshotCompileReason[];
    } {
  const reasons: ContextSnapshotCompileReason[] = [];
  if (
    packageResult?.kind !== 'MinimalContextPackage' ||
    packageResult.authorizesExecution !== false ||
    !Array.isArray(packageResult.items) ||
    !Array.isArray(packageResult.includedSourceReferences) ||
    !Array.isArray(packageResult.excludedSources) ||
    !validTimestamp(packageResult.retrievalEvaluatedAt) ||
    !validateContextQuery(packageResult.query).valid
  ) {
    reasons.push('INVALID_PACKAGE');
  }
  if (!validTimestamp(compiledAt)) reasons.push('INVALID_COMPILED_AT');
  if (
    validTimestamp(compiledAt) &&
    validTimestamp(packageResult?.retrievalEvaluatedAt) &&
    Date.parse(compiledAt) < Date.parse(packageResult.retrievalEvaluatedAt)
  ) {
    reasons.push('INVALID_COMPILED_AT');
  }

  const states = sourceStatesFor(packageResult);
  if (!states) {
    if (packageResult.items.some((item) => !nonEmptyString(item?.sourceRevision))) {
      reasons.push('SOURCE_REVISION_REQUIRED');
    } else {
      reasons.push('SOURCE_STATE_INVALID');
    }
  }

  if (
    states &&
    !sameStrings(
      states.map((state) => state.sourceReference),
      packageResult.includedSourceReferences,
    )
  ) {
    reasons.push('SOURCE_STATE_INVALID');
  }

  const included = new Set(packageResult.includedSourceReferences);
  if (packageResult.excludedSources.some((entry) => included.has(entry.sourceReference))) {
    reasons.push('SOURCE_STATE_INVALID');
  }

  const queryFingerprint = canonicalHash(packageResult.query);
  if (!queryFingerprint) reasons.push('INVALID_PACKAGE');
  const contentHash = states && queryFingerprint
    ? contentHashFor(packageResult, queryFingerprint, states)
    : undefined;
  if (!contentHash) reasons.push('INVALID_PACKAGE');

  if (reasons.length > 0 || !states || !queryFingerprint || !contentHash) {
    return { valid: false, reasons: [...new Set(reasons)] };
  }
  return { valid: true, queryFingerprint, states, contentHash };
}

function buildSnapshot(
  packageResult: MinimalContextPackage,
  compiledAt: Rfc3339Timestamp,
  version: number,
  states: readonly ContextSnapshotSourceState[],
  queryFingerprint: string,
  contentHash: string,
  invalidatedSourceReferences: readonly string[] = [],
): ContextSnapshot | undefined {
  const withoutHash: Omit<ContextSnapshot, 'snapshotHash'> = {
    kind: 'ContextSnapshot',
    contentHash,
    version,
    compiledAt,
    retrievalEvaluatedAt: packageResult.retrievalEvaluatedAt,
    tenant: packageResult.query.tenant,
    queryFingerprint,
    sourceStates: states,
    includedSourceReferences: [...packageResult.includedSourceReferences],
    excludedSourceReferences: excludedReferences(packageResult),
    provenanceReferences: states.map((state) => state.provenanceReference),
    status: invalidatedSourceReferences.length > 0 ? 'INVALIDATED' : 'CURRENT',
    invalidatedSourceReferences: [...invalidatedSourceReferences].sort(),
    authorizesExecution: false,
  };
  const snapshotHash = snapshotHashFor(withoutHash);
  return snapshotHash ? { ...withoutHash, snapshotHash } : undefined;
}

export function compileContextSnapshot(
  request: ContextSnapshotCompileRequest,
): ContextSnapshotCompileResult {
  const validation = validatePackage(request?.package, request?.compiledAt);
  if (!validation.valid) return invalidCompileResult(validation.reasons);

  const snapshot = buildSnapshot(
    request.package,
    request.compiledAt,
    1,
    validation.states,
    validation.queryFingerprint,
    validation.contentHash,
  );
  if (!snapshot) return invalidCompileResult(['INVALID_PACKAGE']);
  return {
    kind: 'ContextSnapshotCompileResult',
    valid: true,
    reasons: [],
    snapshot,
    authorizesExecution: false,
  };
}

function withSnapshotState(
  snapshot: ContextSnapshot,
  sourceStates: readonly ContextSnapshotSourceState[],
  version: number,
  invalidatedSourceReferences: readonly string[],
): ContextSnapshot | undefined {
  const withoutHash: Omit<ContextSnapshot, 'snapshotHash'> = {
    ...snapshot,
    version,
    sourceStates,
    status: invalidatedSourceReferences.length > 0 ? 'INVALIDATED' : 'CURRENT',
    invalidatedSourceReferences: [...invalidatedSourceReferences].sort(),
  };
  const snapshotHash = snapshotHashFor(withoutHash);
  return snapshotHash ? { ...withoutHash, snapshotHash } : undefined;
}

function invalidationResult(
  status: ContextSnapshotInvalidationResult['status'],
  snapshot: ContextSnapshot,
): ContextSnapshotInvalidationResult {
  return {
    kind: 'ContextSnapshotInvalidationResult',
    status,
    snapshot,
    authorizesExecution: false,
  };
}

export function applyContextSnapshotInvalidation(
  snapshot: ContextSnapshot,
  signal: ContextSnapshotInvalidationSignal,
): ContextSnapshotInvalidationResult {
  if (
    signal?.kind !== 'ContextSnapshotInvalidationSignal' ||
    signal.authorizesExecution !== false ||
    !nonEmptyString(signal.eventId) ||
    !nonEmptyString(signal.streamKey) ||
    !Number.isSafeInteger(signal.sequence) ||
    signal.sequence < 1 ||
    !validTimestamp(signal.occurredAt) ||
    !nonEmptyString(signal.sourceReference) ||
    !nonEmptyString(signal.nextSourceRevision)
  ) {
    return invalidationResult('INVALID_SIGNAL', snapshot);
  }
  if (signal.tenant?.tenantId !== snapshot.tenant.tenantId) {
    return invalidationResult('TENANT_REJECTED', snapshot);
  }

  const index = snapshot.sourceStates.findIndex(
    (state) => state.sourceReference === signal.sourceReference,
  );
  if (index < 0) return invalidationResult('SOURCE_NOT_PRESENT', snapshot);
  const current = snapshot.sourceStates[index];
  if (!current) return invalidationResult('SOURCE_NOT_PRESENT', snapshot);

  if (
    current.lastInvalidationStreamKey === signal.streamKey &&
    current.lastInvalidationSequence === signal.sequence &&
    current.lastInvalidationEventId === signal.eventId
  ) {
    return invalidationResult('DUPLICATE', snapshot);
  }
  if (
    current.lastInvalidationStreamKey &&
    current.lastInvalidationStreamKey !== signal.streamKey
  ) {
    return invalidationResult('OUT_OF_ORDER_REJECTED', snapshot);
  }
  if (
    current.lastInvalidationSequence !== undefined &&
    signal.sequence <= current.lastInvalidationSequence
  ) {
    return invalidationResult('OUT_OF_ORDER_REJECTED', snapshot);
  }
  if (
    signal.previousSourceRevision !== undefined &&
    signal.previousSourceRevision !== current.sourceRevision
  ) {
    return invalidationResult('OUT_OF_ORDER_REJECTED', snapshot);
  }
  if (snapshot.invalidatedSourceReferences.includes(current.sourceReference)) {
    return invalidationResult('ALREADY_INVALIDATED', snapshot);
  }

  const nextState: ContextSnapshotSourceState = {
    ...current,
    ...(signal.nextSourceRevision === current.sourceRevision
      ? {}
      : { pendingSourceRevision: signal.nextSourceRevision }),
    lastInvalidationStreamKey: signal.streamKey,
    lastInvalidationSequence: signal.sequence,
    lastInvalidationEventId: signal.eventId,
  };
  const sourceStates = snapshot.sourceStates.map((state, stateIndex) =>
    stateIndex === index ? nextState : state,
  );
  const invalidatedSourceReferences =
    signal.nextSourceRevision === current.sourceRevision
      ? snapshot.invalidatedSourceReferences
      : [...snapshot.invalidatedSourceReferences, current.sourceReference];
  const nextSnapshot = withSnapshotState(
    snapshot,
    sourceStates,
    snapshot.version + 1,
    invalidatedSourceReferences,
  );
  if (!nextSnapshot) return invalidationResult('INVALID_SIGNAL', snapshot);
  return invalidationResult(
    signal.nextSourceRevision === current.sourceRevision ? 'NO_CHANGE' : 'APPLIED',
    nextSnapshot,
  );
}

export function recompileContextSnapshot(
  request: ContextSnapshotRecompileRequest,
): ContextSnapshotRecompileResult {
  const validation = validatePackage(request?.package, request?.compiledAt);
  if (!validation.valid) {
    return {
      kind: 'ContextSnapshotRecompileResult',
      valid: false,
      reasons: validation.reasons,
      authorizesExecution: false,
    };
  }
  if (
    request.previousSnapshot.tenant.tenantId !== request.package.query.tenant.tenantId ||
    request.previousSnapshot.queryFingerprint !== validation.queryFingerprint
  ) {
    return {
      kind: 'ContextSnapshotRecompileResult',
      valid: false,
      reasons: ['SNAPSHOT_CONTEXT_MISMATCH'],
      authorizesExecution: false,
    };
  }

  const previousByReference = new Map(
    request.previousSnapshot.sourceStates.map((state) => [state.sourceReference, state] as const),
  );
  const recompiled = validation.states
    .filter((state) => {
      const previous = previousByReference.get(state.sourceReference);
      return (
        !previous ||
        previous.sourceRevision !== state.sourceRevision ||
        request.previousSnapshot.invalidatedSourceReferences.includes(state.sourceReference)
      );
    })
    .map((state) => state.sourceReference)
    .sort();

  const snapshot = buildSnapshot(
    request.package,
    request.compiledAt,
    request.previousSnapshot.version + 1,
    validation.states,
    validation.queryFingerprint,
    validation.contentHash,
  );
  if (!snapshot) {
    return {
      kind: 'ContextSnapshotRecompileResult',
      valid: false,
      reasons: ['INVALID_PACKAGE'],
      authorizesExecution: false,
    };
  }

  return {
    kind: 'ContextSnapshotRecompileResult',
    valid: true,
    reasons: [],
    snapshot,
    recompiledSourceReferences: recompiled,
    equivalentToFullRebuild: true,
    authorizesExecution: false,
  };
}

export type {
  ContextSnapshot,
  ContextSnapshotCompileReason,
  ContextSnapshotCompileRequest,
  ContextSnapshotCompileResult,
  ContextSnapshotInvalidationResult,
  ContextSnapshotInvalidationSignal,
  ContextSnapshotInvalidationStatus,
  ContextSnapshotRecompileRequest,
  ContextSnapshotRecompileResult,
  ContextSnapshotSourceState,
  ContextSnapshotStatus,
} from './types.js';
