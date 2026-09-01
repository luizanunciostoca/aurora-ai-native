import type { ProviderBinding } from '../actions/execution-values';
import type { ContractVersion } from '../versioning';

export const EXECUTION_TARGET_KINDS = [
  'PROVIDER',
  'DEVICE',
  'WORKFLOW',
  'LOCAL_SERVICE',
] as const;
export type ExecutionTargetKind = (typeof EXECUTION_TARGET_KINDS)[number];

interface ExecutionTargetReferenceBase {
  readonly schemaVersion: ContractVersion;
  readonly kind: ExecutionTargetKind;
}

/**
 * Provider target metadata preserves legacy ProviderBinding semantics without
 * carrying provider credentials or granting execution authority.
 */
export interface ProviderExecutionTargetReference extends ExecutionTargetReferenceBase {
  readonly kind: 'PROVIDER';
  readonly provider: string;
  readonly targetType?: string;
  readonly targetReference?: string;
  readonly accountReference?: string;
}

/** Opaque governed device binding. W14 retains DeviceId/DeviceRef ownership. */
export interface DeviceExecutionTargetReference extends ExecutionTargetReferenceBase {
  readonly kind: 'DEVICE';
  readonly bindingReference: string;
}

/** Opaque governed workflow binding. W09 retains workflow runtime ownership. */
export interface WorkflowExecutionTargetReference extends ExecutionTargetReferenceBase {
  readonly kind: 'WORKFLOW';
  readonly bindingReference: string;
}

/**
 * Opaque local-service binding. This reference cannot express shell commands,
 * executable paths, credentials, or process-spawn authority.
 */
export interface LocalServiceExecutionTargetReference extends ExecutionTargetReferenceBase {
  readonly kind: 'LOCAL_SERVICE';
  readonly bindingReference: string;
}

export type ExecutionTargetReference =
  | ProviderExecutionTargetReference
  | DeviceExecutionTargetReference
  | WorkflowExecutionTargetReference
  | LocalServiceExecutionTargetReference;

export function executionTargetFromProviderBinding(
  providerBinding: ProviderBinding,
  schemaVersion: ContractVersion,
): ProviderExecutionTargetReference {
  return {
    schemaVersion,
    kind: 'PROVIDER',
    provider: providerBinding.provider,
    ...(providerBinding.targetType === undefined
      ? {}
      : { targetType: providerBinding.targetType }),
    ...(providerBinding.targetReference === undefined
      ? {}
      : { targetReference: providerBinding.targetReference }),
  };
}

export function providerBindingMatchesExecutionTarget(
  providerBinding: ProviderBinding,
  executionTarget: ExecutionTargetReference,
): boolean {
  return (
    executionTarget.kind === 'PROVIDER' &&
    providerBinding.provider === executionTarget.provider &&
    providerBinding.targetType === executionTarget.targetType &&
    providerBinding.targetReference === executionTarget.targetReference
  );
}
