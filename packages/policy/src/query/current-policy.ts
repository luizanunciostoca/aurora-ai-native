import type { IdentityId, TenantId } from '@aurora/contracts/ids';
import type {
  CurrentPolicyLookupRequest,
  CurrentPolicyLookupResult,
  PolicyQueryReason,
} from '@aurora/contracts/policy-query';
import type { PolicySnapshot } from '@aurora/contracts/policy-engine';

import { uniqueSorted } from './internal';

export interface CurrentPolicySourceRequest {
  readonly policyReference: string;
  readonly tenantId: TenantId;
  readonly actorIdentityId: IdentityId;
}

/**
 * Read-only adapter boundary. W02-F owns no persistence or policy registry;
 * callers provide a tenant-aware current-policy source and later waves may
 * bind it to durable storage without moving persistence into W02.
 */
export interface CurrentPolicySource {
  getCurrent(request: CurrentPolicySourceRequest): PolicySnapshot | undefined;
}

function baseResult(request: CurrentPolicyLookupRequest) {
  return {
    kind: 'CurrentPolicyLookupResult' as const,
    schemaVersion: request.schemaVersion,
    expectedPolicy: request.expectedPolicy,
    correlation: request.correlation,
    evaluatedAt: request.evaluatedAt,
    tenant: request.tenant,
    actor: request.actor,
    informationalOnly: true as const,
    authorizesExecution: false as const,
    requiresExecutionTimeValidation: true as const,
  };
}

export function lookupCurrentPolicy(
  request: CurrentPolicyLookupRequest,
  source: CurrentPolicySource,
): CurrentPolicyLookupResult {
  const snapshot = source.getCurrent({
    policyReference: request.expectedPolicy.reference,
    tenantId: request.tenant.tenantId,
    actorIdentityId: request.actor.identityId,
  });

  if (snapshot === undefined) {
    return {
      ...baseResult(request),
      found: false,
      reasons: ['POLICY_NOT_FOUND'],
    };
  }

  if (snapshot.policy.reference !== request.expectedPolicy.reference) {
    return {
      ...baseResult(request),
      found: false,
      reasons: ['POLICY_REFERENCE_MISMATCH'],
    };
  }

  const versionChanged = snapshot.policy.version !== request.expectedPolicy.version;
  const reasons = uniqueSorted<PolicyQueryReason>([
    'POLICY_FOUND',
    ...(versionChanged ? (['POLICY_VERSION_CHANGED'] as const) : []),
  ]);

  return {
    ...baseResult(request),
    found: true,
    currentPolicy: snapshot.policy,
    state: snapshot.state,
    snapshot,
    versionChanged,
    reasons,
  };
}
