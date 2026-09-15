import type { ContextSourceClass } from '../query/types.js';
import type {
  ContextSourceAdapter,
  ContextSourceItem,
  ContextSourceReadRequest,
  ContextSourceReadResult,
} from '../sources/types.js';
import { readMemoryProjection } from './fabric.js';
import { MEMORY_PROJECTION_SELECTOR_KEYS } from './types.js';
import type { MemoryFabricSnapshot, MemoryProjectionRecord } from './types.js';
import type { MemoryBoundaryKind } from '../memory-boundaries/types.js';

const MEMORY_SOURCE_CLASS_BY_BOUNDARY: Readonly<Record<MemoryBoundaryKind, ContextSourceClass>> = {
  WORKING: 'WORKING',
  EPISODIC: 'EPISODIC',
  SEMANTIC: 'SEMANTIC',
  COMPANY: 'COMPANY_KNOWLEDGE',
  USER: 'USER_CONTEXT',
  TEMPORAL: 'TEMPORAL_FACT',
  OPERATIONAL: 'OPERATIONAL_STATE',
  EVIDENCE: 'EVIDENCE',
};

export interface MemoryFabricSourceAdapterOptions {
  readonly boundary: MemoryBoundaryKind;
  readonly snapshotProvider: () => MemoryFabricSnapshot | Promise<MemoryFabricSnapshot>;
  readonly maxItemsPerRead?: number;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toSourceItem(record: MemoryProjectionRecord): ContextSourceItem {
  return {
    sourceReference: record.sourceCommitReference ?? record.sourceReference,
    ...(record.sourceCommitRevision !== undefined
      ? { sourceRevision: record.sourceCommitRevision }
      : record.sourceRevision !== undefined
        ? { sourceRevision: record.sourceRevision }
        : {}),
    tenant: record.tenant,
    ...(record.subject === undefined ? {} : { subject: record.subject }),
    classification: record.classification,
    observedAt: record.observedAt,
    provenanceReference: record.provenanceReference,
    payload: {
      projectionReference: record.projectionReference,
      memoryKey: record.memoryKey,
      lifecycle: record.lifecycle,
      contentKind: record.content.kind,
      contentDigest: record.content.digest,
      content: record.content.payload,
      producer: record.producer,
      conflictState: record.conflictState,
      conflictsWithProjectionReferences: record.conflictsWithProjectionReferences,
      sourceOwner: record.sourceOwner,
    },
  };
}

function validateDirectRead(
  request: ContextSourceReadRequest,
  adapterId: string,
  sourceClass: ContextSourceClass,
  maxItemsPerRead: number,
): void {
  if (request.selector.adapterId !== adapterId) {
    throw new Error('MEMORY_FABRIC_ADAPTER_MISMATCH');
  }
  if (request.selector.sourceClass !== sourceClass) {
    throw new Error('MEMORY_FABRIC_SOURCE_CLASS_MISMATCH');
  }
  if (
    !MEMORY_PROJECTION_SELECTOR_KEYS.includes(
      request.selector.key as (typeof MEMORY_PROJECTION_SELECTOR_KEYS)[number],
    )
  ) {
    throw new Error('MEMORY_FABRIC_SELECTOR_UNSUPPORTED');
  }
  if (!nonEmpty(request.selector.value) || request.selector.value === '*') {
    throw new Error('MEMORY_FABRIC_SELECTOR_INVALID');
  }
  if (
    !Number.isInteger(request.limit) ||
    request.limit <= 0 ||
    request.limit > maxItemsPerRead
  ) {
    throw new Error('MEMORY_FABRIC_LIMIT_INVALID');
  }
}

/**
 * Creates one narrow read-only source adapter per accepted W06 memory boundary.
 * The adapter exposes only TRANSIENT working memory plus VALIDATED/CANONICAL
 * projections. Candidate, superseded and revoked records never reach context.
 */
export function createMemoryFabricSourceAdapter(
  options: MemoryFabricSourceAdapterOptions,
): ContextSourceAdapter {
  const maxItemsPerRead = options.maxItemsPerRead ?? 32;
  if (!Number.isInteger(maxItemsPerRead) || maxItemsPerRead <= 0 || maxItemsPerRead > 100) {
    throw new Error('MEMORY_FABRIC_MAX_ITEMS_INVALID');
  }

  const sourceClass = MEMORY_SOURCE_CLASS_BY_BOUNDARY[options.boundary];
  const adapterId = `aurora-memory-fabric:${options.boundary.toLowerCase()}`;

  return {
    descriptor: {
      adapterId,
      sourceClass,
      readOnly: true,
      supportedSelectorKeys: [...MEMORY_PROJECTION_SELECTOR_KEYS],
      maxItemsPerRead,
    },
    read: async (request: ContextSourceReadRequest): Promise<ContextSourceReadResult> => {
      validateDirectRead(request, adapterId, sourceClass, maxItemsPerRead);
      const snapshot = await options.snapshotProvider();
      if (snapshot.tenant.tenantId !== request.tenant.tenantId) {
        throw new Error('MEMORY_FABRIC_TENANT_MISMATCH');
      }

      const projection = readMemoryProjection({
        snapshot,
        tenant: request.tenant,
        boundary: options.boundary,
        key: request.selector.key as (typeof MEMORY_PROJECTION_SELECTOR_KEYS)[number],
        value: request.selector.value,
        limit: request.limit,
      });

      return {
        items: projection.records.map(toSourceItem),
        ...(projection.truncated ? { truncated: true } : {}),
      };
    },
  };
}

export { MEMORY_SOURCE_CLASS_BY_BOUNDARY };
