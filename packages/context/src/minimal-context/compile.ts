import type { DataClassification, SubjectRef } from '@aurora/contracts/context';

import { validateContextQuery } from '../query/validate.js';
import type { ContextQuery } from '../query/types.js';
import type { RankedContextItem } from '../retrieval/types.js';
import type {
  MinimalContextCompileReason,
  MinimalContextCompileRequest,
  MinimalContextCompileResult,
  MinimalContextExcludedSource,
  MinimalContextExclusionReason,
  MinimalContextPackage,
} from './types.js';

const CLASSIFICATION_ORDER: Readonly<Record<DataClassification, number>> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
};

const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_CANONICAL_DEPTH = 32;
const MAX_CANONICAL_NODES = 10_000;
const MAX_COMPILER_CANONICAL_UNITS = 10_000_000;

interface CanonicalState {
  nodes: number;
  readonly seen: Set<object>;
}

interface EvaluatedItem {
  readonly item: RankedContextItem;
  readonly units: number;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' && RFC3339_PATTERN.test(value) && Number.isFinite(Date.parse(value))
  );
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

function canonicalUnits(value: unknown): number | undefined {
  const canonical = canonicalPart(value, { nodes: 0, seen: new Set<object>() }, 0);
  return canonical?.length;
}

function validLimits(request: MinimalContextCompileRequest): boolean {
  const maxItems = request?.limits?.maxItems;
  const maxCanonicalUnits = request?.limits?.maxCanonicalUnits;
  return (
    Number.isSafeInteger(maxItems) &&
    maxItems >= 1 &&
    maxItems <= request.query.limits.maxTotalItems &&
    Number.isSafeInteger(maxCanonicalUnits) &&
    maxCanonicalUnits >= 1 &&
    maxCanonicalUnits <= MAX_COMPILER_CANONICAL_UNITS
  );
}

