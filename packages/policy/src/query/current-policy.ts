import type {
  CurrentPolicyLookupRequest,
  CurrentPolicyLookupResult,
  PolicyQueryReason,
} from '@aurora/contracts/policy-query';
import type { PolicySnapshot } from '@aurora/contracts/policy-engine';

import { uniqueSorted } from './internal';

/**
 * Read-only adapter boundary. W02-F owns no persistence or policy registry;
 * callers provide a current-policy source and later waves may bind it to their
 * own durable storage without moving persistence into W02.
 */
export interface CurrentPolicySource {
  getCurrent(policyReference: string): PolicySnapshot | undefined;
}

export function lookupCurrentPolicy(
  request: CurrentPolicyLookupRequest,
  source: CurrentPolicySource,
): CurrentPolicyLookupResult {
  const snapshot = source.getCurrent(request.expectedPolicy.reference);
  if (snapshot === undefined) {
    return {
      kind: 'CurrentPolicyLookupResult',
      schemaVersion: request.schemaVersion,
      expectedPolicy: request.expectedPolicy,
      correlation: request.correlation,
      evaluatedAt: request.evaluatedAt,
      informationalOnly: true,
      authorizesExecution: false,
      requiresExecutionTimeValidation: true,
      found: false,
      reasons: ['POLICY_NOT_FOUND'],
    };
  }

  if (snapshot.policy.reference !== request.expectedPolicy.reference) {
    return {
      kind: 'CurrentPolicyLookupResult',
      schemaVersion: request.schemaVersion,
      expectedPolicy: request.expectedPolicy,
      correlation: request.correlation,
      evaluatedAt: request.evaluatedAt,
      informationalOnly: true,
      authorizesExecution: false,
      requiresExecutionTimeValidation: true,
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
    kind: 'CurrentPolicyLookupResult',
    schemaVersion: request.schemaVersion,
    expectedPolicy: request.expectedPolicy,
    correlation: request.correlation,
    evaluatedAt: request.evaluatedAt,
    informationalOnly: true,
    authorizesExecution: false,
    requiresExecutionTimeValidation: true,
    found: true,
    currentPolicy: snapshot.policy,
    state: snapshot.state,
    snapshot,
    versionChanged,
    reasons,
  };
}
