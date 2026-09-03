import type { CorrelationId, TenantId } from '@aurora/contracts';

import type { OrganicPublicationRecord } from './publication-scheduling.js';

export type W11BProviderSafeMode = 'NO_OP' | 'SANDBOX' | 'PAUSED';

/** Exact structural projection of the W07 proof consumed by W08. W11 never mints it. */
export interface W11BExecutionProofProjection {
  readonly kind: 'W07_PROVIDER_EXECUTION_PROOF';
  readonly actionIntentId: string;
  readonly currentAuthorityValidated: true;
  readonly executionEligible: true;
  readonly validatedAt: string;
  readonly authorizesExecution: false;
}

export interface PublicationProviderComposeInput {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly publication: OrganicPublicationRecord;
  readonly provider: string;
  readonly bindingVersion: number;
  readonly actionIntentId: string;
  readonly executionProof: W11BExecutionProofProjection;
  readonly safeMode: W11BProviderSafeMode;
  readonly evaluatedAt: string;
  readonly prior?: PublicationProviderReconciliationRecord;
}

export interface W11BProviderWriteRequestProjection {
  readonly kind: 'W11_PROVIDER_WRITE_REQUEST';
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly publicationId: string;
  readonly action: 'social.publish';
  readonly provider: string;
  readonly accountReference: string;
  readonly bindingReference: string;
  readonly bindingVersion: number;
  readonly actionIntentId: string;
  readonly idempotencyKey: string;
  readonly mediaReferences: readonly string[];
  readonly caption?: string;
  readonly safeMode: W11BProviderSafeMode;
  readonly executionProof: W11BExecutionProofProjection;
  readonly authorizesExecution: false;
  readonly retryAuthorized: false;
}

export type PublicationProviderComposeBlockCode =
  | 'REQUEST_MALFORMED'
  | 'PUBLICATION_NOT_DISPATCH_REQUESTED'
  | 'PUBLICATION_CONTEXT_MISMATCH'
  | 'PUBLICATION_BINDING_MISMATCH'
  | 'MISSING_MEDIA'
  | 'EXECUTION_PROOF_INVALID'
  | 'EXECUTION_PROOF_STALE'
  | 'DUPLICATE_DISPATCH_FENCED';

export type PublicationProviderComposeResult =
  | Readonly<{
      status: 'READY';
      request: W11BProviderWriteRequestProjection;
      authorizesExecution: false;
    }>
  | Readonly<{
      status: 'BLOCKED';
      code: PublicationProviderComposeBlockCode;
      authorizesExecution: false;
    }>;

export type W11BProviderWriteError =
  | 'REQUEST_MALFORMED'
  | 'EXECUTION_PROOF_INVALID'
  | 'DEADLINE_EXPIRED'
  | 'TARGET_BINDING_UNAVAILABLE'
  | 'IDEMPOTENCY_REQUIRED'
  | 'CREDENTIAL_UNAVAILABLE'
  | 'ADAPTER_PROTOCOL_VIOLATION'
  | 'PROVIDER_AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED'
  | 'PROVIDER_OUTAGE'
  | 'TRANSIENT_TRANSPORT_FAILURE'
  | 'PERMANENT_REQUEST_REJECTED'
  | 'CONFLICT'
  | 'AMBIGUOUS_WRITE';

export type W11BProviderWriteProjection =
  | Readonly<{
      ok: true;
      provider: string;
      accountReference: string;
      bindingReference: string;
      bindingVersion: number;
      actionIntentId: string;
      providerReference?: string;
      providerRevision?: string;
      requiresReadback: boolean;
      safeMode: W11BProviderSafeMode;
      observedAt: string;
      authorizesExecution: false;
    }>
  | Readonly<{
      ok: false;
      error: W11BProviderWriteError;
      mutationPossible: boolean;
      providerReference?: string;
      observedAt: string;
      authorizesExecution: false;
    }>;

