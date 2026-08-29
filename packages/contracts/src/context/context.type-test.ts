import type {
  CausationId,
  CorrelationId,
  IdentityId,
  ProviderExternalId,
  TenantId,
} from '../ids/types';
import type {
  ActorRef,
  CorrelationContext,
  ExternalIdentityRef,
  PropagationContext,
  TenantContext,
} from './index';

declare const tenantId: TenantId;
declare const identityId: IdentityId;
declare const correlationId: CorrelationId;
declare const causationId: CausationId;
declare const providerExternalId: ProviderExternalId;

const tenant: TenantContext = { tenantId };
const actor: ActorRef = { kind: 'HUMAN', identityId };
const correlation: CorrelationContext = {
  correlationId,
  causation: { causationId },
};
const externalIdentity: ExternalIdentityRef = {
  kind: 'EXTERNAL_IDENTITY',
  provider: 'provider-x',
  externalId: providerExternalId,
};

void tenant;
void actor;
void correlation;
void externalIdentity;

// @ts-expect-error TenantId and IdentityId must remain non-assignable.
const invalidIdentity: IdentityId = tenantId;

// @ts-expect-error IdentityId and TenantId must remain non-assignable.
const invalidTenant: TenantId = identityId;

// @ts-expect-error CorrelationId must not accept a TenantId.
const invalidCorrelation: CorrelationId = tenantId;

// @ts-expect-error Provider/external identifiers cannot replace canonical IdentityId.
const providerActor: ActorRef = { kind: 'HUMAN', identityId: providerExternalId };

const invalidExternalIdentity: ExternalIdentityRef = {
  kind: 'EXTERNAL_IDENTITY',
  provider: 'provider-x',
  // @ts-expect-error Internal IdentityId cannot replace a provider-owned external ID.
  externalId: identityId,
};

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
void invalidExternalIdentity;
void emailActor;
