import type { Version } from '../versioning/types';

export const OWNER_DECISION_STATES = ['APPROVED', 'DENIED', 'REVOKED', 'EXPIRED'] as const;

export type OwnerDecisionState = (typeof OWNER_DECISION_STATES)[number];

export const AUTHORITY_CLASSES = ['OWNER_DECISION', 'POLICY_RULE'] as const;

export type AuthorityClass = (typeof AUTHORITY_CLASSES)[number];

/**
 * Opaque reference to the thing authority is being decided for.
 * W01-C deliberately does not interpret or resolve the referenced domain object.
 */
export interface AuthoritySubjectReference {
  readonly reference: string;
}

/**
 * Explicit, non-empty governed scope identifiers. W01-C carries them but does
 * not evaluate them; evaluation belongs to the future Policy Engine.
 */
export type AuthorityScope = readonly string[];

export type AuthorityConstraintValue =
  | string
  | number
  | boolean
  | null
  | readonly AuthorityConstraintValue[]
  | { readonly [key: string]: AuthorityConstraintValue };

export type AuthorityConstraints = Readonly<Record<string, AuthorityConstraintValue>>;

export interface PolicyReference {
  readonly reference: string;
  readonly version: Version;
}
