import type { ContractVersion } from '../versioning/index.js';
import type { CorrelationContext } from './correlation.js';
import type { DataClassification } from './data-classification.js';
import type { Deadline, Expiry } from './deadline.js';
import type { ActorRef } from './identity.js';
import type { TenantContext } from './tenant.js';

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
