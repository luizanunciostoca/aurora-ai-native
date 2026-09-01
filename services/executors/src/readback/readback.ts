import type { JsonObject, JsonValue } from '@aurora/contracts/actions';
import type { CorrelationContext } from '@aurora/contracts/context';
import {
  executionTargetFromProviderBinding,
  providerBindingMatchesExecutionTarget,
  type ExecutionTargetReference,
} from '@aurora/contracts/execution-target';
import type { Evidence } from '@aurora/contracts/evidence';
import type { TargetedReceipt } from '@aurora/contracts/receipts';

import type {
  CaptureReadbackEvidenceRequest,
  CaptureReadbackEvidenceResult,
  CreateTargetedReceiptRequest,
  ReadbackAssessment,
  ReadbackReason,
  ReceiptCreationReason,
  ReceiptCreationResult,
  TargetReadbackObservation,
} from './types.js';

const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const SENSITIVE_KEY_TERMS = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'credential',
  'authorization',
  'cookie',
  'privatekey',
] as const;

function timestampMs(value: string): number | undefined {
  if (!RFC3339_PATTERN.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function uniqueSorted<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort() as readonly T[];
}

function sameCorrelation(left: CorrelationContext, right: CorrelationContext): boolean {
  return (
    left.correlationId === right.correlationId &&
    left.causation?.causationId === right.causation?.causationId
  );
}

function sameTarget(left: ExecutionTargetReference, right: ExecutionTargetReference): boolean {
  if (left.schemaVersion !== right.schemaVersion || left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'PROVIDER':
      return (
        right.kind === 'PROVIDER' &&
        left.provider === right.provider &&
        left.targetType === right.targetType &&
        left.targetReference === right.targetReference &&
        left.accountReference === right.accountReference
      );
    case 'DEVICE':
      return right.kind === 'DEVICE' && left.bindingReference === right.bindingReference;
    case 'WORKFLOW':
      return right.kind === 'WORKFLOW' && left.bindingReference === right.bindingReference;
    case 'LOCAL_SERVICE':
      return right.kind === 'LOCAL_SERVICE' && left.bindingReference === right.bindingReference;
  }
}

function actionIntentTarget(
  actionIntent: CreateTargetedReceiptRequest['actionIntent'],
): ExecutionTargetReference | undefined {
  const { executionTarget, providerBinding } = actionIntent;
  if (executionTarget !== undefined) {
    if (
      providerBinding !== undefined &&
      !providerBindingMatchesExecutionTarget(providerBinding, executionTarget)
    ) {
      return undefined;
    }
    return executionTarget;
  }
  if (providerBinding !== undefined) {
    return executionTargetFromProviderBinding(providerBinding, actionIntent.schemaVersion);
  }
  return undefined;
}

function sensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return SENSITIVE_KEY_TERMS.some((term) => normalized.includes(term));
}

function containsSensitiveField(value: JsonValue): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSensitiveField(item));
  if (value === null || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, child]) => sensitiveKey(key) || containsSensitiveField(child),
  );
}

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value === null || typeof value !== 'object') return value;
  const objectValue = value as JsonObject;
  const result: Record<string, JsonValue> = {};
  for (const key of Object.keys(objectValue).sort()) {
    result[key] = canonicalize(objectValue[key]);
  }
  return result;
}

function sameJsonObject(left: JsonObject, right: JsonObject): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function rejectedReceipt(...reasons: readonly ReceiptCreationReason[]): ReceiptCreationResult {
  return { status: 'REJECTED', reasons: uniqueSorted(reasons), authorizesExecution: false };
}

/**
 * Creates a target-neutral canonical Receipt from a governed ActionIntent. This
 * records an attempt only; acknowledgement is explicitly not verified external state.
 */
