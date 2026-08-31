import type { SubjectRef } from '@aurora/contracts/context';
import type { IdentityId, ProviderExternalId } from '@aurora/contracts/ids';
import type { AuthoritySubjectReference } from '@aurora/contracts/policy';

import { toAuthoritySubjectReference } from '../index';
import { nonEmptyString } from './internal';

function parseAuthorityReference(reference: string): SubjectRef | undefined {
  if (reference.startsWith('identity:')) {
    const identityId = reference.slice('identity:'.length);
    if (!nonEmptyString(identityId)) return undefined;
    return { kind: 'IDENTITY', identityId: identityId as IdentityId };
  }
  if (!reference.startsWith('external:')) return undefined;
  const remainder = reference.slice('external:'.length);
  const separator = remainder.indexOf(':');
  if (separator <= 0 || separator === remainder.length - 1) return undefined;
  const provider = remainder.slice(0, separator);
  const externalId = remainder.slice(separator + 1);
  if (!nonEmptyString(provider) || !nonEmptyString(externalId)) return undefined;
  return {
    kind: 'EXTERNAL_IDENTITY',
    externalIdentity: {
      kind: 'EXTERNAL_IDENTITY',
      provider,
      externalId: externalId as ProviderExternalId,
    },
  };
}

/** Explicit W01 SubjectRef -> AuthoritySubjectReference bridge. */
export function subjectRefToAuthoritySubjectReference(
  subject: SubjectRef,
): AuthoritySubjectReference {
  return { reference: toAuthoritySubjectReference(subject) };
}

/** Explicit inverse bridge. Malformed/ambiguous authority references fail closed. */
export function authoritySubjectReferenceToSubjectRef(
  subject: AuthoritySubjectReference,
): SubjectRef | undefined {
  return parseAuthorityReference(subject.reference);
}
