import { MEMORY_BOUNDARY_KINDS } from '../memory-boundaries/types.js';
import type { MemoryBoundaryKind } from '../memory-boundaries/types.js';
import { compileMinimalContext } from '../minimal-context/compile.js';
import type {
  MinimalContextCompileReason,
  MinimalContextCompilerLimits,
  MinimalContextPackage,
} from '../minimal-context/types.js';
import type { ContextQuery } from '../query/types.js';
import { evaluateContextRetrieval } from '../retrieval/evaluate.js';
import type { ContextRetrievalPolicy, ContextRetrievalResult } from '../retrieval/types.js';
import { acquireContextCandidates } from '../sources/acquire.js';
import type { ContextAcquisitionResult, ContextSourceAdapter } from '../sources/types.js';
import type { MemoryFabricSession } from './session-coordinator.js';

export const MEMORY_CONTEXT_ASSEMBLY_REASONS = [
  'SESSION_NOT_OPEN',
  'TENANT_MISMATCH',
  'INVALID_MEMORY_BOUNDARIES',
  'INVALID_MEMORY_READ_LIMIT',
  'COMPILE_REJECTED',
] as const;
export type MemoryContextAssemblyReason = (typeof MEMORY_CONTEXT_ASSEMBLY_REASONS)[number];

export interface MemoryContextAssemblyRequest {
  readonly session: MemoryFabricSession;
  readonly query: ContextQuery;
  readonly memoryBoundaries: readonly MemoryBoundaryKind[];
  readonly additionalAdapters?: readonly ContextSourceAdapter[];
  readonly retrievalPolicy: ContextRetrievalPolicy;
  readonly compilerLimits: MinimalContextCompilerLimits;
  readonly maxItemsPerMemoryRead?: number;
}

export type MemoryContextAssemblyResult =
  | Readonly<{
      kind: 'MemoryContextAssemblyResult';
      valid: true;
      acquisition: ContextAcquisitionResult;
      retrieval: ContextRetrievalResult;
      package: MinimalContextPackage;
      authorizesExecution: false;
    }>
  | Readonly<{
      kind: 'MemoryContextAssemblyResult';
      valid: false;
      reason: MemoryContextAssemblyReason;
      acquisition?: ContextAcquisitionResult;
      retrieval?: ContextRetrievalResult;
      compileReasons?: readonly MinimalContextCompileReason[];
      authorizesExecution: false;
    }>;

function validMemoryBoundaries(boundaries: readonly MemoryBoundaryKind[]): boolean {
  if (!Array.isArray(boundaries) || boundaries.length === 0) return false;
  const unique = new Set<MemoryBoundaryKind>();
  for (const boundary of boundaries) {
    if (!MEMORY_BOUNDARY_KINDS.includes(boundary)) return false;
    if (unique.has(boundary)) return false;
    unique.add(boundary);
  }
  return true;
}

function validMemoryReadLimit(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value > 0 && value <= 100);
}

function failure(
  reason: MemoryContextAssemblyReason,
  evidence: {
    readonly acquisition?: ContextAcquisitionResult;
    readonly retrieval?: ContextRetrievalResult;
    readonly compileReasons?: readonly MinimalContextCompileReason[];
  } = {},
): MemoryContextAssemblyResult {
  return {
    kind: 'MemoryContextAssemblyResult',
    valid: false,
    reason,
    ...(evidence.acquisition === undefined ? {} : { acquisition: evidence.acquisition }),
    ...(evidence.retrieval === undefined ? {} : { retrieval: evidence.retrieval }),
    ...(evidence.compileReasons === undefined ? {} : { compileReasons: evidence.compileReasons }),
    authorizesExecution: false,
  };
}

/**
 * W06-L bridges an already-open governed Memory Fabric session into the accepted
 * W06 acquisition -> retrieval -> MinimalContextPackage pipeline. It does not
 * promote memory, resolve conflicts, call a model/provider or grant authority.
 */
export async function assembleMemoryContext(
  request: MemoryContextAssemblyRequest,
): Promise<MemoryContextAssemblyResult> {
  const initialStatus = request.session.status();
  if (initialStatus.state !== 'OPEN') return failure('SESSION_NOT_OPEN');
  if (request.query.tenant?.tenantId !== initialStatus.tenant.tenantId) {
    return failure('TENANT_MISMATCH');
  }
  if (!validMemoryBoundaries(request.memoryBoundaries)) {
    return failure('INVALID_MEMORY_BOUNDARIES');
  }
  if (!validMemoryReadLimit(request.maxItemsPerMemoryRead)) {
    return failure('INVALID_MEMORY_READ_LIMIT');
  }

  const memoryAdapters = request.memoryBoundaries.map((boundary) =>
    request.session.sourceAdapter(boundary, request.maxItemsPerMemoryRead),
  );
  const acquisition = await acquireContextCandidates({
    query: request.query,
    adapters: [...memoryAdapters, ...(request.additionalAdapters ?? [])],
  });

  if (request.session.status().state !== 'OPEN') {
    return failure('SESSION_NOT_OPEN', { acquisition });
  }

  const retrieval = evaluateContextRetrieval({
    query: request.query,
    acquisition,
    policy: request.retrievalPolicy,
  });
  const compiled = compileMinimalContext({
    query: request.query,
    retrieval,
    limits: request.compilerLimits,
  });

  if (!compiled.valid) {
    return failure('COMPILE_REJECTED', {
      acquisition,
      retrieval,
      compileReasons: compiled.reasons,
    });
  }

  return {
    kind: 'MemoryContextAssemblyResult',
    valid: true,
    acquisition,
    retrieval,
    package: compiled.package,
    authorizesExecution: false,
  };
}
