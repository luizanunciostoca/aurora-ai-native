'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const evidence_schema_1 = require('./evidence.schema');
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function expectThrows(fn, contains) {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(contains), `expected error containing "${contains}", got "${message}"`);
    return;
  }
  throw new Error(`expected function to throw: ${contains}`);
}
const prefixed = (prefix, input) => {
  if (typeof input !== 'string' || !input.startsWith(`${prefix}_`)) {
    throw new TypeError(`expected ${prefix}_ prefixed ID`);
  }
  return input;
};
const dependencies = {
  parseContractVersion(input) {
    if (input !== '1.0.0') throw new TypeError('unsupported ContractVersion');
    return input;
  },
  parseEvidenceId: (input) => prefixed('evd', input),
  parseActionIntentId: (input) => prefixed('act', input),
  parseReceiptId: (input) => prefixed('rcp', input),
  parseExecutionId: (input) => prefixed('exe', input),
  parseActorRef(input) {
    if (input === null || typeof input !== 'object') throw new TypeError('invalid actor');
    const value = input;
    prefixed('idn', value.identityId);
    if (!['HUMAN', 'AGENT', 'SERVICE', 'SYSTEM'].includes(String(value.kind))) {
      throw new TypeError('invalid actor kind');
    }
    return input;
  },
  parseCorrelationContext(input) {
    if (input === null || typeof input !== 'object') throw new TypeError('invalid correlation');
    prefixed('cor', input.correlationId);
    return input;
  },
  parseDataClassification(input) {
    if (!['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'].includes(String(input))) {
      throw new TypeError('invalid classification');
    }
    return input;
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
};
const parsed = evidence_schema_1.EvidenceSchema.parse(validEvidence, dependencies);
assert(parsed.subject.kind === 'ACTION_INTENT', 'Evidence must retain subject linkage');
assert(parsed.verification.state === 'VERIFIED', 'Evidence verification state must be explicit');
const roundTrip = evidence_schema_1.EvidenceSchema.parse(
  JSON.parse(JSON.stringify(parsed)),
  dependencies,
);
assert(
  JSON.stringify(roundTrip) === JSON.stringify(parsed),
  'Evidence serialization round trip must be stable',
);
const withoutSubject = JSON.parse(JSON.stringify(validEvidence));
delete withoutSubject.subject;
expectThrows(
  () => evidence_schema_1.EvidenceSchema.parse(withoutSubject, dependencies),
  'subject: missing required field',
);
expectThrows(
  () =>
    evidence_schema_1.EvidenceSchema.parse({ ...validEvidence, evidenceType: 'LOG' }, dependencies),
  'unsupported evidence type',
);
expectThrows(
  () => evidence_schema_1.EvidenceSchema.parse({ ...validEvidence, provenance: {} }, dependencies),
  'at least one provenance reference is required',
);
expectThrows(
  () =>
    evidence_schema_1.EvidenceSchema.parse(
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
    evidence_schema_1.EvidenceSchema.parse(
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
  () =>
    evidence_schema_1.EvidenceSchema.parse(
      { ...validEvidence, capturedAt: 'invalid-time' },
      dependencies,
    ),
  'expected valid RFC3339 timestamp',
);
expectThrows(
  () =>
    evidence_schema_1.EvidenceSchema.parse(
      { ...validEvidence, verifiedOutcome: 'SUCCEEDED' },
      dependencies,
    ),
  'verifiedOutcome: unknown field',
);
expectThrows(
  () =>
    evidence_schema_1.EvidenceSchema.parse(
      { ...validEvidence, schemaVersion: '9.0.0' },
      dependencies,
    ),
  'unsupported ContractVersion',
);
