import { DATA_CLASSIFICATIONS, IDENTITY_KINDS } from '@aurora/contracts/context';

import {
  CONTEXT_CURRENTNESS_MODES,
  CONTEXT_SOURCE_CLASSES,
  type ContextQuery,
  type ContextQueryValidationReason,
  type ContextQueryValidationResult,
  type ContextSelector,
} from './types.js';

const MAX_SOURCE_FANOUT = 32;
const MAX_ITEMS_PER_SOURCE = 100;
const MAX_TOTAL_ITEMS = 1024;
const MAX_SELECTORS = 128;
const MAX_REQUESTED_FIELDS = 128;
const CONTRACT_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const WHOLE_STORE_TOKENS = new Set(['*', 'ALL', '__ALL__', '__all__']);

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveIntegerWithin(value: unknown, max: number): boolean {
  return Number.isInteger(value) && typeof value === 'number' && value > 0 && value <= max;
}

function selectorKey(selector: ContextSelector): string {
  return [selector.adapterId, selector.sourceClass, selector.key, selector.value].join('\u0000');
}

function selectorIsNarrow(selector: ContextSelector): boolean {
  if (
    !nonEmptyString(selector.adapterId) ||
    !nonEmptyString(selector.key) ||
    !nonEmptyString(selector.value)
  ) {
    return false;
  }
  return (
    !WHOLE_STORE_TOKENS.has(selector.key.trim()) && !WHOLE_STORE_TOKENS.has(selector.value.trim())
  );
}

function pushUnique(
  reasons: Exclude<ContextQueryValidationReason, 'VALID'>[],
  reason: Exclude<ContextQueryValidationReason, 'VALID'>,
): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

/**
 * Structural W06-A validation only. This does not evaluate current policy,
 * authority or provider credentials and therefore cannot authorize execution.
 */
export function validateContextQuery(query: ContextQuery): ContextQueryValidationResult {
  const reasons: Exclude<ContextQueryValidationReason, 'VALID'>[] = [];

  if (query.kind !== 'ContextQuery') pushUnique(reasons, 'INVALID_KIND');
  if (!nonEmptyString(query.schemaVersion) || !CONTRACT_VERSION_PATTERN.test(query.schemaVersion)) {
    pushUnique(reasons, 'INVALID_SCHEMA_VERSION');
  }
  if (!query.tenant || !nonEmptyString(query.tenant.tenantId)) {
    pushUnique(reasons, 'INVALID_TENANT');
  }
  if (!query.correlation || !nonEmptyString(query.correlation.correlationId)) {
    pushUnique(reasons, 'INVALID_CORRELATION');
  }
  if (
    !query.actor ||
    !IDENTITY_KINDS.includes(query.actor.kind) ||
    !nonEmptyString(query.actor.identityId)
  ) {
    pushUnique(reasons, 'INVALID_ACTOR');
  }

  if (
    !query.purpose ||
    query.purpose.kind !== 'PurposeContext' ||
    !nonEmptyString(query.purpose.purposeId) ||
    !nonEmptyString(query.purpose.version)
  ) {
    pushUnique(reasons, 'INVALID_PURPOSE');
  } else {
    if (query.purpose.status !== 'ACTIVE') pushUnique(reasons, 'PURPOSE_DISABLED');
    if (
      query.purpose.allowedDataClassifications &&
      !query.purpose.allowedDataClassifications.includes(query.maxDataClassification)
    ) {
      pushUnique(reasons, 'PURPOSE_CLASSIFICATION_MISMATCH');
    }
  }

  if (
    !query.jurisdiction ||
    query.jurisdiction.kind !== 'JurisdictionContext' ||
    !nonEmptyString(query.jurisdiction.jurisdiction) ||
    !nonEmptyString(query.jurisdiction.version)
  ) {
    pushUnique(reasons, 'INVALID_JURISDICTION');
  }

  if (query.requiresConsent === true && !query.consent) {
    pushUnique(reasons, 'CONSENT_REQUIRED');
  }

  if (!DATA_CLASSIFICATIONS.includes(query.maxDataClassification)) {
    pushUnique(reasons, 'PURPOSE_CLASSIFICATION_MISMATCH');
  }
  if (!CONTEXT_CURRENTNESS_MODES.includes(query.currentness)) {
    pushUnique(reasons, 'INVALID_CURRENTNESS');
  }

  const limits = query.limits;
  if (
    !limits ||
    !positiveIntegerWithin(limits.maxSourceFanout, MAX_SOURCE_FANOUT) ||
    !positiveIntegerWithin(limits.maxItemsPerSource, MAX_ITEMS_PER_SOURCE) ||
    !positiveIntegerWithin(limits.maxTotalItems, MAX_TOTAL_ITEMS)
  ) {
    pushUnique(reasons, 'INVALID_LIMITS');
  }

  if (!Array.isArray(query.selectors) || query.selectors.length === 0) {
    pushUnique(reasons, 'NO_SELECTORS');
  } else {
    if (query.selectors.length > MAX_SELECTORS) pushUnique(reasons, 'INVALID_LIMITS');

    const uniqueAdapters = new Set(query.selectors.map((selector) => selector.adapterId));
    if (limits && uniqueAdapters.size > limits.maxSourceFanout) {
      pushUnique(reasons, 'SOURCE_FANOUT_LIMIT_EXCEEDED');
    }

    const seen = new Set<string>();
    for (const selector of query.selectors) {
      if (!CONTEXT_SOURCE_CLASSES.includes(selector.sourceClass) || !selectorIsNarrow(selector)) {
        pushUnique(reasons, 'INVALID_SELECTOR');
      }
      if (
        WHOLE_STORE_TOKENS.has(selector.key?.trim?.() ?? '') ||
        WHOLE_STORE_TOKENS.has(selector.value?.trim?.() ?? '')
      ) {
        pushUnique(reasons, 'WHOLE_STORE_SELECTOR_FORBIDDEN');
      }
      const key = selectorKey(selector);
      if (seen.has(key)) pushUnique(reasons, 'DUPLICATE_SELECTOR');
      seen.add(key);
    }
  }

  if (query.requestedFields) {
    const normalized = query.requestedFields.map((field) => field.trim());
    if (
      query.requestedFields.length > MAX_REQUESTED_FIELDS ||
      normalized.some((field) => field.length === 0 || WHOLE_STORE_TOKENS.has(field)) ||
      new Set(normalized).size !== normalized.length
    ) {
      pushUnique(reasons, 'INVALID_REQUESTED_FIELDS');
    }
  }

  return reasons.length === 0 ? { valid: true, reasons: ['VALID'] } : { valid: false, reasons };
}