export type W11BReadbackObservation =
  | Readonly<{ state: 'EFFECT_OBSERVED'; observedAt: string; reference?: string }>
  | Readonly<{ state: 'NO_EFFECT_CONFIRMED'; observedAt: string; reference?: string }>
  | Readonly<{
      state: 'INDETERMINATE';
      observedAt: string;
      reason: string;
      reference?: string;
    }>;

export type W11BProviderReadbackProjection =
  | Readonly<{
      ok: true;
      provider: string;
      accountReference: string;
      bindingReference: string;
      bindingVersion: number;
      actionIntentId: string;
      observation: W11BReadbackObservation;
      providerRevision?: string;
      requiresFurtherReadback: boolean;
      retryAuthorized: false;
      authorizesExecution: false;
    }>
  | Readonly<{
      ok: false;
      error: string;
      retryAuthorized: false;
      authorizesExecution: false;
    }>;

export interface ProviderExternalPostReference {
  readonly kind: 'PROVIDER_EXTERNAL_REFERENCE';
  readonly provider: string;
  readonly resourceKind: 'SOCIAL_POST';
  readonly externalId: string;
}

export type PublicationProviderReconciliationState =
  | 'ACKNOWLEDGED_UNVERIFIED'
  | 'EFFECT_OBSERVED'
  | 'NO_EFFECT_CONFIRMED'
  | 'RECONCILIATION_REQUIRED'
  | 'KNOWN_WRITE_FAILURE';

export interface PublicationProviderReconciliationRecord {
  readonly kind: 'W11_PUBLICATION_PROVIDER_RECONCILIATION';
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly publicationId: string;
  readonly actionIntentId: string;
  readonly provider: string;
  readonly accountReference: string;
  readonly bindingReference: string;
  readonly bindingVersion: number;
  readonly idempotencyKey: string;
  readonly state: PublicationProviderReconciliationState;
  readonly writeObservedAt: string;
  readonly lastObservedAt: string;
  readonly writeSignature: string;
  readonly readbackSignature?: string;
  readonly providerExternalReference?: ProviderExternalPostReference;
  readonly requiresReconciliation: boolean;
  readonly freshW07RequiredForAnyRetry: true;
  readonly retryAuthorized: false;
  readonly authorizesExecution: false;
}

export interface PublicationProviderReconcileInput {
  readonly request: W11BProviderWriteRequestProjection;
  readonly write: W11BProviderWriteProjection;
  readonly readback?: W11BProviderReadbackProjection;
  readonly previous?: PublicationProviderReconciliationRecord;
  readonly evaluatedAt: string;
}

export type PublicationProviderReconcileBlockCode =
  | 'REQUEST_MALFORMED'
  | 'PROVIDER_CONTEXT_MISMATCH'
  | 'OBSERVATION_TIME_INVALID'
  | 'OBSERVATION_TIME_ORDER_INVALID'
  | 'READBACK_REQUIRED'
  | 'READBACK_CONFLICT'
  | 'REPLAY_CONFLICT';

export type PublicationProviderReconcileResult =
  | Readonly<{
      status: 'APPLIED' | 'REPLAY';
      record: PublicationProviderReconciliationRecord;
      authorizesExecution: false;
    }>
  | Readonly<{
      status: 'BLOCKED';
      code: PublicationProviderReconcileBlockCode;
      authorizesExecution: false;
    }>;

const MAX_IDENTIFIER_LENGTH = 1_024;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0 && value.length <= MAX_IDENTIFIER_LENGTH;
}

