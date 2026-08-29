import type { ContractVersion } from '../versioning/types';
import type { CorrelationContext } from './correlation';
import type { DataClassification } from './data-classification';
import type { Deadline, Expiry } from './deadline';
import type { ActorRef } from './identity';
import type { TenantContext } from './tenant';

export interface PropagationMetadata {
  readonly dataClassification: DataClassification;
  readonly deadline?: Deadline;
  readonly expiry?: Expiry;
}

export interface PropagationContext {
  readonly kind: 'PROPAGATION_CONTEXT';
  readonly schemaVersion: ContractVersion;
  readonly tenant: TenantContext;
  readonly actor: ActorRef;
  readonly correlation: CorrelationContext;
  readonly metadata: PropagationMetadata;
}
