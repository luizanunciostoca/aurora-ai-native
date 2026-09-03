import type { TenantId } from '@aurora/contracts';

export const GOOGLE_ADS_KEYWORD_MATCH_TYPES = ['BROAD', 'PHRASE', 'EXACT'] as const;
export type GoogleAdsKeywordMatchType = (typeof GOOGLE_ADS_KEYWORD_MATCH_TYPES)[number];

export const GOOGLE_ADS_SEARCH_BIDDING_STRATEGIES = [
  'MANUAL_CPC',
  'MAXIMIZE_CLICKS',
  'MAXIMIZE_CONVERSIONS',
  'TARGET_CPA',
  'TARGET_ROAS',
] as const;
export type GoogleAdsSearchBiddingStrategy = (typeof GOOGLE_ADS_SEARCH_BIDDING_STRATEGIES)[number];

export interface GoogleAdsVerifiedSearchContextProjection {
  readonly source: 'W08_VERIFIED_GOOGLE_ADS_CONTEXT';
  readonly tenantId: TenantId;
  readonly providerBindingReference: string;
  readonly customerId: string;
  readonly verifiedAtMs: number;
  readonly authorizesExecution: false;
}

export interface GoogleAdsKeywordCandidate {
  readonly text: string;
  readonly matchType: GoogleAdsKeywordMatchType;
  readonly negative: boolean;
  /** Recommendation only; never an approved spend/bid mutation. */
  readonly suggestedBidMicros?: number;
  readonly evidenceReferences: readonly string[];
}

export interface GoogleAdsConversionFact {
  readonly resourceName: string;
  readonly status: 'ENABLED' | 'DISABLED' | 'UNKNOWN';
  readonly primaryForGoals: boolean;
  readonly observedAtMs: number;
  readonly evidenceReference: string;
}

export interface GoogleAdsSearchPlanningInput {
  readonly tenantId: TenantId;
  readonly providerBindingReference: string;
  readonly customerId: string;
  readonly nowMs: number;
  readonly maxContextAgeMs: number;
  readonly verifiedContext: GoogleAdsVerifiedSearchContextProjection;
  readonly objective: 'TRAFFIC' | 'CONVERSIONS' | 'CONVERSION_VALUE';
  readonly biddingStrategy: GoogleAdsSearchBiddingStrategy;
  readonly targetCpaMicros?: number;
  readonly targetRoasBasisPoints?: number;
  readonly keywords: readonly GoogleAdsKeywordCandidate[];
  readonly conversions: readonly GoogleAdsConversionFact[];
}

export interface GoogleAdsNormalizedKeywordPlan {
  readonly text: string;
  readonly matchType: GoogleAdsKeywordMatchType;
  readonly negative: boolean;
  readonly suggestedBidMicros?: number;
  readonly evidenceReferences: readonly string[];
}