function timestamp(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function composeBlock(code: PublicationProviderComposeBlockCode): PublicationProviderComposeResult {
  return { status: 'BLOCKED', code, authorizesExecution: false };
}

function reconcileBlock(
  code: PublicationProviderReconcileBlockCode,
): PublicationProviderReconcileResult {
  return { status: 'BLOCKED', code, authorizesExecution: false };
}

function providerContextMatches(
  request: W11BProviderWriteRequestProjection,
  provider: string,
  accountReference: string,
  bindingReference: string,
  bindingVersion: number,
  actionIntentId: string,
): boolean {
  return (
    request.provider === provider &&
    request.accountReference === accountReference &&
    request.bindingReference === bindingReference &&
    request.bindingVersion === bindingVersion &&
    request.actionIntentId === actionIntentId
  );
}

function writeSignature(write: W11BProviderWriteProjection): string {
  return write.ok
    ? [
        'OK',
        write.provider,
        write.accountReference,
        write.bindingReference,
        write.bindingVersion,
        write.actionIntentId,
        write.providerReference ?? '',
        write.providerRevision ?? '',
        write.requiresReadback,
        write.safeMode,
        write.observedAt,
      ].join('|')
    : [
        'ERROR',
        write.error,
        write.mutationPossible,
        write.providerReference ?? '',
        write.observedAt,
      ].join('|');
}

function readbackSignature(readback: W11BProviderReadbackProjection): string {
  if (!readback.ok) return `ERROR|${readback.error}`;
  return [
    readback.provider,
    readback.accountReference,
    readback.bindingReference,
    readback.bindingVersion,
    readback.actionIntentId,
    readback.observation.state,
    readback.observation.observedAt,
    readback.observation.reference ?? '',
    readback.providerRevision ?? '',
    readback.requiresFurtherReadback,
  ].join('|');
}

function externalReference(
  provider: string,
  reference: string | undefined,
): ProviderExternalPostReference | undefined {
  if (reference === undefined || !nonEmpty(reference)) return undefined;
  return {
    kind: 'PROVIDER_EXTERNAL_REFERENCE',
    provider,
    resourceKind: 'SOCIAL_POST',
    externalId: reference,
  };
}

/**
 * Compose a W08 write request only after an exact W11-A dispatch request and W07 proof exist.
 * This function never calls a provider and never grants authority itself.
 */
export function composePublicationProviderIntegration(
  input: PublicationProviderComposeInput,
): PublicationProviderComposeResult {
  if (
    !nonEmpty(input.provider) ||
    !nonEmpty(input.actionIntentId) ||
    !Number.isSafeInteger(input.bindingVersion) ||
    input.bindingVersion < 1 ||
    !['NO_OP', 'SANDBOX', 'PAUSED'].includes(input.safeMode)
  ) {
    return composeBlock('REQUEST_MALFORMED');
  }

  const evaluatedAt = timestamp(input.evaluatedAt);
  const proofAt = timestamp(input.executionProof.validatedAt);
  if (evaluatedAt === undefined || proofAt === undefined) return composeBlock('REQUEST_MALFORMED');
  if (proofAt > evaluatedAt) return composeBlock('EXECUTION_PROOF_STALE');

  const publication = input.publication;
  if (publication.tenantId !== input.tenantId || publication.correlationId !== input.correlationId) {
    return composeBlock('PUBLICATION_CONTEXT_MISMATCH');
  }
  if (publication.state !== 'DISPATCH_REQUESTED' || publication.w07ExecutionRequest === undefined) {
    return composeBlock('PUBLICATION_NOT_DISPATCH_REQUESTED');
  }
  if (publication.mediaReferences.length === 0) return composeBlock('MISSING_MEDIA');

  const dispatch = publication.w07ExecutionRequest;
  if (
    dispatch.providerBindingReference !== publication.providerBindingReference ||
    dispatch.accountReference !== publication.accountReference ||
    dispatch.idempotencyKey !== publication.idempotencyKey ||
    dispatch.action !== 'social.publish'
  ) {
    return composeBlock('PUBLICATION_BINDING_MISMATCH');
  }

  const proof = input.executionProof;
  if (
    proof.kind !== 'W07_PROVIDER_EXECUTION_PROOF' ||
    proof.currentAuthorityValidated !== true ||
    proof.executionEligible !== true ||
    proof.authorizesExecution !== false ||
    proof.actionIntentId !== input.actionIntentId
  ) {
    return composeBlock('EXECUTION_PROOF_INVALID');
  }

  if (
    input.prior !== undefined &&
    input.prior.publicationId === publication.publicationId &&
    input.prior.idempotencyKey === publication.idempotencyKey
  ) {
    return composeBlock('DUPLICATE_DISPATCH_FENCED');
  }

  return {
    status: 'READY',
    request: {
      kind: 'W11_PROVIDER_WRITE_REQUEST',
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      publicationId: publication.publicationId,
      action: 'social.publish',
      provider: input.provider,
      accountReference: publication.accountReference,
      bindingReference: publication.providerBindingReference,
      bindingVersion: input.bindingVersion,
      actionIntentId: input.actionIntentId,
      idempotencyKey: publication.idempotencyKey,
      mediaReferences: [...publication.mediaReferences],
      ...(publication.caption !== undefined ? { caption: publication.caption } : {}),
      safeMode: input.safeMode,
      executionProof: proof,
      authorizesExecution: false,
      retryAuthorized: false,
    },
    authorizesExecution: false,
  };
}

/**
 * Reconcile W08 write/readback observations. Retry eligibility remains owned by W07;
 * W11-B only preserves uncertainty and provider-owned external references.
 */
export function reconcilePublicationProviderIntegration(
  input: PublicationProviderReconcileInput,
): PublicationProviderReconcileResult {
  const evaluatedAt = timestamp(input.evaluatedAt);
  const writeAt = timestamp(input.write.observedAt);
  if (evaluatedAt === undefined || writeAt === undefined) return reconcileBlock('OBSERVATION_TIME_INVALID');
  if (writeAt > evaluatedAt) return reconcileBlock('OBSERVATION_TIME_ORDER_INVALID');

  const request = input.request;
  if (input.write.ok) {
    if (
      !providerContextMatches(
        request,
        input.write.provider,
        input.write.accountReference,
        input.write.bindingReference,
        input.write.bindingVersion,
        input.write.actionIntentId,
      ) ||
      input.write.safeMode !== request.safeMode ||
      input.write.authorizesExecution !== false
    ) {
      return reconcileBlock('PROVIDER_CONTEXT_MISMATCH');
    }
  } else if (input.write.authorizesExecution !== false) {
    return reconcileBlock('REQUEST_MALFORMED');
  }

  let readbackAt: number | undefined;
  if (input.readback !== undefined) {
    if (!input.readback.ok) {
      if (input.readback.authorizesExecution !== false || input.readback.retryAuthorized !== false) {
        return reconcileBlock('REQUEST_MALFORMED');
      }
    } else {
      if (
        !providerContextMatches(
          request,
          input.readback.provider,
          input.readback.accountReference,
          input.readback.bindingReference,
          input.readback.bindingVersion,
          input.readback.actionIntentId,
        ) ||
        input.readback.authorizesExecution !== false ||
        input.readback.retryAuthorized !== false
      ) {
        return reconcileBlock('PROVIDER_CONTEXT_MISMATCH');
      }
      readbackAt = timestamp(input.readback.observation.observedAt);
      if (readbackAt === undefined) return reconcileBlock('OBSERVATION_TIME_INVALID');
      if (readbackAt < writeAt || readbackAt > evaluatedAt) {
        return reconcileBlock('OBSERVATION_TIME_ORDER_INVALID');
      }
    }
  }

  const currentWriteSignature = writeSignature(input.write);
  const currentReadbackSignature =
    input.readback === undefined ? undefined : readbackSignature(input.readback);

  if (input.previous !== undefined) {
    const previous = input.previous;
    if (
      previous.tenantId !== request.tenantId ||
      previous.correlationId !== request.correlationId ||
      previous.publicationId !== request.publicationId ||
      previous.actionIntentId !== request.actionIntentId ||
      previous.provider !== request.provider ||
      previous.accountReference !== request.accountReference ||
      previous.bindingReference !== request.bindingReference ||
      previous.bindingVersion !== request.bindingVersion ||
      previous.idempotencyKey !== request.idempotencyKey
    ) {
      return reconcileBlock('REPLAY_CONFLICT');
    }

    if (
      previous.writeSignature === currentWriteSignature &&
      previous.readbackSignature === currentReadbackSignature
    ) {
      return { status: 'REPLAY', record: previous, authorizesExecution: false };
    }

    const previousObservedAt = timestamp(previous.lastObservedAt);
    if (previousObservedAt === undefined) return reconcileBlock('REPLAY_CONFLICT');
    if (readbackAt === undefined || readbackAt < previousObservedAt) {
      return reconcileBlock('REPLAY_CONFLICT');
    }
  }

  let state: PublicationProviderReconciliationState;
  let requiresReconciliation: boolean;
  let reference: string | undefined;

  if (!input.write.ok) {
    reference = input.write.providerReference;
    if (!input.write.mutationPossible) {
      state = 'KNOWN_WRITE_FAILURE';
      requiresReconciliation = false;
    } else if (input.readback?.ok === true) {
      if (input.readback.observation.state === 'EFFECT_OBSERVED') {
        state = 'EFFECT_OBSERVED';
        requiresReconciliation = false;
        reference = input.readback.observation.reference ?? reference;
      } else if (input.readback.observation.state === 'NO_EFFECT_CONFIRMED') {
        state = 'NO_EFFECT_CONFIRMED';
        requiresReconciliation = false;
        reference = input.readback.observation.reference ?? reference;
      } else {
        state = 'RECONCILIATION_REQUIRED';
        requiresReconciliation = true;
      }
    } else {
      state = 'RECONCILIATION_REQUIRED';
      requiresReconciliation = true;
    }
  } else {
    reference = input.write.providerReference;
    if (input.readback?.ok === true) {
      if (input.readback.observation.state === 'EFFECT_OBSERVED') {
        state = 'EFFECT_OBSERVED';
        requiresReconciliation = false;
        reference = input.readback.observation.reference ?? reference;
      } else if (input.readback.observation.state === 'NO_EFFECT_CONFIRMED') {
        state = 'NO_EFFECT_CONFIRMED';
        requiresReconciliation = false;
        reference = input.readback.observation.reference ?? reference;
      } else {
        state = 'RECONCILIATION_REQUIRED';
        requiresReconciliation = true;
      }
    } else if (input.write.requiresReadback || input.readback?.ok === false) {
      state = 'RECONCILIATION_REQUIRED';
      requiresReconciliation = true;
    } else {
      state = 'ACKNOWLEDGED_UNVERIFIED';
      requiresReconciliation = false;
    }
  }

  const lastObservedAt =
    input.readback?.ok === true ? input.readback.observation.observedAt : input.write.observedAt;
  const providerExternalReference = externalReference(request.provider, reference);

  const record: PublicationProviderReconciliationRecord = {
    kind: 'W11_PUBLICATION_PROVIDER_RECONCILIATION',
    tenantId: request.tenantId,
    correlationId: request.correlationId,
    publicationId: request.publicationId,
    actionIntentId: request.actionIntentId,
    provider: request.provider,
    accountReference: request.accountReference,
    bindingReference: request.bindingReference,
    bindingVersion: request.bindingVersion,
    idempotencyKey: request.idempotencyKey,
    state,
    writeObservedAt: input.write.observedAt,
    lastObservedAt,
    writeSignature: currentWriteSignature,
    ...(currentReadbackSignature !== undefined
      ? { readbackSignature: currentReadbackSignature }
      : {}),
    ...(providerExternalReference !== undefined ? { providerExternalReference } : {}),
    requiresReconciliation,
    freshW07RequiredForAnyRetry: true,
    retryAuthorized: false,
    authorizesExecution: false,
  };

  return { status: 'APPLIED', record, authorizesExecution: false };
}
