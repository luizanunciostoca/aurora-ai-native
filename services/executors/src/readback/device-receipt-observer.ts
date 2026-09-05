import type { ActionIntent, ExternalReference, RestrictedMetadata } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { Evidence } from '@aurora/contracts/evidence';
import type {
  CommandId,
  CorrelationId,
  EvidenceId,
  ExecutionId,
  ReceiptId,
  TenantId,
} from '@aurora/contracts/ids';
import type { TargetedReceipt } from '@aurora/contracts/receipts';
import type { ContractVersion } from '@aurora/contracts/versioning';

import { createTargetedExecutionReceipt } from './readback.js';

const TENANT_ID = /^ten_[0-9A-HJKMNP-TV-Z]{26}$/u;
const CORRELATION_ID = /^cor_[0-9A-HJKMNP-TV-Z]{26}$/u;
const COMMAND_ID = /^cmd_[0-9A-HJKMNP-TV-Z]{26}$/u;
const EXECUTION_ID = /^exe_[0-9A-HJKMNP-TV-Z]{26}$/u;
const RECEIPT_ID = /^rcp_[0-9A-HJKMNP-TV-Z]{26}$/u;
const EVIDENCE_ID = /^evd_[0-9A-HJKMNP-TV-Z]{26}$/u;
const DEVICE_ID = /^dvc_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SAFE_REFERENCE = /^[A-Za-z0-9._:/+-]+$/u;
const MAX_REFERENCE_LENGTH = 512;

const OBSERVATION_KEYS = new Set([
  'kind',
  'schemaVersion',
  'receiptId',
  'evidenceId',
  'tenantId',
  'correlationId',
  'commandId',
  'executionId',
  'deviceRef',
  'deviceSessionId',
  'gatewaySessionId',
  'connectionId',
  'gatewayGeneration',
  'deliveryReference',
  'reportedState',
  'sourceReference',
  'integrityDigest',
  'authenticationReference',
  'capturedAtMs',
  'receivedAtMs',
  'ingressClassification',
  'requiresW07Reconciliation',
  'authoritySemantics',
  'authorizesExecution',
  'provesExecutionSuccess',
  'retryAuthorized',
]);
const DEVICE_REF_KEYS = new Set(['kind', 'deviceId', 'tenantId', 'registrationVersion']);
const REPORTED_STATES = new Set(['COMPLETED', 'FAILED', 'UNCERTAIN']);
const INGRESS_CLASSIFICATIONS = new Set([
  'CURRENT_SESSION',
  'LATE_AFTER_RECONNECT',
  'LATE_AFTER_REVOKE',
]);

