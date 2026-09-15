import type { DataClassification } from '@aurora/contracts/context';

import type { MemoryBoundaryCandidate } from '../memory-boundaries/types.js';
import type { MemoryFabricSession } from './session-coordinator.js';
import { MEMORY_CONTENT_KINDS, MEMORY_PRODUCER_KINDS } from './types.js';
import type {
  MemoryContentEnvelope,
  MemoryProducerDescriptor,
  MemoryProjectionRecord,
  MemoryProposalRejectionReason,
  MemoryStageResult,
  MemoryWriteProposal,
} from './types.js';

const MAX_REFERENCE_LENGTH = 512;
const MAX_MEMORY_KEY_LENGTH = 512;
const MAX_DIGEST_LENGTH = 256;
export const MEMORY_CAPTURE_MAX_DEPTH = 32;
export const MEMORY_CAPTURE_MAX_NODES = 10_000;
export const MEMORY_CAPTURE_MAX_CONTENT_UNITS = 131_072;

const FORBIDDEN_CAPTURE_KEYS = new Set([
  'accesstoken',
  'apikey',
  'audiobytes',
  'credential',
  'credentials',
  'ownerdecision',
  'password',
  'policytoken',
  'privatekey',
  'rawaudio',
  'refreshtoken',
  'secret',
]);

const SOURCE_OWNED_BOUNDARIES = new Set(['OPERATIONAL', 'EVIDENCE']);

export const MEMORY_CAPTURE_INTAKE_REASONS = [
  'SESSION_NOT_OPEN',
  'TENANT_MISMATCH',
  'INVALID_CAPTURE_REFERENCE',
  'INVALID_MEMORY_KEY',
  'INVALID_PRODUCER',
  'MODEL_PROVENANCE_REQUIRED',
  'SOURCE_ADAPTER_PRODUCER_FORBIDDEN',
  'SOURCE_OWNED_BOUNDARY_FORBIDDEN',
  'INVALID_CONTENT',
  'UNSAFE_CONTENT',
  'FORBIDDEN_CONTENT',
  'CONTENT_LIMIT_EXCEEDED',
  'STAGE_REJECTED',
] as const;
export type MemoryCaptureIntakeReason = (typeof MEMORY_CAPTURE_INTAKE_REASONS)[number];

export interface MemoryCaptureRequest {
  readonly session: MemoryFabricSession;
  readonly captureReference: string;
  readonly memoryKey: string;
  readonly boundaryCandidate: MemoryBoundaryCandidate;
  readonly producer: MemoryProducerDescriptor;
  readonly content: MemoryContentEnvelope;
  readonly maxDataClassification: DataClassification;
}

export type MemoryCaptureResult =
  | Readonly<{
      kind: 'MemoryCaptureResult';
      accepted: true;
      status: 'CAPTURED' | 'DUPLICATE';
      record: MemoryProjectionRecord;
      stage: MemoryStageResult;
      authorizesExecution: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      kind: 'MemoryCaptureResult';
      accepted: false;
      reason: MemoryCaptureIntakeReason;
      stageReasons?: readonly MemoryProposalRejectionReason[];
      authorizesExecution: false;
      retryAuthorized: false;
    }>;

type PayloadInspection = 'SAFE' | 'UNSAFE' | 'FORBIDDEN' | 'LIMIT_EXCEEDED';

function nonEmptyBounded(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function plainObject(value: object): value is Record<string, unknown> {
  if (Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function inspectPayload(root: unknown): PayloadInspection {
  const stack: Array<{ readonly value: unknown; readonly depth: number }> = [
    { value: root, depth: 0 },
  ];
  const seen = new Set<object>();
  let nodes = 0;
  let contentUnits = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current.depth > MEMORY_CAPTURE_MAX_DEPTH) return 'LIMIT_EXCEEDED';
    nodes += 1;
    if (nodes > MEMORY_CAPTURE_MAX_NODES) return 'LIMIT_EXCEEDED';

    const value = current.value;
    if (value === null || typeof value === 'boolean') continue;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return 'UNSAFE';
      continue;
    }
    if (typeof value === 'string') {
      contentUnits += value.length;
      if (contentUnits > MEMORY_CAPTURE_MAX_CONTENT_UNITS) return 'LIMIT_EXCEEDED';
      continue;
    }
    if (typeof value !== 'object') return 'UNSAFE';
    if (seen.has(value)) return 'UNSAFE';
    if (Object.getOwnPropertySymbols(value).length > 0) return 'UNSAFE';
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) stack.push({ value: item, depth: current.depth + 1 });
      continue;
    }
    if (!plainObject(value)) return 'UNSAFE';

    for (const [key, nested] of Object.entries(value)) {
      contentUnits += key.length;
      if (contentUnits > MEMORY_CAPTURE_MAX_CONTENT_UNITS) return 'LIMIT_EXCEEDED';
      if (FORBIDDEN_CAPTURE_KEYS.has(normalizedKey(key))) return 'FORBIDDEN';
      stack.push({ value: nested, depth: current.depth + 1 });
    }
  }

  return 'SAFE';
}

