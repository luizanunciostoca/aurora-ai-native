import type { OwnerDecision, OwnerDecisionState } from '@aurora/contracts/policy';

import {
  asRecord,
  assertKnownKeys,
  compareRfc3339,
  optionalConstraints,
  optionalNonEmptyString,
  parseJsonObject,
  requireNonEmptyString,
  requireScope,
  requireSubject,
} from './validation.js';
import type { PolicySchemaDependencies } from './validation.js';

const OWNER_DECISION_STATES = new Set<OwnerDecisionState>([
  'APPROVED',
  'DENIED',
  'REVOKED',
  'EXPIRED',
]);

const OWNER_DECISION_KEYS = [
  'kind',
  'schemaVersion',
  'decisionId',
  'subject',
  'decision',
  'actor',
  'tenant',
  'decidedAt',
  'scope',
  'constraints',
  'expiresAt',
  'correlation',
  'reason',
  'reasonReference',
  'authenticationReference',
] as const;

export function createOwnerDecisionSchema(dependencies: PolicySchemaDependencies) {
  const parse = (input: unknown): OwnerDecision => {
    const value = asRecord(input, 'OwnerDecision');
    assertKnownKeys(value, OWNER_DECISION_KEYS, 'OwnerDecision');

    if (value.kind !== 'OWNER_DECISION') {
      throw new TypeError('OwnerDecision.kind must be OWNER_DECISION');
    }

    const decisionValue = requireNonEmptyString(value.decision, 'decision');
    if (!OWNER_DECISION_STATES.has(decisionValue as OwnerDecisionState)) {
      throw new TypeError(`unknown OwnerDecision decision: ${decisionValue}`);
    }
    const decision = decisionValue as OwnerDecisionState;

    const decidedAt = dependencies.timestamp.parse(value.decidedAt);
    const expiresAt =
      value.expiresAt === undefined ? undefined : dependencies.timestamp.parse(value.expiresAt);
    const constraints = optionalConstraints(value.constraints);
    const reason = optionalNonEmptyString(value.reason, 'reason');
    const reasonReference = optionalNonEmptyString(value.reasonReference, 'reasonReference');
    const authenticationReference = optionalNonEmptyString(
      value.authenticationReference,
      'authenticationReference',
    );

    if (
      decision === 'APPROVED' &&
      expiresAt !== undefined &&
      compareRfc3339(expiresAt, decidedAt) <= 0
    ) {
      throw new TypeError('APPROVED OwnerDecision expiresAt must be later than decidedAt');
    }

    if (decision === 'EXPIRED') {
      if (expiresAt === undefined) {
        throw new TypeError('EXPIRED OwnerDecision requires expiresAt');
      }
      if (compareRfc3339(expiresAt, decidedAt) > 0) {
        throw new TypeError('EXPIRED OwnerDecision expiresAt must not be later than decidedAt');
      }
    }

    return {
      kind: 'OWNER_DECISION',
      schemaVersion: dependencies.contractVersion.parse(value.schemaVersion),
      decisionId: dependencies.decisionId.parse(value.decisionId),
      subject: requireSubject(value.subject),
      decision,
      actor: dependencies.actor.parse(value.actor),
      tenant: dependencies.tenant.parse(value.tenant),
      decidedAt,
      scope: requireScope(value.scope),
      ...(constraints === undefined ? {} : { constraints }),
      ...(expiresAt === undefined ? {} : { expiresAt }),
      correlation: dependencies.correlation.parse(value.correlation),
      ...(reason === undefined ? {} : { reason }),
      ...(reasonReference === undefined ? {} : { reasonReference }),
      ...(authenticationReference === undefined ? {} : { authenticationReference }),
    };
  };

  return Object.freeze({
    parse,
    serialize: (input: unknown) => JSON.stringify(parse(input)),
    deserialize: (serialized: string) =>
      parse(parseJsonObject(serialized, 'OwnerDecision serialization')),
  });
}

/** W01-G composes this factory with accepted W01-D/F validators. */
export const OwnerDecisionSchema = Object.freeze({ create: createOwnerDecisionSchema });
