import type { CorrelationId, TenantId } from '@aurora/contracts';
import type {
  OrganicPublicationRecord,
  W11PublicationW07RequestProjection,
} from './publication-scheduling.js';

export type W11PublicationProviderState =
  | 'READY_FOR_W07'
  | 'READBACK_REQUIRED'
  | 'EFFECT_OBSERVED'
  | 'NO_EFFECT_CONFIRMED'
  | 'FAILED_CLOSED';

export type W11PublicationProviderBlockCode =
  | 'INVALID_TIME'
  | 'NOT_DISPATCH_REQUESTED'
  | 'MISSING_MEDIA'
  | 'W07_REQUEST_MISMATCH'
  | 'CONTEXT_MISMATCH'
  | 'ACCOUNT_MISMATCH'
  | 'PROVIDER_BINDING_MISMATCH'
  | 'ATTEMPT_CONFLICT'
  | 'READBACK_REQUIRED_BEFORE_RETRY'
  | 'READBACK_MISMATCH'
  | 'PROVIDER_PROTOCOL_VIOLATION';

export interface W11PublicationProviderExecutionPlan {
  readonly kind: 'W11_PUBLICATION_PROVIDER_EXECUTION_PLAN';
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly accountReference: string;
  readonly providerBindingReference: string;
  readonly idempotencyKey: string;
  readonly attemptId: string;
  readonly state: 'READY_FOR_W07';
  readonly executeVia: 'W07';
  readonly requiresW08ProviderWrite: true;
  readonly requiresW08ReadbackOnAmbiguity: true;
  readonly retryAuthorized: false;
  readonly authorizesExecution: false;
}

export interface W11PublicationProviderRecord {
  readonly kind: 'W11_PUBLICATION_PROVIDER_RECORD';
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly accountReference: string;
  readonly providerBindingReference: string;
  readonly idempotencyKey: string;
  readonly attemptId: string;
  readonly state: W11PublicationProviderState;
  readonly providerPostReference?: string;
  readonly providerRevision?: string;
  readonly observedAt?: string;
  readonly failureCode?: string;
  readonly retryAuthorized: false;
  readonly authorizesExecution: false;
}

export interface W11ProviderWriteObservation {
  readonly accountReference: string;
  readonly providerBindingReference: string;
  readonly ok: boolean;
  readonly providerReference?: string;
  readonly providerRevision?: string;
  readonly requiresReadback?: boolean;
  readonly error?: string;
  readonly mutationPossible?: boolean;
}

export type W11ProviderReadbackStatus =
  'OBSERVED' | 'NO_EFFECT_CONFIRMED' | 'NOT_FOUND' | 'DUPLICATE' | 'PENDING' | 'DELAYED';

export interface W11ProviderReadbackObservation {
  readonly accountReference: string;
  readonly providerBindingReference: string;
  readonly status: W11ProviderReadbackStatus;
  readonly observedAt: string;
  readonly providerReference?: string;
  readonly providerRevision?: string;
}

export type W11PublicationProviderPlanResult =
  | Readonly<{
      status: 'PLANNED';
      plan: W11PublicationProviderExecutionPlan;
    }>
  | Readonly<{
      status: 'REPLAY';
      record: W11PublicationProviderRecord;
    }>
  | Readonly<{
      status: 'BLOCKED';
      code: W11PublicationProviderBlockCode;
    }>;

