import type { ActorRef, ExternalIdentityRef, IdentityKind, SubjectRef } from '@aurora/contracts/context';
import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';
import {
  ActorRefSchema,
  ExternalIdentityRefSchema,
  SubjectRefSchema,
} from '../context/identity.schema';
import { asRecord, assertExactKeys, createRuntimeSchema } from '../context/internal';
import { CorrelationIdSchema, IdentityIdSchema, TenantIdSchema } from '../ids/id.schemas';

type BindingKindWire = 'MEMBER' | 'SYSTEM' | 'EXTERNAL';

interface BindingWire {
  readonly tenantId: TenantId;
  readonly identityId: IdentityId;
  readonly identityKind: IdentityKind;
  readonly bindingKind: BindingKindWire;
  readonly externalIdentity?: ExternalIdentityRef;
}

interface BoundaryContextWire {
  readonly tenantId: TenantId;
  readonly actor: ActorRef;
  readonly subject: SubjectRef;
  readonly correlationId: CorrelationId;
}

interface BoundaryCheckWire {
  readonly context: BoundaryContextWire;
  readonly knownTenantIds: readonly TenantId[];
  readonly bindings: readonly BindingWire[];
}

const TENANT_BINDING_KIND_VALUES = ['MEMBER', 'SYSTEM', 'EXTERNAL'] as const;
const BINDING_KIND_SET = new Set<string>(TENANT_BINDING_KIND_VALUES);

export const TenantBindingKindSchema = createRuntimeSchema<BindingKindWire>((value: unknown) => {
  if (typeof value !== 'string' || !BINDING_KIND_SET.has(value)) {
    throw new TypeError('TenantBindingKind is invalid');
  }
  return value as BindingKindWire;
});

export const IdentityTenantBindingSchema = createRuntimeSchema<BindingWire>((value: unknown) => {
  const record = asRecord(value, 'IdentityTenantBinding');
  assertExactKeys(
    record,
    ['tenantId', 'identityId', 'identityKind', 'bindingKind', 'externalIdentity'],
    ['tenantId', 'identityId', 'identityKind', 'bindingKind'],
    'IdentityTenantBinding',
  );
  const identityKind = ActorRefSchema.parse({
    kind: record.identityKind,
    identityId: record.identityId,
  }).kind;
  return {
    tenantId: TenantIdSchema.parse(record.tenantId),
    identityId: IdentityIdSchema.parse(record.identityId),
    identityKind,
    bindingKind: TenantBindingKindSchema.parse(record.bindingKind),
    ...(record.externalIdentity === undefined
      ? {}
      : { externalIdentity: ExternalIdentityRefSchema.parse(record.externalIdentity) }),
  };
});

export const TenantBoundaryContextSchema = createRuntimeSchema<BoundaryContextWire>(
  (value: unknown) => {
    const record = asRecord(value, 'TenantBoundaryContext');
    assertExactKeys(
      record,
      ['tenantId', 'actor', 'subject', 'correlationId'],
      ['tenantId', 'actor', 'subject', 'correlationId'],
      'TenantBoundaryContext',
    );
    return {
      tenantId: TenantIdSchema.parse(record.tenantId),
      actor: ActorRefSchema.parse(record.actor),
      subject: SubjectRefSchema.parse(record.subject),
      correlationId: CorrelationIdSchema.parse(record.correlationId),
    };
  },
);

function parseArray<T>(
  value: unknown,
  label: string,
  parse: (item: unknown) => T,
): readonly T[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map(parse);
}

export const TenantBoundaryCheckSchema = createRuntimeSchema<BoundaryCheckWire>((value: unknown) => {
  const record = asRecord(value, 'TenantBoundaryCheck');
  assertExactKeys(
    record,
    ['context', 'knownTenantIds', 'bindings'],
    ['context', 'knownTenantIds', 'bindings'],
    'TenantBoundaryCheck',
  );
  return {
    context: TenantBoundaryContextSchema.parse(record.context),
    knownTenantIds: parseArray(record.knownTenantIds, 'knownTenantIds', (item) =>
      TenantIdSchema.parse(item),
    ),
    bindings: parseArray(record.bindings, 'bindings', (item) =>
      IdentityTenantBindingSchema.parse(item),
    ),
  };
});
