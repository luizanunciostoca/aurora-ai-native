import type { CorrelationId, TenantId } from '@aurora/contracts';

export const META_ADS_RESOURCE_KINDS = [
  'CAMPAIGN',
  'AD_SET',
  'AD',
  'AUDIENCE',
  'CREATIVE',
] as const;
export type MetaAdsResourceKind = (typeof META_ADS_RESOURCE_KINDS)[number];

export const META_ADS_OPERATIONS = [
  'OBSERVE',
  'CREATE_PAUSED',
  'UPDATE_METADATA',
  'PAUSE',
  'ACTIVATE',
  'SET_BUDGET',
  'SET_BID',
  'WIDEN_TARGETING',
  'DELETE',
] as const;
export type MetaAdsOperation = (typeof META_ADS_OPERATIONS)[number];

export type MetaAdsRiskClass =
  | 'READ_ONLY'
  | 'REVERSIBLE_NON_SERVING_WRITE'
  | 'FINANCIAL_IMPACT_WRITE'
  | 'HIGH_IMPACT_SERVING_WRITE'
  | 'DESTRUCTIVE_WRITE';

export type MetaAdsReversibility =
  | 'NOT_APPLICABLE'
  | 'REVERSIBLE'
  | 'REVERSIBLE_BY_PAUSE_OR_DELETE'
  | 'REVERSIBLE_BUT_FINANCIAL'
  | 'REVERSIBLE_BUT_BILLABLE'
  | 'DESTRUCTIVE';

export interface MetaAdsExternalReference {
  readonly provider: 'META_ADS';
  readonly resourceKind: MetaAdsResourceKind;
  readonly externalId: string;
}

export interface MetaAdsTargetReference {
  readonly auroraResourceId?: string;
  readonly meta?: MetaAdsExternalReference;
}

export interface MetaAdsFinancialScope {
  readonly currency: string;
  readonly ceilingMinor: number;
  readonly horizon: 'DAILY' | 'LIFETIME' | 'OPERATION';
}

/** Projection of the accepted W04 capability registry/plan input. It is never authority. */
export interface MetaAdsCapabilityProjection {
  readonly source: 'W04_CAPABILITY_REGISTRY';
  readonly capabilityId: string;
  readonly registryVersion: string;
  readonly targetKind: 'PROVIDER';
  readonly compatibilityKey: 'meta-ads';
  readonly authorizesExecution: false;
}

export interface MetaAdsDomainIntentInput {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly intentId: string;
  readonly resourceKind: MetaAdsResourceKind;
  readonly operation: MetaAdsOperation;
  readonly providerBindingReference: string;
  readonly adAccountExternalId: string;
  readonly target: MetaAdsTargetReference;
  readonly capability: MetaAdsCapabilityProjection;
  readonly financialScope?: MetaAdsFinancialScope;
  readonly expectedProviderState?: string;
}

