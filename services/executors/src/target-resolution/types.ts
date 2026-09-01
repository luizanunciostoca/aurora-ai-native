import type { Rfc3339Timestamp, TenantContext } from '@aurora/contracts/context';
import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';
import type { ContractVersion } from '@aurora/contracts/versioning';

export const TARGET_BINDING_STATES = ['AVAILABLE', 'UNAVAILABLE', 'DEGRADED', 'RETIRED'] as const;
export type TargetBindingState = (typeof TARGET_BINDING_STATES)[number];

export interface ExecutableTargetBinding {
  readonly schemaVersion: ContractVersion;
  readonly bindingId: string;
  readonly tenant: TenantContext;
  readonly target: ExecutionTargetReference;
  readonly state: TargetBindingState;
  /** Exclusive freshness boundary. A binding at or beyond this instant is stale. */
  readonly freshUntil?: Rfc3339Timestamp;
  readonly compatibleActionIntentSchemaVersions: readonly ContractVersion[];
  /** Generic executor preconditions only; target-specific session/runtime checks remain consumer-wave owned. */
  readonly preconditionsSatisfied: boolean;
}

export interface TargetResolutionRequest {
  readonly schemaVersion: ContractVersion;
  readonly actionIntentSchemaVersion: ContractVersion;
  readonly tenant: TenantContext;
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly target: ExecutionTargetReference;
  readonly bindings: readonly ExecutableTargetBinding[];
}

export type TargetResolutionReason =
  | 'TARGET_NOT_FOUND'
  | 'TARGET_AMBIGUOUS'
  | 'TARGET_TENANT_MISMATCH'
  | 'TARGET_UNAVAILABLE'
  | 'TARGET_DEGRADED'
  | 'TARGET_RETIRED'
  | 'TARGET_STALE'
  | 'TARGET_TIME_INVALID'
  | 'TARGET_INCOMPATIBLE'
  | 'TARGET_PRECONDITION_FAILED';

interface TargetResolutionResultBase {
  readonly kind: 'EXECUTION_TARGET_RESOLUTION';
  readonly schemaVersion: ContractVersion;
  readonly target: ExecutionTargetReference;
  readonly authorizesExecution: false;
}

export type TargetResolutionResult =
  | (TargetResolutionResultBase & {
      readonly resolved: true;
      readonly binding: ExecutableTargetBinding;
      readonly reasons: readonly [];
    })
  | (TargetResolutionResultBase & {
      readonly resolved: false;
      readonly binding?: never;
      readonly reasons: readonly TargetResolutionReason[];
    });
