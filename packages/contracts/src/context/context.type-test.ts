import type {
  CausationId,
  CorrelationId,
  IdentityId,
  TenantId,
} from '../ids/index.js';
import type {
  ActorRef,
  CorrelationContext,
  PropagationContext,
  TenantContext,
} from './index.js';

declare const tenantId: TenantId;
declare const identityId: IdentityId;
declare const correlationId: CorrelationId;
declare const causationId: CausationId;

const tenant: TenantContext = { tenantId };
const actor: ActorRef = { kind: 'HUMAN', identityId };
const correlation: CorrelationContext = {
  correlationId,
  causation: { causationId },
};

void tenant;
void actor;
void correlation;

// @ts-expect-error TenantId and IdentityId must remain non-assignable.
const invalidIdentity: IdentityId = tenantId;

// @ts-expect-error IdentityId and TenantId must remain non-assignable.
const invalidTenant: TenantId = identityId;

// @ts-expect-error CorrelationId must not accept a TenantId.
const invalidCorrelation: CorrelationId = tenantId;

// @ts-expect-error Provider/external identifiers cannot replace canonical IdentityId.
const providerActor: ActorRef = { kind: 'HUMAN', identityId: 'provider-user-123' };

const emailActor: ActorRef = {
  kind: 'HUMAN',
  identityId,
  // @ts-expect-error Canonical actor references never use email as identity.
  email: 'person@example.invalid',
};

declare const propagation: PropagationContext;
void propagation;
void invalidIdentity;
void invalidTenant;
void invalidCorrelation;
void providerActor;
void emailActor;