export function createTargetedExecutionReceipt(
  request: CreateTargetedReceiptRequest,
): ReceiptCreationResult {
  if (request.schemaVersion !== request.actionIntent.schemaVersion) {
    return rejectedReceipt('RECEIPT_SCHEMA_MISMATCH');
  }
  const executionTarget = actionIntentTarget(request.actionIntent);
  if (executionTarget === undefined) return rejectedReceipt('EXECUTION_TARGET_REQUIRED');
  if (executionTarget.schemaVersion !== request.schemaVersion) {
    return rejectedReceipt('RECEIPT_SCHEMA_MISMATCH');
  }
  if (!Number.isInteger(request.attempt) || request.attempt < 1) {
    return rejectedReceipt('RECEIPT_ATTEMPT_INVALID');
  }
  if (request.executionOutcome === 'VERIFIED') {
    return rejectedReceipt('RECEIPT_VERIFIED_REQUIRES_READBACK');
  }
  if (
    request.executionOutcome === 'EXECUTED_ACKNOWLEDGED' &&
    request.acknowledgedAt === undefined
  ) {
    return rejectedReceipt('RECEIPT_ACKNOWLEDGEMENT_REQUIRED');
  }

  const attemptedAt = timestampMs(request.attemptedAt);
  const acknowledgedAt =
    request.acknowledgedAt === undefined ? undefined : timestampMs(request.acknowledgedAt);
  const returnedAt = request.returnedAt === undefined ? undefined : timestampMs(request.returnedAt);
  if (
    attemptedAt === undefined ||
    (request.acknowledgedAt !== undefined && acknowledgedAt === undefined) ||
    (request.returnedAt !== undefined && returnedAt === undefined)
  ) {
    return rejectedReceipt('RECEIPT_TIME_INVALID');
  }
  if (
    (acknowledgedAt !== undefined && acknowledgedAt < attemptedAt) ||
    (returnedAt !== undefined && returnedAt < attemptedAt) ||
    (acknowledgedAt !== undefined && returnedAt !== undefined && returnedAt < acknowledgedAt)
  ) {
    return rejectedReceipt('RECEIPT_TIME_ORDER_INVALID');
  }

  const receipt: TargetedReceipt = Object.freeze({
    kind: 'RECEIPT',
    schemaVersion: request.schemaVersion,
    receiptId: request.receiptId,
    actionIntentId: request.actionIntent.actionIntentId,
    ...(request.executionId === undefined ? {} : { executionId: request.executionId }),
    executor: request.executor,
    attempt: request.attempt,
    attemptedAt: request.attemptedAt,
    ...(request.acknowledgedAt === undefined ? {} : { acknowledgedAt: request.acknowledgedAt }),
    ...(request.returnedAt === undefined ? {} : { returnedAt: request.returnedAt }),
    ...(request.executionOutcome === undefined
      ? {}
      : { executionOutcome: request.executionOutcome }),
    correlation: request.actionIntent.correlation,
    executionTarget,
  });

  return {
    status: 'CREATED',
    receipt,
    acknowledgementIsVerifiedExternalState: false,
    authorizesExecution: false,
  };
}

function readbackBindingReasons(
  request: CaptureReadbackEvidenceRequest,
): readonly ReadbackReason[] {
  const reasons: ReadbackReason[] = [];
  if (
    request.schemaVersion !== request.actionIntent.schemaVersion ||
    request.receipt.schemaVersion !== request.actionIntent.schemaVersion
  ) {
    reasons.push('READBACK_SCHEMA_MISMATCH');
  }
  if (request.receipt.actionIntentId !== request.actionIntent.actionIntentId) {
    reasons.push('READBACK_ACTION_INTENT_MISMATCH');
  }
  if (!sameCorrelation(request.receipt.correlation, request.actionIntent.correlation)) {
    reasons.push('READBACK_CORRELATION_MISMATCH');
  }
  const expectedTarget = actionIntentTarget(request.actionIntent);
  if (expectedTarget === undefined || !sameTarget(request.receipt.executionTarget, expectedTarget)) {
    reasons.push('READBACK_TARGET_MISMATCH');
  }
  return uniqueSorted(reasons);
}

function unresolvedOutcome(receiptAcknowledged: boolean) {
  return receiptAcknowledged ? ('EXECUTED_ACKNOWLEDGED' as const) : ('EXECUTION_UNCERTAIN' as const);
}