export interface MetaAdsCapabilityPlan {
  readonly planKind: 'W12_META_ADS_DOMAIN_CAPABILITY_PLAN';
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly intentId: string;
  readonly resourceKind: MetaAdsResourceKind;
  readonly operation: MetaAdsOperation;
  readonly providerBindingReference: string;
  readonly adAccountExternalId: string;
  readonly target: MetaAdsTargetReference;
  readonly capability: MetaAdsCapabilityProjection;
  readonly boundary: 'READ' | 'WRITE';
  readonly riskClass: MetaAdsRiskClass;
  readonly reversibility: MetaAdsReversibility;
  readonly financialScope?: MetaAdsFinancialScope;
  readonly expectedProviderState?: string;
  readonly pausedFirst: boolean;
  readonly requiresCurrentApproval: boolean;
  readonly requiresW07Execution: boolean;
  readonly requiresW08MetaBinding: true;
  readonly requiresProviderReadback: boolean;
  readonly executionPath: 'W08_READ_ONLY' | 'W07_EXECUTOR_TO_W08_META_ADAPTER';
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export type MetaAdsPlanBlockCode =
  | 'INVALID_INTENT'
  | 'MISSING_PROVIDER_BINDING'
  | 'MISSING_AD_ACCOUNT_EXTERNAL_ID'
  | 'MISSING_CAPABILITY_REFERENCE'
  | 'INCOMPATIBLE_CAPABILITY'
  | 'MISSING_META_EXTERNAL_ID'
  | 'FINANCIAL_SCOPE_REQUIRED'
  | 'INVALID_FINANCIAL_SCOPE';

export type MetaAdsPlanResult =
  | { readonly status: 'READY'; readonly plan: MetaAdsCapabilityPlan }
  | { readonly status: 'BLOCKED'; readonly code: MetaAdsPlanBlockCode };

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function isRead(operation: MetaAdsOperation): boolean {
  return operation === 'OBSERVE';
}

function needsExistingExternalId(operation: MetaAdsOperation): boolean {
  return operation !== 'CREATE_PAUSED';
}

function needsFinancialScope(operation: MetaAdsOperation): boolean {
  return (
    operation === 'ACTIVATE' ||
    operation === 'SET_BUDGET' ||
    operation === 'SET_BID' ||
    operation === 'WIDEN_TARGETING'
  );
}

function validFinancialScope(scope: MetaAdsFinancialScope): boolean {
  return (
    /^[A-Z]{3}$/.test(scope.currency) &&
    Number.isSafeInteger(scope.ceilingMinor) &&
    scope.ceilingMinor >= 0
  );
}

function classifyRisk(operation: MetaAdsOperation): MetaAdsRiskClass {
  switch (operation) {
    case 'OBSERVE':
      return 'READ_ONLY';
    case 'CREATE_PAUSED':
    case 'UPDATE_METADATA':
    case 'PAUSE':
      return 'REVERSIBLE_NON_SERVING_WRITE';
    case 'SET_BUDGET':
    case 'SET_BID':
    case 'WIDEN_TARGETING':
      return 'FINANCIAL_IMPACT_WRITE';
    case 'ACTIVATE':
      return 'HIGH_IMPACT_SERVING_WRITE';
    case 'DELETE':
      return 'DESTRUCTIVE_WRITE';
  }
}

function classifyReversibility(operation: MetaAdsOperation): MetaAdsReversibility {
  switch (operation) {
    case 'OBSERVE':
      return 'NOT_APPLICABLE';
    case 'CREATE_PAUSED':
      return 'REVERSIBLE_BY_PAUSE_OR_DELETE';
    case 'UPDATE_METADATA':
    case 'PAUSE':
      return 'REVERSIBLE';
    case 'SET_BUDGET':
    case 'SET_BID':
    case 'WIDEN_TARGETING':
      return 'REVERSIBLE_BUT_FINANCIAL';
    case 'ACTIVATE':
      return 'REVERSIBLE_BUT_BILLABLE';
    case 'DELETE':
      return 'DESTRUCTIVE';
  }
}

export function planMetaAdsDomainIntent(input: MetaAdsDomainIntentInput): MetaAdsPlanResult {
  if (!nonEmpty(input.intentId)) return { status: 'BLOCKED', code: 'INVALID_INTENT' };
  if (!nonEmpty(input.providerBindingReference)) {
    return { status: 'BLOCKED', code: 'MISSING_PROVIDER_BINDING' };
  }
  if (!nonEmpty(input.adAccountExternalId)) {
    return { status: 'BLOCKED', code: 'MISSING_AD_ACCOUNT_EXTERNAL_ID' };
  }
  if (!nonEmpty(input.capability.capabilityId) || !nonEmpty(input.capability.registryVersion)) {
    return { status: 'BLOCKED', code: 'MISSING_CAPABILITY_REFERENCE' };
  }
  if (input.capability.targetKind !== 'PROVIDER' || input.capability.compatibilityKey !== 'meta-ads') {
    return { status: 'BLOCKED', code: 'INCOMPATIBLE_CAPABILITY' };
  }
  if (
    needsExistingExternalId(input.operation) &&
    (!input.target.meta ||
      !nonEmpty(input.target.meta.externalId) ||
      input.target.meta.provider !== 'META_ADS' ||
      input.target.meta.resourceKind !== input.resourceKind)
  ) {
    return { status: 'BLOCKED', code: 'MISSING_META_EXTERNAL_ID' };
  }
  if (needsFinancialScope(input.operation) && !input.financialScope) {
    return { status: 'BLOCKED', code: 'FINANCIAL_SCOPE_REQUIRED' };
  }
  if (input.financialScope && !validFinancialScope(input.financialScope)) {
    return { status: 'BLOCKED', code: 'INVALID_FINANCIAL_SCOPE' };
  }

  const read = isRead(input.operation);
  const plan: MetaAdsCapabilityPlan = {
    planKind: 'W12_META_ADS_DOMAIN_CAPABILITY_PLAN',
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    intentId: input.intentId,
    resourceKind: input.resourceKind,
    operation: input.operation,
    providerBindingReference: input.providerBindingReference,
    adAccountExternalId: input.adAccountExternalId,
    target: input.target,
    capability: input.capability,
    boundary: read ? 'READ' : 'WRITE',
    riskClass: classifyRisk(input.operation),
    reversibility: classifyReversibility(input.operation),
    ...(input.financialScope ? { financialScope: input.financialScope } : {}),
    ...(input.expectedProviderState ? { expectedProviderState: input.expectedProviderState } : {}),
    pausedFirst: input.operation === 'CREATE_PAUSED',
    requiresCurrentApproval: !read,
    requiresW07Execution: !read,
    requiresW08MetaBinding: true,
    requiresProviderReadback: !read,
    executionPath: read ? 'W08_READ_ONLY' : 'W07_EXECUTOR_TO_W08_META_ADAPTER',
    authorizesExecution: false,
    canGrantPermission: false,
  };

  return { status: 'READY', plan };
}
