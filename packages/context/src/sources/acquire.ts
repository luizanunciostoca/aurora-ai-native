import type { DataClassification, SubjectRef } from '@aurora/contracts/context';

import { validateContextQuery } from '../query/validate.js';
import type { ContextSelector } from '../query/types.js';
import type {
  AcquiredContextItem,
  ContextAcquisitionRequest,
  ContextAcquisitionResult,
  ContextSourceAdapter,
  ContextSourceItem,
  ContextSourceRejection,
} from './types.js';

const CLASSIFICATION_ORDER: Readonly<Record<DataClassification, number>> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
};

const MAX_ADAPTER_ITEMS_PER_READ = 1000;

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sameSubject(a: SubjectRef, b: SubjectRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'IDENTITY' && b.kind === 'IDENTITY') return a.identityId === b.identityId;
  if (a.kind === 'EXTERNAL_IDENTITY' && b.kind === 'EXTERNAL_IDENTITY') {
    return (
      a.externalIdentity.provider === b.externalIdentity.provider &&
      a.externalIdentity.externalId === b.externalIdentity.externalId
    );
  }
  return false;
}

function classificationAllowed(item: DataClassification, max: DataClassification): boolean {
  return CLASSIFICATION_ORDER[item] <= CLASSIFICATION_ORDER[max];
}

function adapterMatches(
  adapters: readonly ContextSourceAdapter[],
  selector: ContextSelector,
): readonly ContextSourceAdapter[] {
  return adapters.filter((adapter) => adapter.descriptor.adapterId === selector.adapterId);
}

function validAdapterLimit(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= MAX_ADAPTER_ITEMS_PER_READ;
}

function validateItem(
  item: ContextSourceItem,
  request: ContextAcquisitionRequest,
): ContextSourceRejection['reason'] | undefined {
  if (
    !item ||
    !nonEmptyString(item.sourceReference) ||
    !item.tenant ||
    !nonEmptyString(item.tenant.tenantId) ||
    !nonEmptyString(item.observedAt) ||
    item.payload === undefined ||
    (item.sourceRevision !== undefined && !nonEmptyString(item.sourceRevision))
  ) {
    return 'INVALID_SOURCE_ITEM';
  }
  if (item.tenant.tenantId !== request.query.tenant.tenantId) return 'CROSS_TENANT_ITEM';
  if (request.query.subject && item.subject && !sameSubject(request.query.subject, item.subject)) {
    return 'SUBJECT_MISMATCH';
  }
  if (!classificationAllowed(item.classification, request.query.maxDataClassification)) {
    return 'CLASSIFICATION_EXCEEDED';
  }
  if (!nonEmptyString(item.provenanceReference)) return 'MISSING_PROVENANCE';
  return undefined;
}

/**
 * Execute only bounded read-only adapter calls. The result is acquisition
 * evidence for later W06 ranking/freshness processing and can never authorize
 * execution.
 */
export async function acquireContextCandidates(
  request: ContextAcquisitionRequest,
): Promise<ContextAcquisitionResult> {
  const validation = validateContextQuery(request.query);
  if (!validation.valid) {
    return {
      kind: 'ContextAcquisitionResult',
      items: [],
      rejections: [{ reason: 'QUERY_INVALID' }],
      attemptedSelectors: 0,
      invokedAdapters: [],
      authorizesExecution: false,
    };
  }

  const accepted: AcquiredContextItem[] = [];
  const rejections: ContextSourceRejection[] = [];
  const invokedAdapters: string[] = [];

  for (const selector of request.query.selectors) {
    const matches = adapterMatches(request.adapters, selector);
    if (matches.length === 0) {
      rejections.push({ selector, adapterId: selector.adapterId, reason: 'ADAPTER_NOT_FOUND' });
      continue;
    }
    if (matches.length > 1) {
      rejections.push({ selector, adapterId: selector.adapterId, reason: 'ADAPTER_AMBIGUOUS' });
      continue;
    }

    const adapter = matches[0];
    if (!adapter) {
      rejections.push({ selector, adapterId: selector.adapterId, reason: 'ADAPTER_NOT_FOUND' });
      continue;
    }

    const descriptor = adapter.descriptor;
    if (descriptor.readOnly !== true) {
      rejections.push({
        selector,
        adapterId: descriptor.adapterId,
        reason: 'ADAPTER_NOT_READ_ONLY',
      });
      continue;
    }
    if (descriptor.sourceClass !== selector.sourceClass) {
      rejections.push({
        selector,
        adapterId: descriptor.adapterId,
        reason: 'SOURCE_CLASS_MISMATCH',
      });
      continue;
    }
    if (!descriptor.supportedSelectorKeys.includes(selector.key)) {
      rejections.push({
        selector,
        adapterId: descriptor.adapterId,
        reason: 'SELECTOR_UNSUPPORTED',
      });
      continue;
    }
    if (!validAdapterLimit(descriptor.maxItemsPerRead)) {
      rejections.push({
        selector,
        adapterId: descriptor.adapterId,
        reason: 'ADAPTER_LIMIT_INVALID',
      });
      continue;
    }

    const limit = Math.min(request.query.limits.maxItemsPerSource, descriptor.maxItemsPerRead);
    if (!invokedAdapters.includes(descriptor.adapterId)) invokedAdapters.push(descriptor.adapterId);

    let result;
    try {
      result = await adapter.read({
        schemaVersion: request.query.schemaVersion,
        tenant: request.query.tenant,
        correlation: request.query.correlation,
        actor: request.query.actor,
        ...(request.query.subject === undefined ? {} : { subject: request.query.subject }),
        purpose: request.query.purpose,
        jurisdiction: request.query.jurisdiction,
        ...(request.query.consent === undefined ? {} : { consent: request.query.consent }),
        maxDataClassification: request.query.maxDataClassification,
        currentness: request.query.currentness,
        selector,
        ...(request.query.requestedFields === undefined
          ? {}
          : { requestedFields: request.query.requestedFields }),
        ...(request.query.deadline === undefined ? {} : { deadline: request.query.deadline }),
        limit,
      });
    } catch {
      rejections.push({ selector, adapterId: descriptor.adapterId, reason: 'ADAPTER_ERROR' });
      continue;
    }

    if (!result || !Array.isArray(result.items)) {
      rejections.push({ selector, adapterId: descriptor.adapterId, reason: 'ADAPTER_ERROR' });
      continue;
    }
    if (result.items.length > limit) {
      rejections.push({
        selector,
        adapterId: descriptor.adapterId,
        reason: 'ITEM_LIMIT_EXCEEDED',
      });
      continue;
    }
    if (accepted.length + result.items.length > request.query.limits.maxTotalItems) {
      rejections.push({
        selector,
        adapterId: descriptor.adapterId,
        reason: 'TOTAL_ITEM_LIMIT_EXCEEDED',
      });
      continue;
    }

    for (const item of result.items) {
      const reason = validateItem(item, request);
      if (reason) {
        rejections.push({
          selector,
          adapterId: descriptor.adapterId,
          ...(nonEmptyString(item?.sourceReference)
            ? { sourceReference: item.sourceReference }
            : {}),
          reason,
        });
        continue;
      }
      accepted.push({
        ...item,
        adapterId: descriptor.adapterId,
        sourceClass: descriptor.sourceClass,
      });
    }
  }

  return {
    kind: 'ContextAcquisitionResult',
    items: accepted,
    rejections,
    attemptedSelectors: request.query.selectors.length,
    invokedAdapters,
    authorizesExecution: false,
  };
}