export type W11PublicationProviderReconcileResult =
  | Readonly<{
      status: 'RECONCILED';
      record: W11PublicationProviderRecord;
    }>
  | Readonly<{
      status: 'BLOCKED';
      code: W11PublicationProviderBlockCode;
    }>;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function validTime(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function sameW07Request(
  record: OrganicPublicationRecord,
  request: W11PublicationW07RequestProjection,
): boolean {
  return (
    request.source === 'W07_EXECUTOR' &&
    request.tenantId === record.tenantId &&
    request.correlationId === record.correlationId &&
    request.publicationId === record.publicationId &&
    request.action === 'social.publish' &&
    request.accountReference === record.accountReference &&
    request.providerBindingReference === record.providerBindingReference &&
    request.idempotencyKey === record.idempotencyKey &&
    request.requiresCurrentAuthority === true &&
    request.requiresW08ProviderBinding === true &&
    request.authorizesExecution === false
  );
}

function samePlanScope(
  plan: W11PublicationProviderExecutionPlan,
  observation: W11ProviderWriteObservation | W11ProviderReadbackObservation,
): W11PublicationProviderBlockCode | undefined {
  if (observation.accountReference !== plan.accountReference) return 'ACCOUNT_MISMATCH';
  if (observation.providerBindingReference !== plan.providerBindingReference) {
    return 'PROVIDER_BINDING_MISMATCH';
  }
  return undefined;
}

function recordFrom(
  plan: W11PublicationProviderExecutionPlan,
  state: W11PublicationProviderState,
  values: Readonly<{
    providerPostReference?: string;
    providerRevision?: string;
    observedAt?: string;
    failureCode?: string;
  }> = {},
): W11PublicationProviderRecord {
  return {
    kind: 'W11_PUBLICATION_PROVIDER_RECORD',
    tenantId: plan.tenantId,
    correlationId: plan.correlationId,
    publicationId: plan.publicationId,
    publicationRevision: plan.publicationRevision,
    accountReference: plan.accountReference,
    providerBindingReference: plan.providerBindingReference,
    idempotencyKey: plan.idempotencyKey,
    attemptId: plan.attemptId,
    state,
    ...(values.providerPostReference !== undefined
      ? { providerPostReference: values.providerPostReference }
      : {}),
    ...(values.providerRevision !== undefined ? { providerRevision: values.providerRevision } : {}),
    ...(values.observedAt !== undefined ? { observedAt: values.observedAt } : {}),
    ...(values.failureCode !== undefined ? { failureCode: values.failureCode } : {}),
    retryAuthorized: false,
    authorizesExecution: false,
  };
}

export function planPublicationProviderExecution(
  input: Readonly<{
    record: OrganicPublicationRecord;
    evaluatedAt: string;
    attemptId: string;
    previous?: W11PublicationProviderRecord;
  }>,
): W11PublicationProviderPlanResult {
  const { record } = input;
  if (!validTime(input.evaluatedAt) || !nonEmpty(input.attemptId)) {
    return { status: 'BLOCKED', code: 'INVALID_TIME' };
  }
  if (record.state !== 'DISPATCH_REQUESTED' || record.w07ExecutionRequest === undefined) {
    return { status: 'BLOCKED', code: 'NOT_DISPATCH_REQUESTED' };
  }
  if (
    record.mediaReferences.length === 0 ||
    record.mediaReferences.some((value) => !nonEmpty(value))
  ) {
    return { status: 'BLOCKED', code: 'MISSING_MEDIA' };
  }
  if (!sameW07Request(record, record.w07ExecutionRequest)) {
    return { status: 'BLOCKED', code: 'W07_REQUEST_MISMATCH' };
  }

  const previous = input.previous;
  if (previous !== undefined) {
    if (
      previous.tenantId !== record.tenantId ||
      previous.correlationId !== record.correlationId ||
      previous.publicationId !== record.publicationId ||
      previous.publicationRevision !== record.revision ||
      previous.accountReference !== record.accountReference ||
      previous.providerBindingReference !== record.providerBindingReference
    ) {
      return { status: 'BLOCKED', code: 'CONTEXT_MISMATCH' };
    }
    if (previous.attemptId === input.attemptId) {
      return previous.idempotencyKey === record.idempotencyKey
        ? { status: 'REPLAY', record: previous }
        : { status: 'BLOCKED', code: 'ATTEMPT_CONFLICT' };
    }
    if (previous.state === 'READBACK_REQUIRED' || previous.state === 'EFFECT_OBSERVED') {
      return { status: 'BLOCKED', code: 'READBACK_REQUIRED_BEFORE_RETRY' };
    }
  }

  return {
    status: 'PLANNED',
    plan: {
      kind: 'W11_PUBLICATION_PROVIDER_EXECUTION_PLAN',
      tenantId: record.tenantId,
      correlationId: record.correlationId,
      publicationId: record.publicationId,
      publicationRevision: record.revision,
      accountReference: record.accountReference,
      providerBindingReference: record.providerBindingReference,
      idempotencyKey: record.idempotencyKey,
      attemptId: input.attemptId,
      state: 'READY_FOR_W07',
      executeVia: 'W07',
      requiresW08ProviderWrite: true,
      requiresW08ReadbackOnAmbiguity: true,
      retryAuthorized: false,
      authorizesExecution: false,
    },
  };
}

export function reconcilePublicationProviderExecution(
  input: Readonly<{
    plan: W11PublicationProviderExecutionPlan;
    write: W11ProviderWriteObservation;
    readback?: W11ProviderReadbackObservation;
  }>,
): W11PublicationProviderReconcileResult {
  const writeScopeError = samePlanScope(input.plan, input.write);
  if (writeScopeError !== undefined) return { status: 'BLOCKED', code: writeScopeError };

  if (!input.write.ok) {
    if (input.write.error === undefined || input.write.mutationPossible === undefined) {
      return { status: 'BLOCKED', code: 'PROVIDER_PROTOCOL_VIOLATION' };
    }
    if (input.write.mutationPossible) {
      if (input.readback === undefined) {
        return {
          status: 'RECONCILED',
          record: recordFrom(input.plan, 'READBACK_REQUIRED', {
            ...(input.write.providerReference !== undefined
              ? { providerPostReference: input.write.providerReference }
              : {}),
            failureCode: input.write.error,
          }),
        };
      }
    } else {
      return {
        status: 'RECONCILED',
        record: recordFrom(input.plan, 'FAILED_CLOSED', { failureCode: input.write.error }),
      };
    }
  } else if (input.write.requiresReadback !== true) {
    if (input.write.providerReference === undefined || !nonEmpty(input.write.providerReference)) {
      return { status: 'BLOCKED', code: 'PROVIDER_PROTOCOL_VIOLATION' };
    }
    return {
      status: 'RECONCILED',
      record: recordFrom(input.plan, 'EFFECT_OBSERVED', {
        providerPostReference: input.write.providerReference,
        ...(input.write.providerRevision !== undefined
          ? { providerRevision: input.write.providerRevision }
          : {}),
      }),
    };
  } else if (input.readback === undefined) {
    return {
      status: 'RECONCILED',
      record: recordFrom(input.plan, 'READBACK_REQUIRED', {
        ...(input.write.providerReference !== undefined
          ? { providerPostReference: input.write.providerReference }
          : {}),
        ...(input.write.providerRevision !== undefined
          ? { providerRevision: input.write.providerRevision }
          : {}),
      }),
    };
  }

  const readback = input.readback;
  if (readback === undefined) {
    return { status: 'BLOCKED', code: 'PROVIDER_PROTOCOL_VIOLATION' };
  }
  const readbackScopeError = samePlanScope(input.plan, readback);
  if (readbackScopeError !== undefined) return { status: 'BLOCKED', code: readbackScopeError };
  if (!validTime(readback.observedAt)) return { status: 'BLOCKED', code: 'READBACK_MISMATCH' };

  if (readback.status === 'OBSERVED' || readback.status === 'DUPLICATE') {
    const reference = readback.providerReference ?? input.write.providerReference;
    if (reference === undefined || !nonEmpty(reference)) {
      return { status: 'BLOCKED', code: 'PROVIDER_PROTOCOL_VIOLATION' };
    }
    return {
      status: 'RECONCILED',
      record: recordFrom(input.plan, 'EFFECT_OBSERVED', {
        providerPostReference: reference,
        ...(readback.providerRevision !== undefined
          ? { providerRevision: readback.providerRevision }
          : {}),
        observedAt: readback.observedAt,
      }),
    };
  }

  if (readback.status === 'NO_EFFECT_CONFIRMED' || readback.status === 'NOT_FOUND') {
    return {
      status: 'RECONCILED',
      record: recordFrom(input.plan, 'NO_EFFECT_CONFIRMED', {
        observedAt: readback.observedAt,
      }),
    };
  }

  return {
    status: 'RECONCILED',
    record: recordFrom(input.plan, 'READBACK_REQUIRED', {
      ...(readback.providerReference !== undefined
        ? { providerPostReference: readback.providerReference }
        : {}),
      ...(readback.providerRevision !== undefined
        ? { providerRevision: readback.providerRevision }
        : {}),
      observedAt: readback.observedAt,
    }),
  };
}
