export const GOOGLE_ADS_CONSENT_VALUES = ['GRANTED', 'DENIED'] as const;
export type GoogleAdsConsentValue = (typeof GOOGLE_ADS_CONSENT_VALUES)[number];

export interface GoogleAdsConsentModeV2Snapshot {
  readonly adStorage: GoogleAdsConsentValue;
  readonly analyticsStorage: GoogleAdsConsentValue;
  readonly adUserData: GoogleAdsConsentValue;
  readonly adPersonalization: GoogleAdsConsentValue;
  readonly source: 'CMP';
  readonly observedAtMs: number;
}

export interface GoogleAdsClickIdentifiers {
  readonly gclid?: string;
  readonly wbraid?: string;
  readonly gbraid?: string;
}

export interface GoogleAdsOfflineConversionInput {
  readonly tenantId: string;
  readonly eventId: string;
  readonly conversionActionId: string;
  readonly occurredAtMs: number;
  readonly observedAtMs: number;
  readonly campaignId: string;
  readonly agentId: string;
  readonly source: 'CRM' | 'GA4' | 'FIRST_PARTY';
  readonly consent: GoogleAdsConsentModeV2Snapshot;
  readonly clickIdentifiers?: GoogleAdsClickIdentifiers;
  readonly userSiteIdentityHash?: string;
  readonly valueMicros?: number;
  readonly currency?: string;
}

export type GoogleAdsConversionBlockCode =
  | 'INVALID_IDENTITY'
  | 'INVALID_TIME'
  | 'INVALID_CONVERSION_ACTION'
  | 'INVALID_CAMPAIGN_MAPPING'
  | 'INVALID_AGENT_MAPPING'
  | 'MISSING_EXPLICIT_CMP_CONSENT'
  | 'CONSENT_DENIED'
  | 'MISSING_ATTRIBUTION_IDENTITY'
  | 'RAW_PII_DETECTED'
  | 'INVALID_VALUE';

export interface GoogleAdsOfflineConversionEvidence {
  readonly evidenceKind: 'W13_GOOGLE_ADS_OFFLINE_CONVERSION';
  readonly tenantId: string;
  readonly eventId: string;
  readonly conversionActionId: string;
  readonly occurredAtMs: number;
  readonly observedAtMs: number;
  readonly campaignId: string;
  readonly agentId: string;
  readonly source: GoogleAdsOfflineConversionInput['source'];
  readonly consent: GoogleAdsConsentModeV2Snapshot;
  readonly clickIdentifiers?: GoogleAdsClickIdentifiers;
  readonly userSiteIdentityHash?: string;
  readonly valueMicros?: number;
  readonly currency?: string;
  readonly dedupeKey: string;
  readonly authorizesExecution: false;
  readonly uploadAllowed: false;
}

export type GoogleAdsOfflineConversionResult =
  | { readonly status: 'READY'; readonly evidence: GoogleAdsOfflineConversionEvidence }
  | { readonly status: 'BLOCKED'; readonly code: GoogleAdsConversionBlockCode };

export interface GoogleAdsConversionConflict {
  readonly dedupeKey: string;
  readonly eventIds: readonly string[];
}

export interface GoogleAdsDedupeResult {
  readonly unique: readonly GoogleAdsOfflineConversionEvidence[];
  readonly conflicts: readonly GoogleAdsConversionConflict[];
}

const RAW_PII_KEYS = new Set([
  'email',
  'emailaddress',
  'phone',
  'phonenumber',
  'firstname',
  'lastname',
  'fullname',
  'address',
  'street',
  'postalcode',
  'zipcode',
]);

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function compactKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]/g, '');
}

function containsRawPii(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== 'object') return false;
  const object = value as Record<string, unknown>;
  if (seen.has(object)) return false;
  seen.add(object);

  for (const [key, nested] of Object.entries(object)) {
    if (RAW_PII_KEYS.has(compactKey(key))) return true;
    if (containsRawPii(nested, seen)) return true;
  }
  return false;
}

function explicitCmpConsent(consent: GoogleAdsConsentModeV2Snapshot): boolean {
  return (
    consent.source === 'CMP' &&
    validTime(consent.observedAtMs) &&
    GOOGLE_ADS_CONSENT_VALUES.includes(consent.adStorage) &&
    GOOGLE_ADS_CONSENT_VALUES.includes(consent.analyticsStorage) &&
    GOOGLE_ADS_CONSENT_VALUES.includes(consent.adUserData) &&
    GOOGLE_ADS_CONSENT_VALUES.includes(consent.adPersonalization)
  );
}

function hasAttributionIdentity(input: GoogleAdsOfflineConversionInput): boolean {
  const click = input.clickIdentifiers;
  return Boolean(
    (click?.gclid && nonEmpty(click.gclid)) ||
    (click?.wbraid && nonEmpty(click.wbraid)) ||
    (click?.gbraid && nonEmpty(click.gbraid)) ||
    (input.userSiteIdentityHash && nonEmpty(input.userSiteIdentityHash)),
  );
}

function validValue(input: GoogleAdsOfflineConversionInput): boolean {
  if (input.valueMicros === undefined && input.currency === undefined) return true;
  return (
    input.valueMicros !== undefined &&
    Number.isSafeInteger(input.valueMicros) &&
    input.valueMicros >= 0 &&
    input.currency !== undefined &&
    /^[A-Z]{3}$/.test(input.currency)
  );
}

