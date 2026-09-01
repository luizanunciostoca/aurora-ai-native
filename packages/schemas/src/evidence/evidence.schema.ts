import type { ActorRef, CorrelationContext, DataClassification } from '@aurora/contracts/context';
import type {
  Evidence,
  EvidenceSource,
  EvidenceSubject,
  EvidenceType,
  EvidenceVerification,
} from '@aurora/contracts/evidence';
import type { ActionIntentId, EvidenceId, ExecutionId, ReceiptId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';
import { ExecutionTargetReferenceSchema } from '../execution-target';
import {
  asRecord,
  exactKeys,
  externalReference,
  jsonObject,
  nonEmptyString,
  optionalNonEmptyString,
  restrictedMetadata,
  timestamp,
  type DependencyParser,
} from '../actions/internal-validation';

export interface EvidenceSchemaDependencies {
  readonly parseContractVersion: DependencyParser<ContractVersion>;
  readonly parseEvidenceId: DependencyParser<EvidenceId>;
  readonly parseActionIntentId: DependencyParser<ActionIntentId>;
  readonly parseReceiptId: DependencyParser<ReceiptId>;
  readonly parseExecutionId: DependencyParser<ExecutionId>;
  readonly parseActorRef: DependencyParser<ActorRef>;
  readonly parseCorrelationContext: DependencyParser<CorrelationContext>;
  readonly parseDataClassification: DependencyParser<DataClassification>;
}

function subject(
  input: unknown,
  path: string,
  dependencies: EvidenceSchemaDependencies,
): EvidenceSubject {
  const record = asRecord(input, path);
  const kind = nonEmptyString(record.kind, `${path}.kind`, 64);
  if (kind === 'ACTION_INTENT') {
    exactKeys(record, ['kind', 'actionIntentId'], ['kind', 'actionIntentId'], path);
    return { kind, actionIntentId: dependencies.parseActionIntentId(record.actionIntentId) };
  }
  if (kind === 'RECEIPT') {
    exactKeys(record, ['kind', 'receiptId'], ['kind', 'receiptId'], path);
    return { kind, receiptId: dependencies.parseReceiptId(record.receiptId) };
  }
  if (kind === 'EXECUTION') {
    exactKeys(record, ['kind', 'executionId'], ['kind', 'executionId'], path);
    return { kind, executionId: dependencies.parseExecutionId(record.executionId) };
  }
  if (kind === 'EXTERNAL_REFERENCE') {
    exactKeys(record, ['kind', 'reference'], ['kind', 'reference'], path);
    return { kind, reference: externalReference(record.reference, `${path}.reference`) };
  }
  throw new TypeError(`${path}.kind: unsupported evidence subject`);
}

function evidenceType(input: unknown): EvidenceType {
  if (
    input === 'READBACK' ||
    input === 'EXECUTION_RECEIPT' ||
    input === 'PROVIDER_RECEIPT' ||
    input === 'STATE_SNAPSHOT' ||
    input === 'SIGNED_ATTESTATION' ||
    input === 'REFERENCE'
  ) {
    return input;
  }
  throw new TypeError('Evidence.evidenceType: unsupported evidence type');
}

function source(
  input: unknown,
  path: string,
  dependencies: EvidenceSchemaDependencies,
): EvidenceSource {
  const record = asRecord(input, path);
  exactKeys(
    record,
    ['sourceType', 'capturedBy', 'provider', 'executionTarget', 'reference'],
    ['sourceType'],
    path,
  );
  if (
    record.sourceType !== 'TARGET_READBACK' &&
    record.sourceType !== 'PROVIDER_READBACK' &&
    record.sourceType !== 'EXECUTOR' &&
    record.sourceType !== 'SYSTEM' &&
    record.sourceType !== 'HUMAN'
  ) {
    throw new TypeError(`${path}.sourceType: unsupported evidence source type`);
  }

  const capturedBy =
    record.capturedBy === undefined ? undefined : dependencies.parseActorRef(record.capturedBy);
  const provider = optionalNonEmptyString(record.provider, `${path}.provider`, 128);
  const executionTarget =
    record.executionTarget === undefined
      ? undefined
      : ExecutionTargetReferenceSchema.parse(
          record.executionTarget,
          { parseContractVersion: dependencies.parseContractVersion },
          `${path}.executionTarget`,
        );
  const reference =
    record.reference === undefined
      ? undefined
      : externalReference(record.reference, `${path}.reference`);

  if (record.sourceType === 'TARGET_READBACK' && executionTarget === undefined) {
    throw new TypeError(`${path}.executionTarget: required for TARGET_READBACK`);
  }
  if (provider !== undefined && record.sourceType !== 'PROVIDER_READBACK') {
    throw new TypeError(`${path}.provider: only valid for PROVIDER_READBACK`);
  }
  if (provider !== undefined && executionTarget !== undefined) {
    if (executionTarget.kind !== 'PROVIDER' || executionTarget.provider !== provider) {
      throw new TypeError(`${path}: provider conflicts with executionTarget`);
    }
  }
  if (record.sourceType === 'PROVIDER_READBACK' && executionTarget?.kind !== undefined && executionTarget.kind !== 'PROVIDER') {
    throw new TypeError(`${path}.executionTarget: PROVIDER_READBACK requires PROVIDER target`);
  }

  return {
    sourceType: record.sourceType,
    ...(capturedBy === undefined ? {} : { capturedBy }),
    ...(provider === undefined ? {} : { provider }),
    ...(executionTarget === undefined ? {} : { executionTarget }),
    ...(reference === undefined ? {} : { reference }),
  };
}

function verification(
  input: unknown,
  path: string,
  capturedAt: Evidence['capturedAt'],
  dependencies: EvidenceSchemaDependencies,
): EvidenceVerification {
  const record = asRecord(input, path);
  exactKeys(record, ['state', 'verifiedAt', 'verifier', 'method'], ['state'], path);
  if (record.state !== 'UNVERIFIED' && record.state !== 'VERIFIED' && record.state !== 'REJECTED') {
    throw new TypeError(`${path}.state: unsupported verification state`);
  }
  const verifiedAt =
    record.verifiedAt === undefined
      ? undefined
      : timestamp(record.verifiedAt, `${path}.verifiedAt`);
  const verifier =
    record.verifier === undefined ? undefined : dependencies.parseActorRef(record.verifier);
  const method = optionalNonEmptyString(record.method, `${path}.method`, 256);
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

function parse(input: unknown, dependencies: EvidenceSchemaDependencies): Evidence {
  const record = asRecord(input, 'Evidence');
  exactKeys(
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

  let readback: Evidence['readback'];
  if (record.readback !== undefined) {
    const value = asRecord(record.readback, 'Evidence.readback');
    exactKeys(value, ['reference', 'observedState'], ['reference'], 'Evidence.readback');
    const observedState =
      value.observedState === undefined
        ? undefined
        : jsonObject(value.observedState, 'Evidence.readback.observedState');
    readback = {
      reference: externalReference(value.reference, 'Evidence.readback.reference'),
      ...(observedState === undefined ? {} : { observedState }),
    };
  }

  let integrity: Evidence['integrity'];
  if (record.integrity !== undefined) {
    const value = asRecord(record.integrity, 'Evidence.integrity');
    exactKeys(
      value,
      ['algorithm', 'digest', 'signatureReference'],
      ['algorithm', 'digest'],
      'Evidence.integrity',
    );
    const signatureReference =
      value.signatureReference === undefined
        ? undefined
        : externalReference(value.signatureReference, 'Evidence.integrity.signatureReference');
    integrity = {
      algorithm: nonEmptyString(value.algorithm, 'Evidence.integrity.algorithm', 64),
      digest: nonEmptyString(value.digest, 'Evidence.integrity.digest', 1024),
      ...(signatureReference === undefined ? {} : { signatureReference }),
    };
  }

  const provenanceRecord = asRecord(record.provenance, 'Evidence.provenance');
  exactKeys(
    provenanceRecord,
    ['capturedBy', 'sourceReference', 'parentEvidenceReferences'],
    [],
    'Evidence.provenance',
  );
  let parentEvidenceReferences: readonly ReturnType<typeof externalReference>[] | undefined;
  if (provenanceRecord.parentEvidenceReferences !== undefined) {
    if (!Array.isArray(provenanceRecord.parentEvidenceReferences)) {
      throw new TypeError('Evidence.provenance.parentEvidenceReferences: expected array');
    }
    if (provenanceRecord.parentEvidenceReferences.length > 64) {
      throw new TypeError('Evidence.provenance.parentEvidenceReferences: maximum 64 references');
    }
    parentEvidenceReferences = provenanceRecord.parentEvidenceReferences.map((value, index) =>
      externalReference(value, `Evidence.provenance.parentEvidenceReferences[${index}]`),
    );
  }
  const provenanceCapturedBy =
    provenanceRecord.capturedBy === undefined
      ? undefined
      : dependencies.parseActorRef(provenanceRecord.capturedBy);
  const sourceReference =
    provenanceRecord.sourceReference === undefined
      ? undefined
      : externalReference(provenanceRecord.sourceReference, 'Evidence.provenance.sourceReference');
  const provenance: Evidence['provenance'] = {
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

  const capturedAt = timestamp(record.capturedAt, 'Evidence.capturedAt');
  const metadata =
    record.metadata === undefined
      ? undefined
      : restrictedMetadata(record.metadata, 'Evidence.metadata');

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

export const EvidenceSchema = Object.freeze({ parse });
