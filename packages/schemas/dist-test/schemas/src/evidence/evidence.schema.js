'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.EvidenceSchema = void 0;
const internal_validation_1 = require('../actions/internal-validation');
function subject(input, path, dependencies) {
  const record = (0, internal_validation_1.asRecord)(input, path);
  const kind = (0, internal_validation_1.nonEmptyString)(record.kind, `${path}.kind`, 64);
  if (kind === 'ACTION_INTENT') {
    (0, internal_validation_1.exactKeys)(
      record,
      ['kind', 'actionIntentId'],
      ['kind', 'actionIntentId'],
      path,
    );
    return { kind, actionIntentId: dependencies.parseActionIntentId(record.actionIntentId) };
  }
  if (kind === 'RECEIPT') {
    (0, internal_validation_1.exactKeys)(
      record,
      ['kind', 'receiptId'],
      ['kind', 'receiptId'],
      path,
    );
    return { kind, receiptId: dependencies.parseReceiptId(record.receiptId) };
  }
  if (kind === 'EXECUTION') {
    (0, internal_validation_1.exactKeys)(
      record,
      ['kind', 'executionId'],
      ['kind', 'executionId'],
      path,
    );
    return { kind, executionId: dependencies.parseExecutionId(record.executionId) };
  }
  if (kind === 'EXTERNAL_REFERENCE') {
    (0, internal_validation_1.exactKeys)(
      record,
      ['kind', 'reference'],
      ['kind', 'reference'],
      path,
    );
    return {
      kind,
      reference: (0, internal_validation_1.externalReference)(
        record.reference,
        `${path}.reference`,
      ),
    };
  }
  throw new TypeError(`${path}.kind: unsupported evidence subject`);
}
function evidenceType(input) {
  if (
    input === 'READBACK' ||
    input === 'PROVIDER_RECEIPT' ||
    input === 'STATE_SNAPSHOT' ||
    input === 'SIGNED_ATTESTATION' ||
    input === 'REFERENCE'
  ) {
    return input;
  }
  throw new TypeError('Evidence.evidenceType: unsupported evidence type');
}
function source(input, path, dependencies) {
  const record = (0, internal_validation_1.asRecord)(input, path);
  (0, internal_validation_1.exactKeys)(
    record,
    ['sourceType', 'capturedBy', 'provider', 'reference'],
    ['sourceType'],
    path,
  );
  if (
    record.sourceType !== 'PROVIDER_READBACK' &&
    record.sourceType !== 'EXECUTOR' &&
    record.sourceType !== 'SYSTEM' &&
    record.sourceType !== 'HUMAN'
  ) {
    throw new TypeError(`${path}.sourceType: unsupported evidence source type`);
  }
  const capturedBy =
    record.capturedBy === undefined ? undefined : dependencies.parseActorRef(record.capturedBy);
  const provider = (0, internal_validation_1.optionalNonEmptyString)(
    record.provider,
    `${path}.provider`,
    128,
  );
  const reference =
    record.reference === undefined
      ? undefined
      : (0, internal_validation_1.externalReference)(record.reference, `${path}.reference`);
  return {
    sourceType: record.sourceType,
    ...(capturedBy === undefined ? {} : { capturedBy }),
    ...(provider === undefined ? {} : { provider }),
    ...(reference === undefined ? {} : { reference }),
  };
}
function verification(input, path, capturedAt, dependencies) {
  const record = (0, internal_validation_1.asRecord)(input, path);
  (0, internal_validation_1.exactKeys)(
    record,
    ['state', 'verifiedAt', 'verifier', 'method'],
    ['state'],
    path,
  );
  if (record.state !== 'UNVERIFIED' && record.state !== 'VERIFIED' && record.state !== 'REJECTED') {
    throw new TypeError(`${path}.state: unsupported verification state`);
  }
  const verifiedAt =
    record.verifiedAt === undefined
      ? undefined
      : (0, internal_validation_1.timestamp)(record.verifiedAt, `${path}.verifiedAt`);
  const verifier =
    record.verifier === undefined ? undefined : dependencies.parseActorRef(record.verifier);
  const method = (0, internal_validation_1.optionalNonEmptyString)(
    record.method,
    `${path}.method`,
    256,
  );
  if (record.state === 'VERIFIED' && (!verifiedAt || !verifier || !method)) {
    throw new TypeError(`${path}: VERIFIED requires verifiedAt, verifier, and method`);
  }
  if (verifiedAt && Date.parse(verifiedAt) < Date.parse(capturedAt)) {
    throw new TypeError(`${path}.verifiedAt: cannot precede capturedAt`);
  }
  if (record.state === 'UNVERIFIED' && (verifiedAt || verifier)) {
    throw new TypeError(`${path}: UNVERIFIED cannot carry verifier/verifiedAt`);
  }
  return {
    state: record.state,
    ...(verifiedAt === undefined ? {} : { verifiedAt }),
    ...(verifier === undefined ? {} : { verifier }),
    ...(method === undefined ? {} : { method }),
  };
}
function parse(input, dependencies) {
  const record = (0, internal_validation_1.asRecord)(input, 'Evidence');
  (0, internal_validation_1.exactKeys)(
    record,
    [
      'kind',
      'schemaVersion',
      'evidenceId',
      'subject',
      'evidenceType',
      'capturedAt',
      'source',
      'correlation',
      'verification',
      'readback',
      'integrity',
      'provenance',
      'dataClassification',
      'metadata',
    ],
    [
      'kind',
      'schemaVersion',
      'evidenceId',
      'subject',
      'evidenceType',
      'capturedAt',
      'source',
      'correlation',
      'verification',
      'provenance',
      'dataClassification',
    ],
    'Evidence',
  );
  if (record.kind !== 'EVIDENCE') throw new TypeError('Evidence.kind: expected EVIDENCE');
  let readback;
  if (record.readback !== undefined) {
    const value = (0, internal_validation_1.asRecord)(record.readback, 'Evidence.readback');
    (0, internal_validation_1.exactKeys)(
      value,
      ['reference', 'observedState'],
      ['reference'],
      'Evidence.readback',
    );
    const observedState =
      value.observedState === undefined
        ? undefined
        : (0, internal_validation_1.jsonObject)(
            value.observedState,
            'Evidence.readback.observedState',
          );
    readback = {
      reference: (0, internal_validation_1.externalReference)(
        value.reference,
        'Evidence.readback.reference',
      ),
      ...(observedState === undefined ? {} : { observedState }),
    };
  }
  let integrity;
  if (record.integrity !== undefined) {
    const value = (0, internal_validation_1.asRecord)(record.integrity, 'Evidence.integrity');
    (0, internal_validation_1.exactKeys)(
      value,
      ['algorithm', 'digest', 'signatureReference'],
      ['algorithm', 'digest'],
      'Evidence.integrity',
    );
    const signatureReference =
      value.signatureReference === undefined
        ? undefined
        : (0, internal_validation_1.externalReference)(
            value.signatureReference,
            'Evidence.integrity.signatureReference',
          );
    integrity = {
      algorithm: (0, internal_validation_1.nonEmptyString)(
        value.algorithm,
        'Evidence.integrity.algorithm',
        64,
      ),
      digest: (0, internal_validation_1.nonEmptyString)(
        value.digest,
        'Evidence.integrity.digest',
        1024,
      ),
      ...(signatureReference === undefined ? {} : { signatureReference }),
    };
  }
  const provenanceRecord = (0, internal_validation_1.asRecord)(
    record.provenance,
    'Evidence.provenance',
  );
  (0, internal_validation_1.exactKeys)(
    provenanceRecord,
    ['capturedBy', 'sourceReference', 'parentEvidenceReferences'],
    [],
    'Evidence.provenance',
  );
  let parentEvidenceReferences;
  if (provenanceRecord.parentEvidenceReferences !== undefined) {
    if (!Array.isArray(provenanceRecord.parentEvidenceReferences)) {
      throw new TypeError('Evidence.provenance.parentEvidenceReferences: expected array');
    }
    if (provenanceRecord.parentEvidenceReferences.length > 64) {
      throw new TypeError('Evidence.provenance.parentEvidenceReferences: maximum 64 references');
    }
    parentEvidenceReferences = provenanceRecord.parentEvidenceReferences.map((value, index) =>
      (0, internal_validation_1.externalReference)(
        value,
        `Evidence.provenance.parentEvidenceReferences[${index}]`,
      ),
    );
  }
  const provenanceCapturedBy =
    provenanceRecord.capturedBy === undefined
      ? undefined
      : dependencies.parseActorRef(provenanceRecord.capturedBy);
  const sourceReference =
    provenanceRecord.sourceReference === undefined
      ? undefined
      : (0, internal_validation_1.externalReference)(
          provenanceRecord.sourceReference,
          'Evidence.provenance.sourceReference',
        );
  const provenance = {
    ...(provenanceCapturedBy === undefined ? {} : { capturedBy: provenanceCapturedBy }),
    ...(sourceReference === undefined ? {} : { sourceReference }),
    ...(parentEvidenceReferences === undefined ? {} : { parentEvidenceReferences }),
  };
  if (
    !provenance.capturedBy &&
    !provenance.sourceReference &&
    !provenance.parentEvidenceReferences?.length
  ) {
    throw new TypeError('Evidence.provenance: at least one provenance reference is required');
  }
  const capturedAt = (0, internal_validation_1.timestamp)(record.capturedAt, 'Evidence.capturedAt');
  const metadata =
    record.metadata === undefined
      ? undefined
      : (0, internal_validation_1.restrictedMetadata)(record.metadata, 'Evidence.metadata');
  return {
    kind: 'EVIDENCE',
    schemaVersion: dependencies.parseContractVersion(record.schemaVersion),
    evidenceId: dependencies.parseEvidenceId(record.evidenceId),
    subject: subject(record.subject, 'Evidence.subject', dependencies),
    evidenceType: evidenceType(record.evidenceType),
    capturedAt,
    source: source(record.source, 'Evidence.source', dependencies),
    correlation: dependencies.parseCorrelationContext(record.correlation),
    verification: verification(
      record.verification,
      'Evidence.verification',
      capturedAt,
      dependencies,
    ),
    ...(readback === undefined ? {} : { readback }),
    ...(integrity === undefined ? {} : { integrity }),
    provenance,
    dataClassification: dependencies.parseDataClassification(record.dataClassification),
    ...(metadata === undefined ? {} : { metadata }),
  };
}
exports.EvidenceSchema = Object.freeze({ parse });