function validProducer(
  producer: MemoryProducerDescriptor | undefined,
): MemoryCaptureIntakeReason | null {
  if (!producer || !MEMORY_PRODUCER_KINDS.includes(producer.kind)) return 'INVALID_PRODUCER';
  if (producer.kind === 'SOURCE_ADAPTER') return 'SOURCE_ADAPTER_PRODUCER_FORBIDDEN';
  if (!nonEmptyBounded(producer.producerReference, MAX_REFERENCE_LENGTH)) return 'INVALID_PRODUCER';
  if (
    producer.providerReference !== undefined &&
    !nonEmptyBounded(producer.providerReference, MAX_REFERENCE_LENGTH)
  ) {
    return 'INVALID_PRODUCER';
  }
  if (
    producer.modelReference !== undefined &&
    !nonEmptyBounded(producer.modelReference, MAX_REFERENCE_LENGTH)
  ) {
    return 'INVALID_PRODUCER';
  }
  if (
    producer.kind === 'MODEL' &&
    (!nonEmptyBounded(producer.providerReference, MAX_REFERENCE_LENGTH) ||
      !nonEmptyBounded(producer.modelReference, MAX_REFERENCE_LENGTH))
  ) {
    return 'MODEL_PROVENANCE_REQUIRED';
  }
  return null;
}

function validContent(content: MemoryContentEnvelope | undefined): boolean {
  if (!content || !MEMORY_CONTENT_KINDS.includes(content.kind)) return false;
  if (!nonEmptyBounded(content.digest, MAX_DIGEST_LENGTH)) return false;
  if (content.kind === 'TEXT' || content.kind === 'REFERENCE') {
    return typeof content.payload === 'string' && content.payload.trim().length > 0;
  }
  return content.payload !== undefined;
}

function rejected(
  reason: MemoryCaptureIntakeReason,
  stageReasons?: readonly MemoryProposalRejectionReason[],
): MemoryCaptureResult {
  return {
    kind: 'MemoryCaptureResult',
    accepted: false,
    reason,
    ...(stageReasons === undefined ? {} : { stageReasons }),
    authorizesExecution: false,
    retryAuthorized: false,
  };
}

/**
 * W06-M is the governed return path from user/model/agent/system output into
 * Aurora-owned memory. It can stage observations only. It cannot validate,
 * canonicalize, authorize execution, authorize retry or write source-owned
 * operational/evidence truth.
 */
export function captureMemoryObservation(request: MemoryCaptureRequest): MemoryCaptureResult {
  const status = request.session.status();
  if (status.state !== 'OPEN') return rejected('SESSION_NOT_OPEN');
  if (request.boundaryCandidate?.tenant?.tenantId !== status.tenant.tenantId) {
    return rejected('TENANT_MISMATCH');
  }
  if (!nonEmptyBounded(request.captureReference, MAX_REFERENCE_LENGTH)) {
    return rejected('INVALID_CAPTURE_REFERENCE');
  }
  if (!nonEmptyBounded(request.memoryKey, MAX_MEMORY_KEY_LENGTH)) {
    return rejected('INVALID_MEMORY_KEY');
  }

  const producerReason = validProducer(request.producer);
  if (producerReason) return rejected(producerReason);
  if (SOURCE_OWNED_BOUNDARIES.has(request.boundaryCandidate.boundary)) {
    return rejected('SOURCE_OWNED_BOUNDARY_FORBIDDEN');
  }
  if (!validContent(request.content)) return rejected('INVALID_CONTENT');

  const payloadInspection = inspectPayload(request.content.payload);
  if (payloadInspection === 'UNSAFE') return rejected('UNSAFE_CONTENT');
  if (payloadInspection === 'FORBIDDEN') return rejected('FORBIDDEN_CONTENT');
  if (payloadInspection === 'LIMIT_EXCEEDED') return rejected('CONTENT_LIMIT_EXCEEDED');

  const proposal: MemoryWriteProposal = {
    kind: 'MemoryWriteProposal',
    proposalReference: request.captureReference,
    memoryKey: request.memoryKey,
    boundaryCandidate: request.boundaryCandidate,
    producer: request.producer,
    content: request.content,
  };
  const stage = request.session.stage(proposal, request.maxDataClassification);
  if (stage.status === 'REJECTED' || !stage.record) {
    return rejected('STAGE_REJECTED', stage.reasons);
  }

  return {
    kind: 'MemoryCaptureResult',
    accepted: true,
    status: stage.status === 'DUPLICATE' ? 'DUPLICATE' : 'CAPTURED',
    record: stage.record,
    stage,
    authorizesExecution: false,
    retryAuthorized: false,
  };
}
