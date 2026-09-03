import type { TenantId } from '@aurora/contracts';

export const GOOGLE_ADS_READ_OPERATIONS = [
  'CAMPAIGNS',
  'AD_GROUPS',
  'ADS',
  'ASSET_GROUPS',
  'ASSETS',
  'KEYWORDS',
  'CONVERSION_ACTIONS',
  'AUDIENCES',
  'METRICS',
] as const;
export type GoogleAdsReadOperation = (typeof GOOGLE_ADS_READ_OPERATIONS)[number];

export type GoogleAdsProviderHealth = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';

/**
 * W08-owned binding facts projected into W13. This projection is evidence and
 * routing context only. It can never grant execution authority.
 */
export interface GoogleAdsBindingProjection {
  readonly source: 'W08_PROVIDER_BINDING';
  readonly tenantId: TenantId;
  readonly provider: 'GOOGLE_ADS';
  readonly bindingReference: string;
  readonly customerId: string;
  readonly managerCustomerId?: string;
  readonly state: 'ACTIVE' | 'INACTIVE' | 'REVOKED';
  readonly verificationState: 'UNVERIFIED' | 'VERIFIED' | 'STALE';
  readonly bindingVersion: number;
  readonly verifiedAtMs: number;
  readonly authorizesExecution: false;
}

/** W08/provider-health observation. Health is a precondition, never authority. */
export interface GoogleAdsHealthProjection {
  readonly source: 'W08_PROVIDER_HEALTH';
  readonly status: GoogleAdsProviderHealth;
  readonly observedAtMs: number;
  readonly authorizesExecution: false;
}

export interface GoogleAdsAccountReadInput {
  readonly tenantId: TenantId;
  readonly providerBindingReference: string;
  readonly customerId: string;
  readonly managerCustomerId?: string;
  readonly operation: GoogleAdsReadOperation;
  readonly fields: readonly string[];
  readonly nowMs: number;
  readonly maxVerificationAgeMs: number;
  readonly maxHealthAgeMs: number;
  readonly limits: Readonly<{ maxPages: number; maxItems: number }>;
  readonly binding: GoogleAdsBindingProjection;
  readonly health: GoogleAdsHealthProjection;
}

export interface GoogleAdsAccountReadPlan {
  readonly planKind: 'W13_GOOGLE_ADS_ACCOUNT_READ_PLAN';
  readonly tenantId: TenantId;
  readonly providerBindingReference: string;
  readonly customerId: string;
  readonly managerCustomerId?: string;
  readonly bindingVersion: number;
  readonly operation: GoogleAdsReadOperation;
  readonly fields: readonly string[];
  readonly limits: Readonly<{ maxPages: number; maxItems: number }>;
  readonly providerHealth: Exclude<GoogleAdsProviderHealth, 'UNAVAILABLE'>;
  readonly verificationAgeMs: number;
  readonly healthAgeMs: number;
  readonly executionPath: 'W08_READ_ONLY';
  readonly readOnly: true;
  readonly accountVerificationIsPreconditionOnly: true;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export type GoogleAdsAccountReadBlockCode =
  | 'INVALID_REFERENCE'
  | 'INVALID_TIME_BOUNDARY'
  | 'INVALID_LIMITS'
  | 'EMPTY_FIELDS'
  | 'WRONG_TENANT'
  | 'WRONG_PROVIDER'
  | 'WRONG_BINDING'
  | 'WRONG_CUSTOMER'
  | 'MANAGER_HIERARCHY_MISMATCH'
  | 'BINDING_INACTIVE'
  | 'BINDING_REVOKED'
  | 'ACCOUNT_NOT_VERIFIED'
  | 'VERIFICATION_STALE'
  | 'HEALTH_STALE'
  | 'PROVIDER_UNAVAILABLE';

export type GoogleAdsAccountReadResult =
  | Readonly<{ status: 'READY'; plan: GoogleAdsAccountReadPlan }>
  | Readonly<{ status: 'BLOCKED'; code: GoogleAdsAccountReadBlockCode }>;

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

function managerMatches(expected: string | undefined, actual: string | undefined): boolean {
  return expected === actual;
}

export function prepareGoogleAdsAccountRead(
  input: GoogleAdsAccountReadInput,
): GoogleAdsAccountReadResult {
  if (
    !nonEmpty(input.providerBindingReference) ||
    !nonEmpty(input.customerId) ||
    !nonEmpty(input.binding.bindingReference) ||
    !nonEmpty(input.binding.customerId)
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
  if (input.binding.provider !== 'GOOGLE_ADS') {
    return { status: 'BLOCKED', code: 'WRONG_PROVIDER' };
  }
  if (input.binding.bindingReference !== input.providerBindingReference) {
    return { status: 'BLOCKED', code: 'WRONG_BINDING' };
  }
  if (input.binding.customerId !== input.customerId) {
    return { status: 'BLOCKED', code: 'WRONG_CUSTOMER' };
  }
  if (!managerMatches(input.managerCustomerId, input.binding.managerCustomerId)) {
    return { status: 'BLOCKED', code: 'MANAGER_HIERARCHY_MISMATCH' };
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
      planKind: 'W13_GOOGLE_ADS_ACCOUNT_READ_PLAN',
      tenantId: input.tenantId,
      providerBindingReference: input.providerBindingReference,
      customerId: input.customerId,
      ...(input.managerCustomerId ? { managerCustomerId: input.managerCustomerId } : {}),
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