export interface DeviceReceiptObservation {
  readonly kind: 'DEVICE_RECEIPT_EVIDENCE_OBSERVATION';
  readonly schemaVersion: ContractVersion;
  readonly receiptId: ReceiptId;
  readonly evidenceId?: EvidenceId;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly deviceRef: Readonly<{
    kind: 'AURORA_DEVICE';
    deviceId: string;
    tenantId: TenantId;
    registrationVersion: number;
  }>;
  readonly deviceSessionId: string;
  readonly gatewaySessionId: string;
  readonly connectionId: string;
  readonly gatewayGeneration: number;
  readonly deliveryReference: string;
  readonly reportedState: 'COMPLETED' | 'FAILED' | 'UNCERTAIN';
  readonly sourceReference: string;
  readonly integrityDigest: string;
  readonly authenticationReference: string;
  readonly capturedAtMs: number;
  readonly receivedAtMs: number;
  readonly ingressClassification:
    | 'CURRENT_SESSION'
    | 'LATE_AFTER_RECONNECT'
    | 'LATE_AFTER_REVOKE';
  readonly requiresW07Reconciliation: boolean;
  readonly authoritySemantics: 'EVIDENCE_INPUT_ONLY_W07_OWNS_OUTCOME_AND_RETRY';
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export interface TrustedDeviceExecutionLookup {
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
}

/** Server-owned execution binding. W14/device input cannot manufacture this material. */
export interface TrustedDeviceExecutionMaterial {
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly actionIntent: ActionIntent;
  readonly executor: TargetedReceipt['executor'];
  readonly attempt: number;
  readonly attemptedAt: Rfc3339Timestamp;
  readonly authorizesExecution: false;
}

export interface TrustedDeviceExecutionMaterialSource {
  resolve(lookup: TrustedDeviceExecutionLookup): TrustedDeviceExecutionMaterial | null;
}

export type DeviceReceiptObservationResult =
  | Readonly<{
      ok: true;
      disposition: 'OBSERVED';
      receiptReference: string;
      evidenceReference?: string;
      receipt: TargetedReceipt;
      evidence?: Evidence;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      code: 'REJECTED' | 'CONFLICT' | 'UNAVAILABLE' | 'MALFORMED';
      retryable: boolean;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.values(Object.getOwnPropertyDescriptors(value)).every(
      (descriptor) => descriptor.get === undefined && descriptor.set === undefined,
    );
  } catch {
    return false;
  }
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function boundedReference(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_REFERENCE_LENGTH &&
    SAFE_REFERENCE.test(value)
  );
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function timestampFromMs(value: number): Rfc3339Timestamp | null {
  if (!nonNegativeInteger(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return date.toISOString() as Rfc3339Timestamp;
}

function timestampMs(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseObservation(value: unknown): DeviceReceiptObservation | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, OBSERVATION_KEYS)) return null;
  if (
    value.kind !== 'DEVICE_RECEIPT_EVIDENCE_OBSERVATION' ||
    value.schemaVersion !== '1.0.0' ||
    typeof value.receiptId !== 'string' ||
    !RECEIPT_ID.test(value.receiptId) ||
    (value.evidenceId !== undefined &&
      (typeof value.evidenceId !== 'string' || !EVIDENCE_ID.test(value.evidenceId))) ||
    typeof value.tenantId !== 'string' ||
    !TENANT_ID.test(value.tenantId) ||
    typeof value.correlationId !== 'string' ||
    !CORRELATION_ID.test(value.correlationId) ||
    typeof value.commandId !== 'string' ||
    !COMMAND_ID.test(value.commandId) ||
    typeof value.executionId !== 'string' ||
    !EXECUTION_ID.test(value.executionId) ||
    !isPlainRecord(value.deviceRef) ||
    !hasOnlyKeys(value.deviceRef, DEVICE_REF_KEYS) ||
    value.deviceRef.kind !== 'AURORA_DEVICE' ||
    typeof value.deviceRef.deviceId !== 'string' ||
    !DEVICE_ID.test(value.deviceRef.deviceId) ||
    value.deviceRef.tenantId !== value.tenantId ||
    !positiveInteger(value.deviceRef.registrationVersion) ||
    !boundedReference(value.deviceSessionId) ||
    !boundedReference(value.gatewaySessionId) ||
    !boundedReference(value.connectionId) ||
    !positiveInteger(value.gatewayGeneration) ||
    !boundedReference(value.deliveryReference) ||
    typeof value.reportedState !== 'string' ||
    !REPORTED_STATES.has(value.reportedState) ||
    !boundedReference(value.sourceReference) ||
    !boundedReference(value.integrityDigest) ||
    !boundedReference(value.authenticationReference) ||
    !nonNegativeInteger(value.capturedAtMs) ||
    !nonNegativeInteger(value.receivedAtMs) ||
    value.capturedAtMs > value.receivedAtMs ||
    typeof value.ingressClassification !== 'string' ||
    !INGRESS_CLASSIFICATIONS.has(value.ingressClassification) ||
    typeof value.requiresW07Reconciliation !== 'boolean' ||
    value.authoritySemantics !== 'EVIDENCE_INPUT_ONLY_W07_OWNS_OUTCOME_AND_RETRY' ||
    value.authorizesExecution !== false ||
    value.provesExecutionSuccess !== false ||
    value.retryAuthorized !== false
  ) {
    return null;
  }
  return value as unknown as DeviceReceiptObservation;
}

function materialMatchesObservation(
  material: TrustedDeviceExecutionMaterial,
  observation: DeviceReceiptObservation,
): boolean {
  const intent = material.actionIntent;
  const target = intent.executionTarget;
  const attemptedAtMs = timestampMs(material.attemptedAt);
  return (
    material.authorizesExecution === false &&
    material.commandId === observation.commandId &&
    material.executionId === observation.executionId &&
    intent.kind === 'ACTION_INTENT' &&
    intent.schemaVersion === observation.schemaVersion &&
    intent.tenant.tenantId === observation.tenantId &&
    intent.correlation.correlationId === observation.correlationId &&
    target?.kind === 'DEVICE' &&
    target.bindingReference === observation.deviceRef.deviceId &&
    positiveInteger(material.attempt) &&
    attemptedAtMs !== null &&
    attemptedAtMs <= observation.receivedAtMs &&
    boundedReference(material.executor.executor) &&
    (material.executor.instanceReference === undefined ||
      boundedReference(material.executor.instanceReference))
  );
}

function rejected(
  code: 'REJECTED' | 'CONFLICT' | 'UNAVAILABLE' | 'MALFORMED',
  retryable = false,
): DeviceReceiptObservationResult {
  return {
    ok: false,
    code,
    retryable,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function artifactReference(kind: 'receipt' | 'evidence', id: string): string {
  return `w07:${kind}:${id}`;
}

function sourceReference(observation: DeviceReceiptObservation): ExternalReference {
  return { system: 'AURORA_W14_DEVICE_RECEIPT', reference: observation.sourceReference };
}

function evidenceMetadata(observation: DeviceReceiptObservation): RestrictedMetadata {
  return {
    deviceReportedState: observation.reportedState,
    ingressClassification: observation.ingressClassification,
    requiresW07Reconciliation: observation.requiresW07Reconciliation,
    deviceId: observation.deviceRef.deviceId,
    deviceRegistrationVersion: observation.deviceRef.registrationVersion,
    deviceSessionId: observation.deviceSessionId,
    gatewaySessionId: observation.gatewaySessionId,
    gatewayGeneration: observation.gatewayGeneration,
    deliveryReference: observation.deliveryReference,
    deviceCapturedAtMs: observation.capturedAtMs,
  };
}

/**
 * W07-owned semantic adapter for authenticated W14 device receipt observations.
 *
 * It creates a canonical target-neutral Receipt and optional EXECUTION_RECEIPT Evidence. Device
 * reported state remains UNVERIFIED observation metadata and never becomes ExecutionOutcome,
 * verified readback, authority or retry permission. W03 remains ingress dedupe/replay owner.
 */
export class W07DeviceReceiptObservationAdapter {
  readonly #source: TrustedDeviceExecutionMaterialSource;

  constructor(source: TrustedDeviceExecutionMaterialSource) {
    this.#source = source;
  }

  observe(input: unknown): DeviceReceiptObservationResult {
    const observation = parseObservation(input);
    if (observation === null) return rejected('MALFORMED');

    let material: TrustedDeviceExecutionMaterial | null;
    try {
      material = this.#source.resolve({
        commandId: observation.commandId,
        executionId: observation.executionId,
      });
    } catch {
      return rejected('UNAVAILABLE', true);
    }
    if (material === null) return rejected('REJECTED');
    if (!materialMatchesObservation(material, observation)) return rejected('CONFLICT');

    const receivedAt = timestampFromMs(observation.receivedAtMs);
    if (receivedAt === null) return rejected('MALFORMED');
    const receiptResult = createTargetedExecutionReceipt({
      schemaVersion: observation.schemaVersion,
      actionIntent: material.actionIntent,
      receiptId: observation.receiptId,
      executionId: observation.executionId,
      executor: material.executor,
      attempt: material.attempt,
      attemptedAt: material.attemptedAt,
      acknowledgedAt: receivedAt,
      returnedAt: receivedAt,
    });
    if (receiptResult.status !== 'CREATED') return rejected('REJECTED');

    const receipt = receiptResult.receipt;
    const receiptReference = artifactReference('receipt', receipt.receiptId);
    if (observation.evidenceId === undefined) {
      return {
        ok: true,
        disposition: 'OBSERVED',
        receiptReference,
        receipt,
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    }

    const reference = sourceReference(observation);
    const evidence = Object.freeze<Evidence>({
      kind: 'EVIDENCE',
      schemaVersion: observation.schemaVersion,
      evidenceId: observation.evidenceId,
      subject: { kind: 'RECEIPT', receiptId: observation.receiptId },
      evidenceType: 'EXECUTION_RECEIPT',
      capturedAt: receivedAt,
      source: {
        sourceType: 'EXECUTOR',
        executionTarget: receipt.executionTarget,
        reference,
      },
      correlation: material.actionIntent.correlation,
      verification: { state: 'UNVERIFIED' },
      provenance: { sourceReference: reference },
      dataClassification: material.actionIntent.dataClassification,
      metadata: evidenceMetadata(observation),
    });

    return {
      ok: true,
      disposition: 'OBSERVED',
      receiptReference,
      evidenceReference: artifactReference('evidence', evidence.evidenceId),
      receipt,
      evidence,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
  }
}
