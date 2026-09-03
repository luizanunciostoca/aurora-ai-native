import type { CorrelationId, TenantId } from '@aurora/contracts';

export const GOOGLE_ADS_SURFACES = [
  'SEARCH',
  'PERFORMANCE_MAX',
  'DISPLAY',
  'YOUTUBE',
  'KEYWORD',
  'CONVERSION',
] as const;
export type GoogleAdsSurface = (typeof GOOGLE_ADS_SURFACES)[number];

export const GOOGLE_ADS_RESOURCE_KINDS = [
  'CAMPAIGN',
  'AD_GROUP',
  'AD',
  'ASSET_GROUP',
  'ASSET',
  'KEYWORD',
  'CONVERSION_ACTION',
  'AUDIENCE',
] as const;
export type GoogleAdsResourceKind = (typeof GOOGLE_ADS_RESOURCE_KINDS)[number];

export const GOOGLE_ADS_OPERATIONS = [
  'OBSERVE',
  'CREATE_PAUSED',
  'UPDATE_METADATA',
  'PAUSE',
  'ACTIVATE',
  'SET_BUDGET',
  'SET_BID',
  'UPDATE_KEYWORD',
  'UPDATE_CONVERSION',
  'DELETE',
] as const;
export type GoogleAdsOperation = (typeof GOOGLE_ADS_OPERATIONS)[number];

export type GoogleAdsRiskClass =
  | 'READ_ONLY'
  | 'REVERSIBLE_NON_SERVING_WRITE'
  | 'FINANCIAL_IMPACT_WRITE'
  | 'HIGH_IMPACT_SERVING_WRITE'
  | 'DESTRUCTIVE_WRITE';

export type GoogleAdsReversibility =
  | 'NOT_APPLICABLE'
  | 'REVERSIBLE'
  | 'REVERSIBLE_BY_PAUSE_OR_DELETE'
  | 'REVERSIBLE_BUT_FINANCIAL'
  | 'REVERSIBLE_BUT_BILLABLE'
  | 'DESTRUCTIVE';

export interface GoogleAdsExternalReference {
  readonly provider: 'GOOGLE_ADS';
  readonly resourceKind: GoogleAdsResourceKind;
  readonly customerId: string;
  readonly resourceName: string;
  readonly managerCustomerId?: string;
}

export interface GoogleAdsTargetReference {
  readonly auroraResourceId?: string;
  readonly googleAds?: GoogleAdsExternalReference;
}

export interface GoogleAdsFinancialScope {
  readonly currency: string;
  readonly ceilingMicros: number;
  readonly horizon: 'DAILY' | 'LIFETIME' | 'OPERATION';
}

/** Projection of the accepted W04 capability registry/plan input. It is never authority. */
export interface GoogleAdsCapabilityProjection {
  readonly source: 'W04_CAPABILITY_REGISTRY';
  readonly capabilityId: string;
  readonly registryVersion: string;
  readonly targetKind: 'PROVIDER';
  readonly compatibilityKey: 'google-ads';
  readonly authorizesExecution: false;
}

export interface GoogleAdsDomainIntentInput {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly intentId: string;
  readonly surface: GoogleAdsSurface;
  readonly resourceKind: GoogleAdsResourceKind;
  readonly operation: GoogleAdsOperation;
  readonly providerBindingReference: string;
  readonly customerId: string;
  readonly managerCustomerId?: string;
  readonly target: GoogleAdsTargetReference;
  readonly capability: GoogleAdsCapabilityProjection;
  readonly financialScope?: GoogleAdsFinancialScope;
  readonly expectedProviderState?: string;
}

