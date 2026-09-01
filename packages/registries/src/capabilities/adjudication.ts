export const SEED_ADJUDICATION_DECISIONS = ['ACCEPT', 'REJECT', 'RENAME', 'DECOMPOSE'] as const;
export type SeedAdjudicationDecision = (typeof SEED_ADJUDICATION_DECISIONS)[number];

export interface CapabilitySeedAdjudication {
  readonly adjudicationId: string;
  readonly seedId: string;
  readonly sourceRef: string;
  readonly decision: SeedAdjudicationDecision;
  readonly resultingCapabilityIds: readonly string[];
  readonly reason: string;
}

export type SeedAdjudicationValidationResult =
  | { readonly status: 'VALID' }
  | {
      readonly status: 'INVALID';
      readonly code:
        | 'EMPTY_ID'
        | 'EMPTY_REASON'
        | 'INVALID_ACCEPT_OUTPUT'
        | 'INVALID_REJECT_OUTPUT'
        | 'INVALID_RENAME_OUTPUT'
        | 'INVALID_DECOMPOSE_OUTPUT'
        | 'DUPLICATE_OUTPUT';
    };

function allDistinct(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export function validateSeedAdjudication(
  adjudication: CapabilitySeedAdjudication,
): SeedAdjudicationValidationResult {
  if (
    adjudication.adjudicationId.trim().length === 0 ||
    adjudication.seedId.trim().length === 0 ||
    adjudication.sourceRef.trim().length === 0
  ) {
    return { status: 'INVALID', code: 'EMPTY_ID' };
  }
  if (adjudication.reason.trim().length === 0) return { status: 'INVALID', code: 'EMPTY_REASON' };
  if (!allDistinct(adjudication.resultingCapabilityIds)) {
    return { status: 'INVALID', code: 'DUPLICATE_OUTPUT' };
  }

  switch (adjudication.decision) {
    case 'ACCEPT':
      return adjudication.resultingCapabilityIds.length === 1 &&
        adjudication.resultingCapabilityIds[0] === adjudication.seedId
        ? { status: 'VALID' }
        : { status: 'INVALID', code: 'INVALID_ACCEPT_OUTPUT' };
    case 'REJECT':
      return adjudication.resultingCapabilityIds.length === 0
        ? { status: 'VALID' }
        : { status: 'INVALID', code: 'INVALID_REJECT_OUTPUT' };
    case 'RENAME':
      return adjudication.resultingCapabilityIds.length === 1 &&
        adjudication.resultingCapabilityIds[0] !== adjudication.seedId
        ? { status: 'VALID' }
        : { status: 'INVALID', code: 'INVALID_RENAME_OUTPUT' };
    case 'DECOMPOSE':
      return adjudication.resultingCapabilityIds.length >= 2
        ? { status: 'VALID' }
        : { status: 'INVALID', code: 'INVALID_DECOMPOSE_OUTPUT' };
  }
}