export interface GoogleAdsSearchPlan {
  readonly planKind: 'W13_GOOGLE_ADS_SEARCH_PLAN';
  readonly tenantId: TenantId;
  readonly providerBindingReference: string;
  readonly customerId: string;
  readonly objective: GoogleAdsSearchPlanningInput['objective'];
  readonly biddingStrategy: GoogleAdsSearchBiddingStrategy;
  readonly targetCpaMicros?: number;
  readonly targetRoasBasisPoints?: number;
  readonly keywords: readonly GoogleAdsNormalizedKeywordPlan[];
  readonly conversionResourceNames: readonly string[];
  readonly reasoningMode: 'DETERMINISTIC';
  readonly requiresFinancialApproval: boolean;
  readonly financialRecommendationsAreNonAuthoritative: true;
  readonly requiresW07ExecutionForMutation: true;
  readonly requiresW08GoogleAdsBinding: true;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export type GoogleAdsSearchPlanBlockCode =
  | 'INVALID_CONTEXT'
  | 'CONTEXT_SCOPE_MISMATCH'
  | 'CONTEXT_STALE'
  | 'INVALID_KEYWORD'
  | 'DUPLICATE_KEYWORD'
  | 'POSITIVE_NEGATIVE_CONFLICT'
  | 'NO_POSITIVE_KEYWORDS'
  | 'INVALID_BID_RECOMMENDATION'
  | 'INVALID_TARGET'
  | 'BIDDING_OBJECTIVE_MISMATCH'
  | 'CONVERSION_REQUIRED'
  | 'CONVERSION_NOT_READY'
  | 'CONVERSION_STALE';

export type GoogleAdsSearchPlanResult =
  | Readonly<{ status: 'READY'; plan: GoogleAdsSearchPlan }>
  | Readonly<{ status: 'BLOCKED'; code: GoogleAdsSearchPlanBlockCode }>;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function validMicros(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function normalizedText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function conversionBidding(strategy: GoogleAdsSearchBiddingStrategy): boolean {
  return (
    strategy === 'MAXIMIZE_CONVERSIONS' || strategy === 'TARGET_CPA' || strategy === 'TARGET_ROAS'
  );
}

function objectiveCompatible(
  objective: GoogleAdsSearchPlanningInput['objective'],
  strategy: GoogleAdsSearchBiddingStrategy,
): boolean {
  if (strategy === 'TARGET_ROAS') return objective === 'CONVERSION_VALUE';
  if (strategy === 'TARGET_CPA' || strategy === 'MAXIMIZE_CONVERSIONS') {
    return objective === 'CONVERSIONS' || objective === 'CONVERSION_VALUE';
  }
  return true;
}

function validateTarget(input: GoogleAdsSearchPlanningInput): boolean {
  if (input.biddingStrategy === 'TARGET_CPA') {
    return (
      input.targetCpaMicros !== undefined &&
      validMicros(input.targetCpaMicros) &&
      input.targetCpaMicros > 0 &&
      input.targetRoasBasisPoints === undefined
    );
  }
  if (input.targetCpaMicros !== undefined) return false;

  if (input.biddingStrategy === 'TARGET_ROAS') {
    return (
      input.targetRoasBasisPoints !== undefined &&
      Number.isSafeInteger(input.targetRoasBasisPoints) &&
      input.targetRoasBasisPoints > 0 &&
      input.targetRoasBasisPoints <= 1_000_000
    );
  }
  return input.targetRoasBasisPoints === undefined;
}

export function planGoogleAdsSearch(
  input: GoogleAdsSearchPlanningInput,
): GoogleAdsSearchPlanResult {
  if (
    !nonEmpty(input.providerBindingReference) ||
    !nonEmpty(input.customerId) ||
    !Number.isSafeInteger(input.nowMs) ||
    !Number.isSafeInteger(input.maxContextAgeMs) ||
    input.nowMs < 0 ||
    input.maxContextAgeMs < 0 ||
    !Number.isSafeInteger(input.verifiedContext.verifiedAtMs) ||
    input.verifiedContext.verifiedAtMs < 0 ||
    input.verifiedContext.verifiedAtMs > input.nowMs
  ) {
    return { status: 'BLOCKED', code: 'INVALID_CONTEXT' };
  }
  if (
    input.verifiedContext.tenantId !== input.tenantId ||
    input.verifiedContext.providerBindingReference !== input.providerBindingReference ||
    input.verifiedContext.customerId !== input.customerId
  ) {
    return { status: 'BLOCKED', code: 'CONTEXT_SCOPE_MISMATCH' };
  }
  if (input.nowMs - input.verifiedContext.verifiedAtMs > input.maxContextAgeMs) {
    return { status: 'BLOCKED', code: 'CONTEXT_STALE' };
  }
  if (!objectiveCompatible(input.objective, input.biddingStrategy)) {
    return { status: 'BLOCKED', code: 'BIDDING_OBJECTIVE_MISMATCH' };
  }
  if (!validateTarget(input)) return { status: 'BLOCKED', code: 'INVALID_TARGET' };
  if (input.keywords.length === 0 || input.keywords.length > 10_000) {
    return { status: 'BLOCKED', code: 'INVALID_KEYWORD' };
  }

  const normalized: GoogleAdsNormalizedKeywordPlan[] = [];
  const exactKeys = new Set<string>();
  const polarityByText = new Map<string, boolean>();
  let positiveCount = 0;
  let hasFinancialRecommendation =
    input.targetCpaMicros !== undefined || input.targetRoasBasisPoints !== undefined;

  for (const keyword of input.keywords) {
    const text = normalizedText(keyword.text);
    if (!text || text.length > 80 || keyword.evidenceReferences.length === 0) {
      return { status: 'BLOCKED', code: 'INVALID_KEYWORD' };
    }
    if (keyword.evidenceReferences.some((reference) => !nonEmpty(reference))) {
      return { status: 'BLOCKED', code: 'INVALID_KEYWORD' };
    }
    if (keyword.negative && keyword.suggestedBidMicros !== undefined) {
      return { status: 'BLOCKED', code: 'INVALID_BID_RECOMMENDATION' };
    }
    if (keyword.suggestedBidMicros !== undefined) {
      if (!validMicros(keyword.suggestedBidMicros)) {
        return { status: 'BLOCKED', code: 'INVALID_BID_RECOMMENDATION' };
      }
      hasFinancialRecommendation = true;
    }

    const exactKey = `${text}\u0000${keyword.matchType}\u0000${keyword.negative ? 'N' : 'P'}`;
    if (exactKeys.has(exactKey)) return { status: 'BLOCKED', code: 'DUPLICATE_KEYWORD' };
    exactKeys.add(exactKey);

    const priorPolarity = polarityByText.get(text);
    if (priorPolarity !== undefined && priorPolarity !== keyword.negative) {
      return { status: 'BLOCKED', code: 'POSITIVE_NEGATIVE_CONFLICT' };
    }
    polarityByText.set(text, keyword.negative);
    if (!keyword.negative) positiveCount += 1;

    normalized.push({
      text,
      matchType: keyword.matchType,
      negative: keyword.negative,
      ...(keyword.suggestedBidMicros !== undefined
        ? { suggestedBidMicros: keyword.suggestedBidMicros }
        : {}),
      evidenceReferences: [...keyword.evidenceReferences].sort(),
    });
  }

  if (positiveCount === 0) return { status: 'BLOCKED', code: 'NO_POSITIVE_KEYWORDS' };

  const conversionResourceNames: string[] = [];
  if (conversionBidding(input.biddingStrategy)) {
    if (input.conversions.length === 0) return { status: 'BLOCKED', code: 'CONVERSION_REQUIRED' };
    for (const conversion of input.conversions) {
      if (
        !nonEmpty(conversion.resourceName) ||
        !nonEmpty(conversion.evidenceReference) ||
        !Number.isSafeInteger(conversion.observedAtMs) ||
        conversion.observedAtMs < 0 ||
        conversion.observedAtMs > input.nowMs
      ) {
        return { status: 'BLOCKED', code: 'CONVERSION_NOT_READY' };
      }
      if (input.nowMs - conversion.observedAtMs > input.maxContextAgeMs) {
        return { status: 'BLOCKED', code: 'CONVERSION_STALE' };
      }
      if (conversion.status === 'ENABLED' && conversion.primaryForGoals) {
        conversionResourceNames.push(conversion.resourceName);
      }
    }
    if (conversionResourceNames.length === 0) {
      return { status: 'BLOCKED', code: 'CONVERSION_NOT_READY' };
    }
  }

  normalized.sort((a, b) => {
    if (a.negative !== b.negative) return a.negative ? 1 : -1;
    const textOrder = a.text.localeCompare(b.text, 'en-US');
    if (textOrder !== 0) return textOrder;
    return a.matchType.localeCompare(b.matchType, 'en-US');
  });
  conversionResourceNames.sort((a, b) => a.localeCompare(b, 'en-US'));

  return {
    status: 'READY',
    plan: {
      planKind: 'W13_GOOGLE_ADS_SEARCH_PLAN',
      tenantId: input.tenantId,
      providerBindingReference: input.providerBindingReference,
      customerId: input.customerId,
      objective: input.objective,
      biddingStrategy: input.biddingStrategy,
      ...(input.targetCpaMicros !== undefined ? { targetCpaMicros: input.targetCpaMicros } : {}),
      ...(input.targetRoasBasisPoints !== undefined
        ? { targetRoasBasisPoints: input.targetRoasBasisPoints }
        : {}),
      keywords: normalized,
      conversionResourceNames,
      reasoningMode: 'DETERMINISTIC',
      requiresFinancialApproval: hasFinancialRecommendation,
      financialRecommendationsAreNonAuthoritative: true,
      requiresW07ExecutionForMutation: true,
      requiresW08GoogleAdsBinding: true,
      authorizesExecution: false,
      canGrantPermission: false,
    },
  };
}