export interface GoogleAdsCapabilityPlan {
  readonly planKind: 'W13_GOOGLE_ADS_DOMAIN_CAPABILITY_PLAN';
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly intentId: string;
  readonly surface: GoogleAdsSurface;
  readonly resourceKind: GoogleAdsResourceKind;
  readonly operation: GoogleAdsOperation;
  readonly providerBindingReference: string;
  readonly customerId: string;
  readonly managerCustomerId?: string;
  readonly target: GoogleAdsTargetReference;
  readonly capability: GoogleAdsCapabilityProjection;
  readonly boundary: 'READ' | 'WRITE';
  readonly riskClass: GoogleAdsRiskClass;
  readonly reversibility: GoogleAdsReversibility;
  readonly financialScope?: GoogleAdsFinancialScope;
  readonly expectedProviderState?: string;
  readonly pausedFirst: boolean;
  readonly requiresCurrentApproval: boolean;
  readonly requiresW07Execution: boolean;
  readonly requiresW08GoogleAdsBinding: true;
  readonly requiresProviderReadback: boolean;
  readonly executionPath: 'W08_READ_ONLY' | 'W07_EXECUTOR_TO_W08_GOOGLE_ADS_ADAPTER';
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export type GoogleAdsPlanBlockCode =
  | 'INVALID_INTENT'
  | 'MISSING_PROVIDER_BINDING'
  | 'MISSING_CUSTOMER_ID'
  | 'MISSING_CAPABILITY_REFERENCE'
  | 'INCOMPATIBLE_CAPABILITY'
  | 'MISSING_GOOGLE_EXTERNAL_ID'
  | 'RESOURCE_SURFACE_MISMATCH'
  | 'FINANCIAL_SCOPE_REQUIRED'
  | 'INVALID_FINANCIAL_SCOPE';

export type GoogleAdsPlanResult =
  | { readonly status: 'READY'; readonly plan: GoogleAdsCapabilityPlan }
  | { readonly status: 'BLOCKED'; readonly code: GoogleAdsPlanBlockCode };

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function isRead(operation: GoogleAdsOperation): boolean {
  return operation === 'OBSERVE';
}

function needsExistingExternalId(operation: GoogleAdsOperation): boolean {
  return operation !== 'CREATE_PAUSED';
}

function needsFinancialScope(operation: GoogleAdsOperation): boolean {
  return operation === 'ACTIVATE' || operation === 'SET_BUDGET' || operation === 'SET_BID';
}

function validFinancialScope(scope: GoogleAdsFinancialScope): boolean {
  return (
    /^[A-Z]{3}$/.test(scope.currency) &&
    Number.isSafeInteger(scope.ceilingMicros) &&
    scope.ceilingMicros >= 0
  );
}

function validSurfaceForResource(
  surface: GoogleAdsSurface,
  resourceKind: GoogleAdsResourceKind,
): boolean {
  if (resourceKind === 'KEYWORD') return surface === 'KEYWORD' || surface === 'SEARCH';
  if (resourceKind === 'CONVERSION_ACTION') return surface === 'CONVERSION';
  if (surface === 'KEYWORD' || surface === 'CONVERSION') return false;
  return true;
}

function classifyRisk(operation: GoogleAdsOperation): GoogleAdsRiskClass {
  switch (operation) {
    case 'OBSERVE':
      return 'READ_ONLY';
    case 'CREATE_PAUSED':
    case 'UPDATE_METADATA':
    case 'PAUSE':
    case 'UPDATE_KEYWORD':
    case 'UPDATE_CONVERSION':
      return 'REVERSIBLE_NON_SERVING_WRITE';
    case 'SET_BUDGET':
    case 'SET_BID':
      return 'FINANCIAL_IMPACT_WRITE';
    case 'ACTIVATE':
      return 'HIGH_IMPACT_SERVING_WRITE';
    case 'DELETE':
      return 'DESTRUCTIVE_WRITE';
  }
}

function classifyReversibility(operation: GoogleAdsOperation): GoogleAdsReversibility {
  switch (operation) {
    case 'OBSERVE':
      return 'NOT_APPLICABLE';
    case 'CREATE_PAUSED':
      return 'REVERSIBLE_BY_PAUSE_OR_DELETE';
    case 'UPDATE_METADATA':
    case 'PAUSE':
    case 'UPDATE_KEYWORD':
    case 'UPDATE_CONVERSION':
      return 'REVERSIBLE';
    case 'SET_BUDGET':
    case 'SET_BID':
      return 'REVERSIBLE_BUT_FINANCIAL';
    case 'ACTIVATE':
      return 'REVERSIBLE_BUT_BILLABLE';
    case 'DELETE':
      return 'DESTRUCTIVE';
  }
}

export function planGoogleAdsDomainIntent(input: GoogleAdsDomainIntentInput): GoogleAdsPlanResult {
  if (!nonEmpty(input.intentId)) return { status: 'BLOCKED', code: 'INVALID_INTENT' };
  if (!nonEmpty(input.providerBindingReference)) {
    return { status: 'BLOCKED', code: 'MISSING_PROVIDER_BINDING' };
  }
  if (!nonEmpty(input.customerId)) return { status: 'BLOCKED', code: 'MISSING_CUSTOMER_ID' };
  if (!nonEmpty(input.capability.capabilityId) || !nonEmpty(input.capability.registryVersion)) {
    return { status: 'BLOCKED', code: 'MISSING_CAPABILITY_REFERENCE' };
  }
  if (
    input.capability.targetKind !== 'PROVIDER' ||
    input.capability.compatibilityKey !== 'google-ads'
  ) {
    return { status: 'BLOCKED', code: 'INCOMPATIBLE_CAPABILITY' };
  }
  if (!validSurfaceForResource(input.surface, input.resourceKind)) {
    return { status: 'BLOCKED', code: 'RESOURCE_SURFACE_MISMATCH' };
  }
  if (
    needsExistingExternalId(input.operation) &&
    (!input.target.googleAds ||
      !nonEmpty(input.target.googleAds.resourceName) ||
      input.target.googleAds.provider !== 'GOOGLE_ADS' ||
      input.target.googleAds.resourceKind !== input.resourceKind ||
      input.target.googleAds.customerId !== input.customerId)
  ) {
    return { status: 'BLOCKED', code: 'MISSING_GOOGLE_EXTERNAL_ID' };
  }
  if (needsFinancialScope(input.operation) && !input.financialScope) {
    return { status: 'BLOCKED', code: 'FINANCIAL_SCOPE_REQUIRED' };
  }
  if (input.financialScope && !validFinancialScope(input.financialScope)) {
    return { status: 'BLOCKED', code: 'INVALID_FINANCIAL_SCOPE' };
  }

  const read = isRead(input.operation);
  const plan: GoogleAdsCapabilityPlan = {
    planKind: 'W13_GOOGLE_ADS_DOMAIN_CAPABILITY_PLAN',
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    intentId: input.intentId,
    surface: input.surface,
    resourceKind: input.resourceKind,
    operation: input.operation,
    providerBindingReference: input.providerBindingReference,
    customerId: input.customerId,
    ...(input.managerCustomerId ? { managerCustomerId: input.managerCustomerId } : {}),
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
    requiresW08GoogleAdsBinding: true,
    requiresProviderReadback: !read,
    executionPath: read ? 'W08_READ_ONLY' : 'W07_EXECUTOR_TO_W08_GOOGLE_ADS_ADAPTER',
    authorizesExecution: false,
    canGrantPermission: false,
  };

  return { status: 'READY', plan };
}
