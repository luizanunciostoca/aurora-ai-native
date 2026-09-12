import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { AuthorityEvaluationRequest } from '@aurora/contracts/policy-validation';

import type { CurrentAuthorityValidator } from '../sdk/types.js';
import type {
  ResolveVoiceEvaluationInput,
  ResolvedVoiceAuthorityEvaluation,
  VoiceAuthorityEvaluationResolver,
} from './types.js';

const MAX_SERVER_TIME_MS = 8_640_000_000_000_000;

export interface TrustedVoiceAuthorityLookup {
  readonly commandId: string;
  readonly capabilityId: string;
  readonly evaluatedAt: Rfc3339Timestamp;
}

/**
 * Server-owned material only. The source must resolve this from canonical command/capability and
 * W02 inputs; Android voice data cannot construct or override any field in this object.
 */
export interface TrustedVoiceAuthorityMaterial {
  readonly commandId: string;
  readonly capabilityId: string;
  readonly actionIntent: ActionIntent;
  readonly authorityEvaluation: AuthorityEvaluationRequest;
  readonly authorizesExecution: false;
}

export interface TrustedVoiceAuthorityMaterialSource {
  resolve(lookup: TrustedVoiceAuthorityLookup): TrustedVoiceAuthorityMaterial | null;
}

export interface TrustedServerVoiceAuthorityResolverConfig {
  readonly source: TrustedVoiceAuthorityMaterialSource;
  readonly validateCurrentAuthority: CurrentAuthorityValidator;
  readonly clock?: () => number;
}

function currentTimestamp(clock: () => number): Rfc3339Timestamp | null {
  let now: number;
  try {
    now = clock();
  } catch {
    return null;
  }
  if (!Number.isSafeInteger(now) || now < 0 || now > MAX_SERVER_TIME_MS) return null;
  const timestamp = new Date(now);
  if (Number.isNaN(timestamp.valueOf())) return null;
  return timestamp.toISOString() as Rfc3339Timestamp;
}

function materialMatchesCandidate(
  material: TrustedVoiceAuthorityMaterial,
  input: ResolveVoiceEvaluationInput,
  evaluatedAt: Rfc3339Timestamp,
): boolean {
  const { candidate, context } = input;
  const intent = material.actionIntent;
  const evaluation = material.authorityEvaluation;
  const policy = evaluation.policyEvaluation;
  const target = intent.executionTarget;

  return (
    material.authorizesExecution === false &&
    material.commandId === candidate.commandId &&
    material.capabilityId === candidate.capabilityId &&
    intent.kind === 'ACTION_INTENT' &&
    intent.capability.capability === candidate.capabilityId &&
    intent.capability.actionType === policy.action &&
    intent.tenant.tenantId === context.tenantId &&
    intent.actor.identityId === context.actorIdentityId &&
    intent.requestOrigin.identityId === context.actorIdentityId &&
    intent.correlation.correlationId === context.correlationId &&
    target?.kind === 'DEVICE' &&
    target.bindingReference === context.deviceId &&
    evaluation.kind === 'AuthorityEvaluationRequest' &&
    policy.tenant.tenantId === context.tenantId &&
    policy.actor.identityId === context.actorIdentityId &&
    policy.correlation.correlationId === context.correlationId &&
    policy.evaluatedAt === evaluatedAt
  );
}

/**
 * Concrete W07 voice resolver for controlled server composition.
 *
 * The untrusted voice candidate selects only a command/capability lookup key. The source never
 * receives transcript, tenant, actor, device trust or other W14 context, so it cannot turn those
 * client-derived values into authority. The authenticated W14 context is used only to reject a
 * server material mismatch. Current authority validation is injected separately by the W02 owner
 * and cannot be supplied by the material source.
 */
export class TrustedServerVoiceAuthorityResolver implements VoiceAuthorityEvaluationResolver {
  readonly #source: TrustedVoiceAuthorityMaterialSource;
  readonly #validateCurrentAuthority: CurrentAuthorityValidator;
  readonly #clock: () => number;

  constructor(config: TrustedServerVoiceAuthorityResolverConfig) {
    this.#source = config.source;
    this.#validateCurrentAuthority = config.validateCurrentAuthority;
    this.#clock = config.clock ?? Date.now;
  }

  resolve(input: ResolveVoiceEvaluationInput): ResolvedVoiceAuthorityEvaluation | null {
    const evaluatedAt = currentTimestamp(this.#clock);
    if (evaluatedAt === null) return null;

    let material: TrustedVoiceAuthorityMaterial | null;
    try {
      material = this.#source.resolve({
        commandId: input.candidate.commandId,
        capabilityId: input.candidate.capabilityId,
        evaluatedAt,
      });
    } catch {
      return null;
    }
    if (material === null || !materialMatchesCandidate(material, input, evaluatedAt)) return null;

    return {
      actionIntent: material.actionIntent,
      authorityEvaluation: material.authorityEvaluation,
      validateCurrentAuthority: this.#validateCurrentAuthority,
    };
  }
}
