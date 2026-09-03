import type { TenantId } from '@aurora/contracts';

export const META_ADS_READ_OPERATIONS = [
  'CAMPAIGNS',
  'AD_SETS',
  'ADS',
  'AUDIENCES',
  'METRICS',
] as const;
export type MetaAdsReadOperation = (typeof META_ADS_READ_OPERATIONS)[number];

export type MetaAdsProviderHealth = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';

/**
 * W08-owned binding facts projected into W12. This projection is routing and
 * verification evidence only. It can never grant execution authority.
 */
export interface MetaAdsBindingProjection {
  readonly source: 'W08_PROVIDER_BINDING';
  readonly tenantId: TenantId;
  readonly provider: 'META_ADS';
  readonly bindingReference: string;
  readonly businessAccountExternalId: string;
  readonly adAccountExternalId: string;
  readonly state: 'ACTIVE' | 'INACTIVE' | 'REVOKED';
  readonly verificationState: 'UNVERIFIED' | 'VERIFIED' | 'STALE';
  readonly bindingVersion: number;
  readonly verifiedAtMs: number;
  readonly authorizesExecution: false;
}

/** W08/provider-health observation. Health is a precondition, never authority. */
export interface MetaAdsHealthProjection {
  readonly source: 'W08_PROVIDER_HEALTH';
  readonly status: MetaAdsProviderHealth;
  readonly observedAtMs: number;
  readonly authorizesExecution: false;
}

export interface MetaAdsAccountReadInput {
  readonly tenantId: TenantId;
  readonly providerBindingReference: string;
  readonly businessAccountExternalId: string;
  readonly adAccountExternalId: string;
  readonly operation: MetaAdsReadOperation;
  readonly fields: readonly string[];
  readonly nowMs: number;
  readonly maxVerificationAgeMs: number;
  readonly maxHealthAgeMs: number;
  readonly limits: Readonly<{ maxPages: number; maxItems: number }>;
  readonly binding: MetaAdsBindingProjection;
  readonly health: MetaAdsHealthProjection;
}

