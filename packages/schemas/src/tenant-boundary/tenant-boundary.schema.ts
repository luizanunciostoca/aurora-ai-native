import type {
  IdentityTenantBinding,
  TenantBindingKind,
  TenantBoundaryCheck,
  TenantBoundaryContext,
} from '../../../contracts/src/tenant-boundary/types';
import { ActorRefSchema, ExternalIdentityRefSchema, SubjectRefSchema } from '../context/identity.schema';
import { CorrelationIdSchema, IdentityIdSchema, TenantIdSchema } from '../ids/id.schemas';
import { asRecord, assertExactKeys, createRuntimeSchema } from '../context/internal';

const TENANT_BINDING_KIND_VALUES = ['MEMBER', 'SYSTEM', 'EXTERNAL'] as const satisfies readonly TenantBindingKind[];
const BINDING_KIND_SET = new Set<string>(TENANT_BINDING_KIND_VALUES);

export const TenantBindingKindSchema = createRuntimeSchema<TenantBindingKind>((value: unknown) => {
  if (typeof value !== 'string' || !BINDING_KIND_SET.has(value)) throw new TypeError('TenantBindingKind is invalid');
  return value as TenantBindingKind;
});

export const IdentityTenantBindingSchema = createRuntimeSchema<IdentityTenantBinding>((value: unknown) => {
  const record = asRecord(value, 'IdentityTenantBinding');
  assertExactKeys(record, ['tenantId', 'identityId', 'identityKind', 'bindingKind', 'externalIdentity'], ['tenantId', 'identityId', 'identityKind', 'bindingKind'], 'IdentityTenantBinding');
  const identityKind = ActorRefSchema.parse({ kind: record.identityKind, identityId: record.identityId }).kind;
  return {
    tenantId: TenantIdSchema.parse(record.tenantId),
    identityId: IdentityIdSchema.parse(record.identityId),
    identityKind,
    bindingKind: TenantBindingKindSchema.parse(record.bindingKind),
    ...(record.externalIdentity === undefined ? {} : { externalIdentity: ExternalIdentityRefSchema.parse(record.externalIdentity) }),
  };
});

export const TenantBoundaryContextSchema = createRuntimeSchema<TenantBoundaryContext>((value: unknown) => {
  const record = asRecord(value, 'TenantBoundaryContext');
  assertExactKeys(record, ['tenantId', 'actor', 'subject', 'correlationId'], ['tenantId', 'actor', 'subject', 'correlationId'], 'TenantBoundaryContext');
  return {
    tenantId: TenantIdSchema.parse(record.tenantId),
    actor: ActorRefSchema.parse(record.actor),
    subject: SubjectRefSchema.parse(record.subject),
    correlationId: CorrelationIdSchema.parse(record.correlationId),
  };
});

function parseArray<T>(value: unknown, label: string, parse: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map(parse);
}

export const TenantBoundaryCheckSchema = createRuntimeSchema<TenantBoundaryCheck>((value: unknown) => {
  const record = asRecord(value, 'TenantBoundaryCheck');
  assertExactKeys(record, ['context', 'knownTenantIds', 'bindings'], ['context', 'knownTenantIds', 'bindings'], 'TenantBoundaryCheck');
  return {
    context: TenantBoundaryContextSchema.parse(record.context),
    knownTenantIds: parseArray(record.knownTenantIds, 'knownTenantIds', (item) => TenantIdSchema.parse(item)),
    bindings: parseArray(record.bindings, 'bindings', (item) => IdentityTenantBindingSchema.parse(item)),
  };
});
