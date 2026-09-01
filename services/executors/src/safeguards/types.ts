import type { ActionIntent, ActionPrecondition } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { ContractVersion } from '@aurora/contracts/versioning';

/**
 * Persistence adapter owned by W03. W07-C consumes this fence but stores no
 * idempotency state and does not create a second ledger/source of truth.
 */
export interface IdempotencyFencePort {
  reserve(input: {
    readonly tenantId: ActionIntent['tenant']['tenantId'];
    readonly key: string;
    readonly operationName: string;
    readonly canonicalPayloadHash: string;
  }): IdempotencyFenceDecision;
}

export type IdempotencyFenceDecision =
  | Readonly<{ kind: 'RESERVED' }>
  | Readonly<{ kind: 'REPLAY_COMPLETED'; reference?: string }>
  | Readonly<{ kind: 'INFLIGHT' }>
  | Readonly<{ kind: 'CONFLICT'; reason: string }>;

export type PreconditionEvaluator = (precondition: ActionPrecondition) => boolean;

export interface ExecutionQuotaSnapshot {
  readonly limit: number;
  readonly used: number;
}

export interface ExecutionSafeguardRequest {
  readonly schemaVersion: ContractVersion;
  readonly actionIntent: ActionIntent;
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly quota?: ExecutionQuotaSnapshot;
  readonly evaluatePrecondition: PreconditionEvaluator;
  /** Required only when ActionIntent.idempotency.mode is REQUIRED. */
  readonly canonicalPayloadHash?: string;
  /** Required only when ActionIntent.idempotency.mode is REQUIRED. */
  readonly idempotencyFence?: IdempotencyFencePort;
}

export type ExecutionSafeguardReason =
  | 'INVALID_TIME'
  | 'DEADLINE_EXPIRED'
  | 'ATTEMPT_INVALID'
  | 'ATTEMPT_LIMIT_REACHED'
  | 'QUOTA_INVALID'
  | 'QUOTA_EXHAUSTED'
  | 'PRECONDITION_FAILED'
  | 'IDEMPOTENCY_CONFIGURATION_INVALID'
  | 'IDEMPOTENCY_REPLAY_COMPLETED'
  | 'IDEMPOTENCY_INFLIGHT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'IDEMPOTENCY_FENCE_FAILED';

interface ExecutionSafeguardResultBase {
  readonly kind: 'EXECUTION_SAFEGUARD_RESULT';
  readonly schemaVersion: ContractVersion;
  readonly actionIntentId: ActionIntent['actionIntentId'];
  /** Safeguards constrain execution but never grant authority. */
  readonly authorizesExecution: false;
}

export type ExecutionSafeguardResult =
  | (ExecutionSafeguardResultBase & {
      readonly safeToInvokeExternal: true;
      readonly idempotencyReserved: boolean;
      readonly reasons: readonly [];
    })
  | (ExecutionSafeguardResultBase & {
      readonly safeToInvokeExternal: false;
      readonly idempotencyReserved: false;
      readonly reasons: readonly ExecutionSafeguardReason[];
    });
