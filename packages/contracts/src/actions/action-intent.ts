import type { ActionIntentId, OwnerDecisionId, PolicyTokenId, TenantId } from '../ids/index.js';
import type { ContractVersion } from '../versioning/index.js';
import type {
  CorrelationContext,
  DataClassification,
  IdentityReference,
} from '../context/index.js';
import type {
  ActionIdempotency,
  ActionPrecondition,
  CapabilityActionReference,
  ExecutionClassificationReference,
  ExpectedState,
  JsonObject,
  ProviderBinding,
  RestrictedMetadata,
} from './execution-values.js';

export type ActionAuthorityReference =
  | Readonly<{ kind: 'POLICY_TOKEN'; policyTokenId: PolicyTokenId }>
  | Readonly<{ kind: 'OWNER_DECISION'; ownerDecisionId: OwnerDecisionId }>
  | Readonly<{
      kind: 'POLICY_AND_OWNER_DECISION';
      policyTokenId: PolicyTokenId;
      ownerDecisionId: OwnerDecisionId;
    }>;

/**
 * Fully resolved instruction handed from decision/control plane to an executor.
 * Executors may validate/enforce this contract but must not reinterpret objective,
 * copy, budget, authority, or business intention.
 */
export interface ActionIntent {
  readonly kind: 'ACTION_INTENT';
  readonly schemaVersion: ContractVersion;
  readonly actionIntentId: ActionIntentId;
  readonly capability: CapabilityActionReference;
  readonly providerBinding?: ProviderBinding;
  readonly tenantId: TenantId;
  readonly actor: IdentityReference;
  readonly requestOrigin: IdentityReference;
  readonly correlation: CorrelationContext;
  readonly resolvedParameters: JsonObject;
  readonly idempotency: ActionIdempotency;
  readonly preconditions: readonly ActionPrecondition[];
  readonly expectedState?: ExpectedState;
  readonly deadlineAt: string;
  readonly authority: ActionAuthorityReference;
  readonly executionClassification?: ExecutionClassificationReference;
  readonly dataClassification: DataClassification;
  readonly metadata?: RestrictedMetadata;
}
