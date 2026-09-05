import type { ActionIntent } from '@aurora/contracts/actions';
import type { IdentityId, TenantId } from '@aurora/contracts/ids';
import type { PolicyEvaluationRequest, PolicySnapshot } from '@aurora/contracts/policy-engine';
import type { AuthorityEvaluationRequest } from '@aurora/contracts/policy-validation';

import type {
  TrustedVoiceAuthorityLookup,
  TrustedVoiceAuthorityMaterial,
  TrustedVoiceAuthorityMaterialSource,
} from './trusted-resolver.js';

const MAX_ENTRIES = 256;
const MAX_KEY_LENGTH = 256;
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

export interface TrustedCurrentPolicySourceRequest {
  readonly policyReference: string;
  readonly tenantId: TenantId;
  readonly actorIdentityId: IdentityId;
}

/** Structural boundary compatible with the accepted W02 current-policy source. */
export interface TrustedCurrentPolicySnapshotSource {
  getCurrent(request: TrustedCurrentPolicySourceRequest): PolicySnapshot | undefined;
}

export type PreissuedPolicyEvaluationSeed = Omit<
  PolicyEvaluationRequest,
  'policy' | 'snapshot' | 'evaluatedAt'
>;

export interface PreissuedVoiceAuthorityEntry {
  readonly commandId: string;
  readonly capabilityId: string;
  readonly actionIntent: ActionIntent;
  /** Reference family to resolve at execution time; version always comes from current policy. */
  readonly expectedPolicyReference: string;
  /**
   * Already-issued W02/W01 inputs. PolicyToken/OwnerDecision, when present, are consumed here but
   * never issued, refreshed, approved or widened by this source.
   */
  readonly policyEvaluation: PreissuedPolicyEvaluationSeed;
  readonly operationConstraints?: AuthorityEvaluationRequest['operationConstraints'];
  readonly revokedPolicyTokenIds?: AuthorityEvaluationRequest['revokedPolicyTokenIds'];
  readonly requireCorrelationMatch?: AuthorityEvaluationRequest['requireCorrelationMatch'];
  readonly authorizesExecution: false;
}

function boundedKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_KEY_LENGTH &&
    value === value.trim()
  );
}

function validTimestamp(value: string): boolean {
  return RFC3339_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

function entryKey(commandId: string, capabilityId: string): string {
  return `${commandId}\u0000${capabilityId}`;
}

function validEntryBindings(entry: PreissuedVoiceAuthorityEntry): boolean {
  const intent = entry.actionIntent;
  const policy = entry.policyEvaluation;
  return (
    entry.authorizesExecution === false &&
    boundedKey(entry.commandId) &&
    boundedKey(entry.capabilityId) &&
    boundedKey(entry.expectedPolicyReference) &&
    intent.kind === 'ACTION_INTENT' &&
    intent.capability.capability === entry.capabilityId &&
    intent.capability.actionType === policy.action &&
    intent.schemaVersion === policy.schemaVersion &&
    intent.tenant.tenantId === policy.tenant.tenantId &&
    intent.actor.identityId === policy.actor.identityId &&
    intent.correlation.correlationId === policy.correlation.correlationId &&
    (policy.policyToken === undefined ||
      policy.policyToken.policy.reference === entry.expectedPolicyReference)
  );
}

/**
 * Bounded LOCAL composition source over pre-issued authority material and current W02 policy truth.
 *
 * It has no issuance/approval API. On every lookup it asks the injected current-policy owner for a
 * fresh snapshot and uses the resolver-supplied server timestamp. A stale pre-issued token remains
 * stale and will be denied by the separately injected canonical current-authority validator.
 */
export class PreissuedCurrentPolicyVoiceAuthoritySource
  implements TrustedVoiceAuthorityMaterialSource
{
  readonly #entries: ReadonlyMap<string, PreissuedVoiceAuthorityEntry>;
  readonly #currentPolicy: TrustedCurrentPolicySnapshotSource;

  constructor(
    entries: readonly PreissuedVoiceAuthorityEntry[],
    currentPolicy: TrustedCurrentPolicySnapshotSource,
  ) {
    if (entries.length === 0 || entries.length > MAX_ENTRIES) {
      throw new Error('Preissued voice authority entry count is invalid.');
    }
    const map = new Map<string, PreissuedVoiceAuthorityEntry>();
    for (const entry of entries) {
      if (!validEntryBindings(entry)) {
        throw new Error('Preissued voice authority entry bindings are invalid.');
      }
      const key = entryKey(entry.commandId, entry.capabilityId);
      if (map.has(key)) throw new Error('Duplicate preissued voice authority entry.');
      map.set(key, entry);
    }
    this.#entries = map;
    this.#currentPolicy = currentPolicy;
  }

  resolve(lookup: TrustedVoiceAuthorityLookup): TrustedVoiceAuthorityMaterial | null {
    if (
      !boundedKey(lookup.commandId) ||
      !boundedKey(lookup.capabilityId) ||
      !validTimestamp(lookup.evaluatedAt)
    ) {
      return null;
    }
    const entry = this.#entries.get(entryKey(lookup.commandId, lookup.capabilityId));
    if (entry === undefined) return null;

    let snapshot: PolicySnapshot | undefined;
    try {
      snapshot = this.#currentPolicy.getCurrent({
        policyReference: entry.expectedPolicyReference,
        tenantId: entry.policyEvaluation.tenant.tenantId,
        actorIdentityId: entry.policyEvaluation.actor.identityId,
      });
    } catch {
      return null;
    }
    if (
      snapshot === undefined ||
      snapshot.kind !== 'PolicySnapshot' ||
      snapshot.policy.reference !== entry.expectedPolicyReference ||
      (snapshot.state !== 'ACTIVE' && snapshot.state !== 'UNKNOWN')
    ) {
      return null;
    }

    const policyEvaluation: PolicyEvaluationRequest = {
      ...entry.policyEvaluation,
      policy: snapshot.policy,
      snapshot,
      evaluatedAt: lookup.evaluatedAt,
    };
    const authorityEvaluation: AuthorityEvaluationRequest = {
      kind: 'AuthorityEvaluationRequest',
      policyEvaluation,
      ...(entry.operationConstraints === undefined
        ? {}
        : { operationConstraints: entry.operationConstraints }),
      ...(entry.revokedPolicyTokenIds === undefined
        ? {}
        : { revokedPolicyTokenIds: entry.revokedPolicyTokenIds }),
      ...(entry.requireCorrelationMatch === undefined
        ? {}
        : { requireCorrelationMatch: entry.requireCorrelationMatch }),
    };

    return {
      commandId: entry.commandId,
      capabilityId: entry.capabilityId,
      actionIntent: entry.actionIntent,
      authorityEvaluation,
      authorizesExecution: false,
    };
  }
}