function assessReadback(
  request: CaptureReadbackEvidenceRequest,
  observation: TargetReadbackObservation,
): ReadbackAssessment {
  const receiptAcknowledged = request.receipt.acknowledgedAt !== undefined;
  const expectedState = request.actionIntent.expectedState;
  if (expectedState === undefined) {
    return {
      state: 'UNKNOWN',
      reasons: ['EXPECTED_STATE_NOT_DECLARED'],
      receiptAcknowledged,
      verifiedExternalState: false,
      derivedExecutionOutcome: unresolvedOutcome(receiptAcknowledged),
      requiresReconciliation: true,
      authorizesExecution: false,
    };
  }
  if (observation.observedState === undefined) {
    return {
      state: 'UNKNOWN',
      reasons: ['OBSERVED_STATE_NOT_RETURNED'],
      receiptAcknowledged,
      verifiedExternalState: false,
      derivedExecutionOutcome: unresolvedOutcome(receiptAcknowledged),
      requiresReconciliation: true,
      authorizesExecution: false,
    };
  }

  const matches = sameJsonObject(expectedState.value, observation.observedState);
  if (!matches) {
    const mismatchReasons: ReadbackReason[] = ['READBACK_MISMATCH'];
    if (observation.verification.state !== 'VERIFIED') {
      mismatchReasons.push('READBACK_UNVERIFIED');
    }
    return {
      state: 'MISMATCH',
      reasons: uniqueSorted(mismatchReasons),
      receiptAcknowledged,
      verifiedExternalState: false,
      derivedExecutionOutcome: 'EXECUTION_UNCERTAIN',
      requiresReconciliation: true,
      authorizesExecution: false,
    };
  }

  if (observation.verification.state !== 'VERIFIED') {
    return {
      state: 'UNKNOWN',
      reasons: ['READBACK_UNVERIFIED'],
      receiptAcknowledged,
      verifiedExternalState: false,
      derivedExecutionOutcome: unresolvedOutcome(receiptAcknowledged),
      requiresReconciliation: true,
      authorizesExecution: false,
    };
  }

  return {
    state: 'MATCH',
    reasons: [],
    receiptAcknowledged,
    verifiedExternalState: true,
    derivedExecutionOutcome: 'VERIFIED',
    requiresReconciliation: false,
    authorizesExecution: false,
  };
}

/**
 * Invokes one generic target readback port and constructs canonical Evidence.
 * Concrete transport remains outside W07; failures stay explicit and never become retry authority.
 */
export function captureReadbackEvidence(
  request: CaptureReadbackEvidenceRequest,
): CaptureReadbackEvidenceResult {
  const bindingReasons = readbackBindingReasons(request);
  if (bindingReasons.length > 0) {
    return { status: 'REJECTED', reasons: bindingReasons, authorizesExecution: false };
  }

  let observation: TargetReadbackObservation;
  try {
    observation = request.readback({
      schemaVersion: request.schemaVersion,
      actionIntent: request.actionIntent,
      receipt: request.receipt,
    });
  } catch {
    return { status: 'REJECTED', reasons: ['READBACK_PORT_FAILED'], authorizesExecution: false };
  }

  const capturedAt = timestampMs(observation.capturedAt);
  const attemptedAt = timestampMs(request.receipt.attemptedAt);
  const acknowledgedAt =
    request.receipt.acknowledgedAt === undefined
      ? undefined
      : timestampMs(request.receipt.acknowledgedAt);
  const returnedAt =
    request.receipt.returnedAt === undefined ? undefined : timestampMs(request.receipt.returnedAt);
  if (
    capturedAt === undefined ||
    attemptedAt === undefined ||
    (request.receipt.acknowledgedAt !== undefined && acknowledgedAt === undefined) ||
    (request.receipt.returnedAt !== undefined && returnedAt === undefined)
  ) {
    return { status: 'REJECTED', reasons: ['READBACK_TIME_INVALID'], authorizesExecution: false };
  }
  const latestReceiptTime = returnedAt ?? acknowledgedAt ?? attemptedAt;
  if (capturedAt < latestReceiptTime) {
    return {
      status: 'REJECTED',
      reasons: ['READBACK_TIME_ORDER_INVALID'],
      authorizesExecution: false,
    };
  }
  if (observation.observedState !== undefined && containsSensitiveField(observation.observedState)) {
    return {
      status: 'REJECTED',
      reasons: ['READBACK_SENSITIVE_DATA_REJECTED'],
      authorizesExecution: false,
    };
  }

  const evidence: Evidence = Object.freeze({
    kind: 'EVIDENCE',
    schemaVersion: request.schemaVersion,
    evidenceId: request.evidenceId,
    subject: { kind: 'RECEIPT' as const, receiptId: request.receipt.receiptId },
    evidenceType: 'READBACK',
    capturedAt: observation.capturedAt,
    source: {
      sourceType: 'TARGET_READBACK',
      executionTarget: request.receipt.executionTarget,
      reference: observation.reference,
    },
    correlation: request.actionIntent.correlation,
    verification: {
      state: observation.verification.state,
      ...(observation.verification.state === 'VERIFIED'
        ? { verifiedAt: observation.capturedAt }
        : {}),
      ...(observation.verification.method === undefined
        ? {}
        : { method: observation.verification.method }),
    },
    readback: {
      reference: observation.reference,
      ...(observation.observedState === undefined
        ? {}
        : { observedState: observation.observedState }),
    },
    provenance: { sourceReference: observation.reference },
    dataClassification: request.actionIntent.dataClassification,
  });

  return {
    status: 'CAPTURED',
    evidence,
    assessment: assessReadback(request, observation),
    authorizesExecution: false,
  };
}
