import type {
  ActionIntentId,
  EvidenceId,
  ExecutionId,
  ReceiptId,
} from '../../../contracts/src/ids/index.js';
import type {
  CorrelationContext,
  DataClassification,
  IdentityReference,
} from '../../../contracts/src/context/index.js';
import type { ContractVersion } from '../../../contracts/src/versioning/index.js';
import { EvidenceSchema, type EvidenceSchemaDependencies } from './evidence.schema.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectThrows(fn: () => unknown, contains: string): void {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(contains), `expected error containing "${contains}", got "${message}"`);
    return;
  }
  throw new Error(`expected function to throw: ${contains}`);
}

const prefixed = <T>(prefix: string, input: unknown): T => {
  if (typeof input !== 'string' || !input.startsWith(`${prefix}_`)) {
    throw new TypeError(`expected ${prefix}_ prefixed ID`);
  }
  return input as T;
};

const dependencies: EvidenceSchemaDependencies = {
  parseContractVersion(input) {
    if (input !== '1.0.0') throw new TypeError('unsupported ContractVersion');
    return input as ContractVersion;
  },
  parseEvidenceId: (input) => prefixed<EvidenceId>('evd', input),
  parseActionIntentId: (input) => prefixed<ActionIntentId>('act', input),
  parseReceiptId: (input) => prefixed<ReceiptId>('rcp', input),
  parseExecutionId: (input) => prefixed<ExecutionId>('exe', input),
  parseIdentityReference(input) {
    if (input === null || typeof input !== 'object') throw new TypeError('invalid identity');
    prefixed('idn', (input as { identityId?: unknown }).identityId);
    return input as IdentityReference;
  },
  parseCorrelationContext(input) {
    if (input === null || typeof input !== 'object') throw new TypeError('invalid correlation');
    prefixed('cor', (input as { correlationId?: unknown }).correlationId);
    return input as CorrelationContext;
  },
  parseDataClassification(input) {
    if (!['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'].includes(String(input))) {
      throw new TypeError('invalid classification');
    }
    return input as DataClassification;
  },
};

const validEvidence = {
  kind: 'EVIDENCE',
  schemaVersion: '1.0.0',
  evidenceId: 'evd_01ARZ3NDEKTSV4RRFFQ69G5FB3',
  subject: { kind: 'ACTION_INTENT', actionIntentId: 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV' },
  evidenceType: 'READBACK',
  capturedAt: '2026-08-29T23:21:00-03:00',
  source: {
    sourceType: 'PROVIDER_READBACK',
    provider: 'meta',
    reference: { system: 'meta', reference: 'reply-456' },
  },
  correlation: { correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAZ' },
  verification: {
    state: 'VERIFIED',
    verifiedAt: '2026-08-29T23:21:01-03:00',
    verifier: { identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FB4', kind: 'SYSTEM' },
    method: 'provider-readback-match',
  },
  readback: {
    reference: { system: 'meta', reference: 'reply-456' },
    observedState: { exists: true, text: 'Obrigado!' },
  },
  integrity: { algorithm: 'sha256', digest: 'abc123' },
  provenance: {
    sourceReference: { system: 'meta-api', reference: 'GET /reply-456' },
  },
  dataClassification: 'INTERNAL',
  metadata: { evidenceClass: 'readback' },
} as const;

const parsed = EvidenceSchema.parse(validEvidence, dependencies);
assert(parsed.subject.kind === 'ACTION_INTENT', 'Evidence must retain subject linkage');
assert(parsed.verification.state === 'VERIFIED', 'Evidence verification state must be explicit');

const roundTrip = EvidenceSchema.parse(JSON.parse(JSON.stringify(parsed)), dependencies);
assert(
  JSON.stringify(roundTrip) === JSON.stringify(parsed),
  'Evidence serialization round trip must be stable',
);

const withoutSubject = JSON.parse(JSON.stringify(validEvidence)) as Record<string, unknown>;
delete withoutSubject.subject;
expectThrows(
  () => EvidenceSchema.parse(withoutSubject, dependencies),
  'subject: missing required field',
);

expectThrows(
  () => EvidenceSchema.parse({ ...validEvidence, evidenceType: 'LOG' }, dependencies),
  'unsupported evidence type',
);

expectThrows(
  () => EvidenceSchema.parse({ ...validEvidence, provenance: {} }, dependencies),
  'at least one provenance reference is required',
);

expectThrows(
  () =>
    EvidenceSchema.parse(
      {
        ...validEvidence,
        verification: { state: 'VERIFIED', verifiedAt: validEvidence.verification.verifiedAt },
      },
      dependencies,
    ),
  'VERIFIED requires verifiedAt, verifier, and method',
);

expectThrows(
  () =>
    EvidenceSchema.parse(
      {
        ...validEvidence,
        verification: {
          ...validEvidence.verification,
          verifiedAt: '2026-08-29T23:20:59-03:00',
        },
      },
      dependencies,
    ),
  'cannot precede capturedAt',
);

expectThrows(
  () => EvidenceSchema.parse({ ...validEvidence, capturedAt: 'invalid-time' }, dependencies),
  'expected valid RFC3339 timestamp',
);

expectThrows(
  () => EvidenceSchema.parse({ ...validEvidence, verifiedOutcome: 'SUCCEEDED' }, dependencies),
  'verifiedOutcome: unknown field',
);

expectThrows(
  () => EvidenceSchema.parse({ ...validEvidence, schemaVersion: '9.0.0' }, dependencies),
  'unsupported ContractVersion',
);
