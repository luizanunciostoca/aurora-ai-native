import type { AuthorityClass, PolicyToken } from '@aurora/contracts/policy';

import {
  asRecord,
  assertKnownKeys,
  compareRfc3339,
  optionalConstraints,
  optionalNonEmptyString,
  parseJsonObject,
  requireNonEmptyString,
  requirePolicyReference,
  requireScope,
  requireSubject,
} from './validation.js';
import type { PolicySchemaDependencies } from './validation.js';

const AUTHORITY_CLASSES = new Set<AuthorityClass>(['OWNER_DECISION', 'POLICY_RULE']);

const POLICY_TOKEN_KEYS = [
  'kind',
  'schemaVersion',
  'policyTokenId',
  'tenant',
  'subject',
  'action',
  'scope',
  'issuedAt',
  'expiresAt',
  'policy',
  'constraints',
  'authorityClass',
  'correlation',
  'decisionReference',
] as const;

export function createPolicyTokenSchema(dependencies: PolicySchemaDependencies) {
  const parse = (input: unknown): PolicyToken => {
    const value = asRecord(input, 'PolicyToken');
    assertKnownKeys(value, POLICY_TOKEN_KEYS, 'PolicyToken');

    if (value.kind !== 'POLICY_TOKEN') {
      throw new TypeError('PolicyToken.kind must be POLICY_TOKEN');
    }

    const authorityClassValue = requireNonEmptyString(value.authorityClass, 'authorityClass');
    if (!AUTHORITY_CLASSES.has(authorityClassValue as AuthorityClass)) {
      throw new TypeError(`unknown PolicyToken authorityClass: ${authorityClassValue}`);
    }
    const authorityClass = authorityClassValue as AuthorityClass;

    const issuedAt = dependencies.timestamp.parse(value.issuedAt);
    const expiresAt = dependencies.timestamp.parse(value.expiresAt);
    const constraints = optionalConstraints(value.constraints);
    const decisionReference =
      value.decisionReference === undefined
        ? undefined
        : dependencies.decisionId.parse(value.decisionReference);

    if (compareRfc3339(expiresAt, issuedAt) <= 0) {
      throw new TypeError('PolicyToken.expiresAt must be later than issuedAt');
    }

    if (authorityClass === 'OWNER_DECISION' && decisionReference === undefined) {
      throw new TypeError('OWNER_DECISION PolicyToken requires decisionReference');
    }

    return {
      kind: 'POLICY_TOKEN',
      schemaVersion: dependencies.contractVersion.parse(value.schemaVersion),
      policyTokenId: dependencies.policyTokenId.parse(value.policyTokenId),
      tenant: dependencies.tenant.parse(value.tenant),
      subject: requireSubject(value.subject),
      action: requireNonEmptyString(value.action, 'action'),
      scope: requireScope(value.scope),
      issuedAt,
      expiresAt,
      policy: requirePolicyReference(value.policy, dependencies.version),
      ...(constraints === undefined ? {} : { constraints }),
      authorityClass,
      correlation: dependencies.correlation.parse(value.correlation),
      ...(decisionReference === undefined ? {} : { decisionReference }),
    };
  };

  const parseAt = (input: unknown, at: unknown): PolicyToken => {
    const token = parse(input);
    const evaluationAt = dependencies.timestamp.parse(at);
    if (compareRfc3339(token.expiresAt, evaluationAt) <= 0) {
      throw new TypeError('PolicyToken is expired at evaluationAt');
    }

    return token;
  };

  return Object.freeze({
    parse,
    parseAt,
    serialize: (input: unknown) => JSON.stringify(parse(input)),
    deserialize: (serialized: string) =>
      parse(parseJsonObject(serialized, 'PolicyToken serialization')),
  });
}

/** W01-G composes this factory with accepted W01-D/F validators. */
export const PolicyTokenSchema = Object.freeze({ create: createPolicyTokenSchema });
