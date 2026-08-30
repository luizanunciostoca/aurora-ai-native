import type {
  ActorRef,
  CorrelationContext,
  DataClassification,
  Rfc3339Timestamp,
  TenantContext,
} from '../context';
import type { ActionIntentId, DecisionId, PolicyTokenId } from '../ids';
import type { ContractVersion } from '../versioning';
import type {
  ActionIdempotency,
  ActionPrecondition,
  CapabilityActionReference,
  ExecutionClassificationReference,
  ExpectedState,
  JsonObject,
  ProviderBinding,
  RestrictedMetadata,
} from './execution-values';

export type ActionAuthorityReference =
  | Readonly<{ kind: 'POLICY_TOKEN'; policyTokenId: PolicyTokenId }>
  | Readonly<{ kind: 'OWNER_DECISION'; decisionId: DecisionId }>
  | Readonly<{
      kind: 'POLICY_AND_OWNER_DECISION';
      policyTokenId: PolicyTokenId;
      decisionId: DecisionId;
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
  readonly tenant: TenantContext;
  readonly actor: ActorRef;
  readonly requestOrigin: ActorRef;
  readonly correlation: CorrelationContext;
  readonly resolvedParameters: JsonObject;
  readonly idempotency: ActionIdempotency;
  readonly preconditions: readonly ActionPrecondition[];
  readonly expectedState?: ExpectedState;
  readonly deadlineAt: Rfc3339Timestamp;
  readonly authority: ActionAuthorityReference;
  readonly executionClassification?: ExecutionClassificationReference;
  readonly dataClassification: DataClassification;
  readonly metadata?: RestrictedMetadata;
}
