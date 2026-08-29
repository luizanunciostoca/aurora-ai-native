import {
  IDENTITY_KINDS,
  type ActorRef,
  type ExternalIdentityRef,
  type IdentityKind,
  type SubjectRef,
} from '../../../contracts/src/context/identity.js';
import { IdentityIdSchema } from '../ids/index.js';
import {
  asRecord,
  assertExactKeys,
  createRuntimeSchema,
  parseNonEmptyString,
} from './internal.js';

const IDENTITY_KIND_SET = new Set<string>(IDENTITY_KINDS);

export const IdentityKindSchema = createRuntimeSchema<IdentityKind>(
  (value: unknown) => {
    if (typeof value !== 'string' || !IDENTITY_KIND_SET.has(value)) {
      throw new TypeError('IdentityKind is invalid');
    }
    return value as IdentityKind;
  },
);

export const ExternalIdentityRefSchema =
  createRuntimeSchema<ExternalIdentityRef>((value: unknown) => {
    const record = asRecord(value, 'ExternalIdentityRef');
    assertExactKeys(
      record,
      ['kind', 'provider', 'externalId'],
      ['kind', 'provider', 'externalId'],
      'ExternalIdentityRef',
    );

    if (record.kind !== 'EXTERNAL_IDENTITY') {
      throw new TypeError('ExternalIdentityRef.kind is invalid');
    }

    return {
      kind: 'EXTERNAL_IDENTITY',
      provider: parseNonEmptyString(record.provider, 'ExternalIdentityRef.provider'),
      externalId: parseNonEmptyString(
        record.externalId,
        'ExternalIdentityRef.externalId',
      ),
    };
  });

export const ActorRefSchema = createRuntimeSchema<ActorRef>((value: unknown) => {
  const record = asRecord(value, 'ActorRef');
  assertExactKeys(
    record,
    ['kind', 'identityId', 'externalIdentity'],
    ['kind', 'identityId'],
    'ActorRef',
  );

  return {
    kind: IdentityKindSchema.parse(record.kind),
    identityId: IdentityIdSchema.parse(record.identityId),
    ...(record.externalIdentity === undefined
      ? {}
      : {
          externalIdentity: ExternalIdentityRefSchema.parse(
            record.externalIdentity,
          ),
        }),
  } as ActorRef;
});

export const SubjectRefSchema = createRuntimeSchema<SubjectRef>((value: unknown) => {
  const record = asRecord(value, 'SubjectRef');

  if (record.kind === 'IDENTITY') {
    assertExactKeys(record, ['kind', 'identityId'], ['kind', 'identityId'], 'SubjectRef');
    return {
      kind: 'IDENTITY',
      identityId: IdentityIdSchema.parse(record.identityId),
    };
  }

  if (record.kind === 'EXTERNAL_IDENTITY') {
    assertExactKeys(
      record,
      ['kind', 'externalIdentity'],
      ['kind', 'externalIdentity'],
      'SubjectRef',
    );
    return {
      kind: 'EXTERNAL_IDENTITY',
      externalIdentity: ExternalIdentityRefSchema.parse(record.externalIdentity),
    };
  }

  throw new TypeError('SubjectRef.kind is invalid');
});