function normalizeClickIdentifiers(
  identifiers: GoogleAdsClickIdentifiers | undefined,
): GoogleAdsClickIdentifiers | undefined {
  if (!identifiers) return undefined;
  const gclid = identifiers.gclid?.trim();
  const wbraid = identifiers.wbraid?.trim();
  const gbraid = identifiers.gbraid?.trim();
  if (!gclid && !wbraid && !gbraid) return undefined;
  return {
    ...(gclid ? { gclid } : {}),
    ...(wbraid ? { wbraid } : {}),
    ...(gbraid ? { gbraid } : {}),
  };
}

function fingerprint(evidence: GoogleAdsOfflineConversionEvidence): string {
  return JSON.stringify([
    evidence.tenantId,
    evidence.eventId,
    evidence.conversionActionId,
    evidence.occurredAtMs,
    evidence.campaignId,
    evidence.agentId,
    evidence.source,
    evidence.clickIdentifiers?.gclid ?? '',
    evidence.clickIdentifiers?.wbraid ?? '',
    evidence.clickIdentifiers?.gbraid ?? '',
    evidence.userSiteIdentityHash ?? '',
    evidence.valueMicros ?? null,
    evidence.currency ?? '',
  ]);
}

export function buildGoogleAdsOfflineConversionEvidence(
  input: GoogleAdsOfflineConversionInput,
): GoogleAdsOfflineConversionResult {
  if (containsRawPii(input)) return { status: 'BLOCKED', code: 'RAW_PII_DETECTED' };
  if (!nonEmpty(input.tenantId) || !nonEmpty(input.eventId)) {
    return { status: 'BLOCKED', code: 'INVALID_IDENTITY' };
  }
  if (
    !validTime(input.occurredAtMs) ||
    !validTime(input.observedAtMs) ||
    input.observedAtMs < input.occurredAtMs
  ) {
    return { status: 'BLOCKED', code: 'INVALID_TIME' };
  }
  if (!nonEmpty(input.conversionActionId)) {
    return { status: 'BLOCKED', code: 'INVALID_CONVERSION_ACTION' };
  }
  if (!nonEmpty(input.campaignId)) {
    return { status: 'BLOCKED', code: 'INVALID_CAMPAIGN_MAPPING' };
  }
  if (!nonEmpty(input.agentId)) {
    return { status: 'BLOCKED', code: 'INVALID_AGENT_MAPPING' };
  }
  if (!explicitCmpConsent(input.consent)) {
    return { status: 'BLOCKED', code: 'MISSING_EXPLICIT_CMP_CONSENT' };
  }
  if (
    input.consent.adStorage === 'DENIED' ||
    input.consent.adUserData === 'DENIED' ||
    input.consent.adPersonalization === 'DENIED'
  ) {
    return { status: 'BLOCKED', code: 'CONSENT_DENIED' };
  }
  if (!hasAttributionIdentity(input)) {
    return { status: 'BLOCKED', code: 'MISSING_ATTRIBUTION_IDENTITY' };
  }
  if (!validValue(input)) return { status: 'BLOCKED', code: 'INVALID_VALUE' };

  const clickIdentifiers = normalizeClickIdentifiers(input.clickIdentifiers);
  const userSiteIdentityHash = input.userSiteIdentityHash?.trim();
  const dedupeKey = [
    input.tenantId.trim(),
    input.conversionActionId.trim(),
    input.eventId.trim(),
  ].join(':');
  const evidence: GoogleAdsOfflineConversionEvidence = Object.freeze({
    evidenceKind: 'W13_GOOGLE_ADS_OFFLINE_CONVERSION',
    tenantId: input.tenantId.trim(),
    eventId: input.eventId.trim(),
    conversionActionId: input.conversionActionId.trim(),
    occurredAtMs: input.occurredAtMs,
    observedAtMs: input.observedAtMs,
    campaignId: input.campaignId.trim(),
    agentId: input.agentId.trim(),
    source: input.source,
    consent: Object.freeze({ ...input.consent }),
    ...(clickIdentifiers ? { clickIdentifiers: Object.freeze(clickIdentifiers) } : {}),
    ...(userSiteIdentityHash ? { userSiteIdentityHash } : {}),
    ...(input.valueMicros !== undefined ? { valueMicros: input.valueMicros } : {}),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
    dedupeKey,
    authorizesExecution: false,
    uploadAllowed: false,
  });

  return { status: 'READY', evidence };
}

export function dedupeGoogleAdsOfflineConversions(
  evidence: readonly GoogleAdsOfflineConversionEvidence[],
): GoogleAdsDedupeResult {
  const groups = new Map<string, GoogleAdsOfflineConversionEvidence[]>();
  for (const item of evidence) {
    const group = groups.get(item.dedupeKey) ?? [];
    group.push(item);
    groups.set(item.dedupeKey, group);
  }

  const unique: GoogleAdsOfflineConversionEvidence[] = [];
  const conflicts: GoogleAdsConversionConflict[] = [];
  for (const dedupeKey of [...groups.keys()].sort()) {
    const group = groups.get(dedupeKey) ?? [];
    const ordered = [...group].sort((left, right) =>
      fingerprint(left).localeCompare(fingerprint(right)),
    );
    const first = ordered[0];
    if (!first) continue;
    unique.push(first);
    if (ordered.some((item) => fingerprint(item) !== fingerprint(first))) {
      conflicts.push({
        dedupeKey,
        eventIds: Object.freeze(ordered.map((item) => item.eventId)),
      });
    }
  }
  return { unique: Object.freeze(unique), conflicts: Object.freeze(conflicts) };
}