function validRankedItem(
  query: ContextQuery,
  retrievalEvaluatedAt: string,
  item: RankedContextItem,
  expectedRank: number,
): boolean {
  if (
    !item ||
    !nonEmptyString(item.sourceReference) ||
    !nonEmptyString(item.adapterId) ||
    !nonEmptyString(item.provenanceReference) ||
    !item.tenant ||
    item.tenant.tenantId !== query.tenant.tenantId ||
    item.retrieval?.rank !== expectedRank ||
    !Number.isInteger(item.retrieval.trust?.scoreBps) ||
    item.retrieval.trust.scoreBps < 0 ||
    item.retrieval.trust.scoreBps > 10_000 ||
    item.retrieval.trust.basis !== 'ADAPTER_CONFIG' ||
    item.retrieval.trust.adapterId !== item.adapterId ||
    !validTimestamp(item.observedAt) ||
    item.retrieval.freshness?.observedAt !== item.observedAt ||
    item.retrieval.freshness.evaluatedAt !== retrievalEvaluatedAt ||
    !['CURRENT', 'HISTORICAL', 'UNKNOWN'].includes(item.retrieval.freshness.state) ||
    !['NONE', 'CONFLICTING'].includes(item.retrieval.conflict?.state) ||
    !nonEmptyString(item.retrieval.conflict.key) ||
    !Array.isArray(item.retrieval.conflict.peerSourceReferences) ||
    !Array.isArray(item.retrieval.uncertainty)
  ) {
    return false;
  }

  if (query.subject && (!item.subject || !sameSubject(query.subject, item.subject))) return false;

  const itemClassification = classificationRank(item.classification);
  const maximumClassification = classificationRank(query.maxDataClassification);
  if (
    itemClassification === undefined ||
    maximumClassification === undefined ||
    itemClassification > maximumClassification
  ) {
    return false;
  }

  if (query.currentness === 'CURRENT_REQUIRED' && item.retrieval.freshness.state !== 'CURRENT') {
    return false;
  }

  const peers = item.retrieval.conflict.peerSourceReferences;
  if (
    peers.some((reference) => !nonEmptyString(reference) || reference === item.sourceReference) ||
    new Set(peers).size !== peers.length
  ) {
    return false;
  }

  return true;
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function conflictGroupsValid(items: readonly RankedContextItem[]): boolean {
  const byKey = new Map<string, RankedContextItem[]>();
  for (const item of items) {
    const group = byKey.get(item.retrieval.conflict.key) ?? [];
    group.push(item);
    byKey.set(item.retrieval.conflict.key, group);
  }

  for (const item of items) {
    if (item.retrieval.conflict.state !== 'CONFLICTING') continue;
    const group = byKey.get(item.retrieval.conflict.key) ?? [];
    if (group.length < 2 || group.some((peer) => peer.retrieval.conflict.state !== 'CONFLICTING')) {
      return false;
    }
    const expectedPeers = group
      .map((peer) => peer.sourceReference)
      .filter((reference) => reference !== item.sourceReference)
      .sort();
    const actualPeers = [...item.retrieval.conflict.peerSourceReferences].sort();
    if (!sameStrings(expectedPeers, actualPeers)) return false;
    if (!item.retrieval.uncertainty.includes('CONFLICTING_FACT')) return false;
  }
  return true;
}

function invalidResult(reasons: readonly MinimalContextCompileReason[]): MinimalContextCompileResult {
  return {
    kind: 'MinimalContextCompileResult',
    valid: false,
    reasons: [...new Set(reasons)],
    authorizesExecution: false,
  };
}

function exclusionReason(
  conflictGroup: boolean,
  itemLimitExceeded: boolean,
): MinimalContextExclusionReason {
  if (conflictGroup) {
    return itemLimitExceeded ? 'CONFLICT_GROUP_ITEM_LIMIT' : 'CONFLICT_GROUP_UNIT_LIMIT';
  }
  return itemLimitExceeded ? 'ITEM_LIMIT' : 'CANONICAL_UNIT_LIMIT';
}

/**
 * W06-C compiles ranked evidence into a bounded deterministic package. The
 * compiler never summarizes with a model, never drops the query safety
 * envelope, never partially includes a conflicting fact group and can never
 * authorize execution.
 */
export function compileMinimalContext(
  request: MinimalContextCompileRequest,
): MinimalContextCompileResult {
  const reasons: MinimalContextCompileReason[] = [];
  const queryValidation = request?.query ? validateContextQuery(request.query) : { valid: false };
  if (!queryValidation.valid) reasons.push('INVALID_QUERY');

  const retrieval = request?.retrieval;
  if (
    retrieval?.kind !== 'ContextRetrievalResult' ||
    retrieval.authorizesExecution !== false ||
    !validTimestamp(retrieval.evaluatedAt) ||
    !Array.isArray(retrieval.items) ||
    !Array.isArray(retrieval.rejections) ||
    !Array.isArray(retrieval.upstreamRejections) ||
    retrieval.items.length > (request?.query?.limits?.maxTotalItems ?? 0)
  ) {
    reasons.push('INVALID_RETRIEVAL');
  }

  if (!request?.query || !validLimits(request)) reasons.push('INVALID_LIMITS');
  if (reasons.length > 0 || !retrieval) return invalidResult(reasons);

  const seenReferences = new Set<string>();
  const evaluatedItems: EvaluatedItem[] = [];
  for (let index = 0; index < retrieval.items.length; index += 1) {
    const item = retrieval.items[index];
    if (
      !item ||
      seenReferences.has(item.sourceReference) ||
      !validRankedItem(request.query, retrieval.evaluatedAt, item, index + 1)
    ) {
      reasons.push('INVALID_RANKED_ITEM');
      continue;
    }
    seenReferences.add(item.sourceReference);
    const units = canonicalUnits(item);
    if (units === undefined) {
      reasons.push('INVALID_RANKED_ITEM');
      continue;
    }
    evaluatedItems.push({ item, units });
  }

  if (!conflictGroupsValid(retrieval.items)) reasons.push('CONFLICT_GROUP_INVALID');
  if (reasons.length > 0) return invalidResult(reasons);

  const allByConflictKey = new Map<string, EvaluatedItem[]>();
  for (const entry of evaluatedItems) {
    const group = allByConflictKey.get(entry.item.retrieval.conflict.key) ?? [];
    group.push(entry);
    allByConflictKey.set(entry.item.retrieval.conflict.key, group);
  }

  const processed = new Set<string>();
  const included = new Set<string>();
  const excludedSources: MinimalContextExcludedSource[] = [];
  let outputCanonicalUnits = 0;

  for (const entry of evaluatedItems) {
    if (processed.has(entry.item.sourceReference)) continue;
    const isConflictGroup = entry.item.retrieval.conflict.state === 'CONFLICTING';
    const group = isConflictGroup
      ? [...(allByConflictKey.get(entry.item.retrieval.conflict.key) ?? [entry])].sort(
          (a, b) => a.item.retrieval.rank - b.item.retrieval.rank,
        )
      : [entry];

    const groupUnits = group.reduce((sum, member) => sum + member.units, 0);
    const itemLimitExceeded = included.size + group.length > request.limits.maxItems;
    const unitLimitExceeded =
      outputCanonicalUnits + groupUnits > request.limits.maxCanonicalUnits;

    for (const member of group) processed.add(member.item.sourceReference);

    if (itemLimitExceeded || unitLimitExceeded) {
      const reason = exclusionReason(isConflictGroup, itemLimitExceeded);
      for (const member of group) {
        excludedSources.push({
          sourceReference: member.item.sourceReference,
          rank: member.item.retrieval.rank,
          reason,
        });
      }
      continue;
    }

    for (const member of group) included.add(member.item.sourceReference);
    outputCanonicalUnits += groupUnits;
  }

  const items = retrieval.items.filter((item) => included.has(item.sourceReference));
  excludedSources.sort(
    (a, b) => a.rank - b.rank || a.sourceReference.localeCompare(b.sourceReference),
  );
  const inputCanonicalUnits = evaluatedItems.reduce((sum, entry) => sum + entry.units, 0);
  const retainedRatioBps =
    inputCanonicalUnits === 0
      ? 10_000
      : Math.floor((outputCanonicalUnits * 10_000) / inputCanonicalUnits);

  const packageResult: MinimalContextPackage = {
    kind: 'MinimalContextPackage',
    query: request.query,
    retrievalEvaluatedAt: retrieval.evaluatedAt,
    items,
    includedSourceReferences: items.map((item) => item.sourceReference),
    excludedSources,
    retrievalRejections: retrieval.rejections,
    upstreamRejections: retrieval.upstreamRejections,
    metrics: {
      inputItemCount: evaluatedItems.length,
      outputItemCount: items.length,
      inputCanonicalUnits,
      outputCanonicalUnits,
      retainedRatioBps,
      compressionSavingsBps: 10_000 - retainedRatioBps,
    },
    authorizesExecution: false,
  };

  return {
    kind: 'MinimalContextCompileResult',
    valid: true,
    reasons: [],
    package: packageResult,
    authorizesExecution: false,
  };
}