export interface MetaAdsAccountReadPlan {
  readonly planKind: 'W12_META_ADS_ACCOUNT_READ_PLAN';
  readonly tenantId: TenantId;
  readonly providerBindingReference: string;
  readonly businessAccountExternalId: string;
  readonly adAccountExternalId: string;
  readonly bindingVersion: number;
  readonly operation: MetaAdsReadOperation;
  readonly fields: readonly string[];
  readonly limits: Readonly<{ maxPages: number; maxItems: number }>;
  readonly providerHealth: Exclude<MetaAdsProviderHealth, 'UNAVAILABLE'>;
  readonly verificationAgeMs: number;
  readonly healthAgeMs: number;
  readonly executionPath: 'W08_READ_ONLY';
  readonly readOnly: true;
  readonly accountVerificationIsPreconditionOnly: true;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export type MetaAdsAccountReadBlockCode =
  | 'INVALID_REFERENCE'
  | 'INVALID_TIME_BOUNDARY'
  | 'INVALID_LIMITS'
  | 'EMPTY_FIELDS'
  | 'WRONG_TENANT'
  | 'WRONG_PROVIDER'
  | 'WRONG_BINDING'
  | 'WRONG_BUSINESS_ACCOUNT'
  | 'WRONG_AD_ACCOUNT'
  | 'BINDING_INACTIVE'
  | 'BINDING_REVOKED'
  | 'ACCOUNT_NOT_VERIFIED'
  | 'VERIFICATION_STALE'
  | 'HEALTH_STALE'
  | 'PROVIDER_UNAVAILABLE';

export type MetaAdsAccountReadResult =
  | Readonly<{ status: 'READY'; plan: MetaAdsAccountReadPlan }>
  | Readonly<{ status: 'BLOCKED'; code: MetaAdsAccountReadBlockCode }>;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function validAgeBoundary(nowMs: number, observedAtMs: number, maxAgeMs: number): boolean {
  return (
    Number.isSafeInteger(nowMs) &&
    Number.isSafeInteger(observedAtMs) &&
    Number.isSafeInteger(maxAgeMs) &&
    nowMs >= 0 &&
    observedAtMs >= 0 &&
    maxAgeMs >= 0 &&
    observedAtMs <= nowMs
  );
}

function validLimits(limits: Readonly<{ maxPages: number; maxItems: number }>): boolean {
  return (
    Number.isSafeInteger(limits.maxPages) &&
    Number.isSafeInteger(limits.maxItems) &&
    limits.maxPages > 0 &&
    limits.maxPages <= 100 &&
    limits.maxItems > 0 &&
    limits.maxItems <= 10_000
  );
}

export function prepareMetaAdsAccountRead(input: MetaAdsAccountReadInput): MetaAdsAccountReadResult {
  if (
    !nonEmpty(input.providerBindingReference) ||
    !nonEmpty(input.businessAccountExternalId) ||
    !nonEmpty(input.adAccountExternalId) ||
    !nonEmpty(input.binding.bindingReference) ||
    !nonEmpty(input.binding.businessAccountExternalId) ||
    !nonEmpty(input.binding.adAccountExternalId)
  ) {
    return { status: 'BLOCKED', code: 'INVALID_REFERENCE' };
  }
  if (
    !validAgeBoundary(input.nowMs, input.binding.verifiedAtMs, input.maxVerificationAgeMs) ||
    !validAgeBoundary(input.nowMs, input.health.observedAtMs, input.maxHealthAgeMs)
  ) {
    return { status: 'BLOCKED', code: 'INVALID_TIME_BOUNDARY' };
  }
  if (!validLimits(input.limits)) return { status: 'BLOCKED', code: 'INVALID_LIMITS' };
  if (input.fields.length === 0 || input.fields.some((field) => !nonEmpty(field))) {
    return { status: 'BLOCKED', code: 'EMPTY_FIELDS' };
  }
  if (input.binding.tenantId !== input.tenantId) {
    return { status: 'BLOCKED', code: 'WRONG_TENANT' };
  }
  if (input.binding.provider !== 'META_ADS') {
    return { status: 'BLOCKED', code: 'WRONG_PROVIDER' };
  }
  if (input.binding.bindingReference !== input.providerBindingReference) {
    return { status: 'BLOCKED', code: 'WRONG_BINDING' };
  }
  if (input.binding.businessAccountExternalId !== input.businessAccountExternalId) {
    return { status: 'BLOCKED', code: 'WRONG_BUSINESS_ACCOUNT' };
  }
  if (input.binding.adAccountExternalId !== input.adAccountExternalId) {
    return { status: 'BLOCKED', code: 'WRONG_AD_ACCOUNT' };
  }
  if (input.binding.state === 'REVOKED') {
    return { status: 'BLOCKED', code: 'BINDING_REVOKED' };
  }
  if (input.binding.state !== 'ACTIVE') {
    return { status: 'BLOCKED', code: 'BINDING_INACTIVE' };
  }
  if (input.binding.verificationState !== 'VERIFIED') {
    return { status: 'BLOCKED', code: 'ACCOUNT_NOT_VERIFIED' };
  }

  const verificationAgeMs = input.nowMs - input.binding.verifiedAtMs;
  if (verificationAgeMs > input.maxVerificationAgeMs) {
    return { status: 'BLOCKED', code: 'VERIFICATION_STALE' };
  }

  const healthAgeMs = input.nowMs - input.health.observedAtMs;
  if (healthAgeMs > input.maxHealthAgeMs) {
    return { status: 'BLOCKED', code: 'HEALTH_STALE' };
  }
  if (input.health.status === 'UNAVAILABLE') {
    return { status: 'BLOCKED', code: 'PROVIDER_UNAVAILABLE' };
  }

  return {
    status: 'READY',
    plan: {
      planKind: 'W12_META_ADS_ACCOUNT_READ_PLAN',
      tenantId: input.tenantId,
      providerBindingReference: input.providerBindingReference,
      businessAccountExternalId: input.businessAccountExternalId,
      adAccountExternalId: input.adAccountExternalId,
      bindingVersion: input.binding.bindingVersion,
      operation: input.operation,
      fields: [...input.fields],
      limits: { ...input.limits },
      providerHealth: input.health.status,
      verificationAgeMs,
      healthAgeMs,
      executionPath: 'W08_READ_ONLY',
      readOnly: true,
      accountVerificationIsPreconditionOnly: true,
      authorizesExecution: false,
      canGrantPermission: false,
    },
  };
}
