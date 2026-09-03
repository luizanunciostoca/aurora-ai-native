import type { CorrelationId, TenantId } from '@aurora/contracts';

export const ORGANIC_PUBLICATION_KINDS = ['POST', 'STORY', 'REEL'] as const;
export type OrganicPublicationKind = (typeof ORGANIC_PUBLICATION_KINDS)[number];

export const ORGANIC_PUBLICATION_STATES = [
  'DRAFT',
  'PREPARED',
  'SCHEDULED',
  'DISPATCH_REQUESTED',
  'CANCELLED',
] as const;
export type OrganicPublicationState = (typeof ORGANIC_PUBLICATION_STATES)[number];

export type OrganicPublicationCommand = 'PREPARE' | 'SCHEDULE' | 'REQUEST_DISPATCH' | 'CANCEL';

export interface OrganicPublicationCreateInput {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly publicationId: string;
  readonly kind: OrganicPublicationKind;
  readonly accountReference: string;
  readonly providerBindingReference: string;
  readonly mediaReferences: readonly string[];
  readonly caption?: string;
  readonly evaluatedAt: string;
  readonly initialState?: 'DRAFT' | 'PREPARED' | 'SCHEDULED';
  readonly scheduledAt?: string;
  readonly idempotencyKey: string;
  readonly operationId: string;
}

export interface OrganicPublicationTransitionInput {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly record: OrganicPublicationRecord;
  readonly command: OrganicPublicationCommand;
  readonly expectedRevision: number;
  readonly evaluatedAt: string;
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly scheduledAt?: string;
}

/** Structural projection of the accepted W03 durable timer boundary. */
export interface W11PublicationTimerProjection {
  readonly source: 'W03_TIMER';
  readonly tenantId: TenantId;
  readonly timerName: 'w11.organic-publication';
  readonly scheduleKey: string;
  readonly scheduledFor: string;
  readonly metadata: Readonly<{
    publicationId: string;
    revision: number;
    correlationId: CorrelationId;
  }>;
  readonly authorizesExecution: false;
}

/**
 * Request projection for W07. It carries an action candidate only; W07 still owns
 * current authority, execution proof, idempotency reservation, uncertainty and retry.
 */
export interface W11PublicationW07RequestProjection {
  readonly source: 'W07_EXECUTOR';
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly publicationId: string;
  readonly action: 'social.publish';
  readonly providerBindingReference: string;
  readonly accountReference: string;
  readonly idempotencyKey: string;
  readonly requiresCurrentAuthority: true;
  readonly requiresW08ProviderBinding: true;
  readonly authorizesExecution: false;
}

export interface OrganicPublicationRecord {
  readonly kind: 'OrganicPublicationRecord';
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly publicationId: string;
  readonly publicationKind: OrganicPublicationKind;
  readonly accountReference: string;
  readonly providerBindingReference: string;
  readonly mediaReferences: readonly string[];
  readonly caption?: string;
  readonly state: OrganicPublicationState;
  readonly revision: number;
  readonly scheduledAt?: string;
  readonly idempotencyKey: string;
  readonly lastOperationId: string;
  readonly lastOperationSignature: string;
  readonly timer?: W11PublicationTimerProjection;
  readonly w07ExecutionRequest?: W11PublicationW07RequestProjection;
  readonly pausedSafe: boolean;
  readonly authorizesExecution: false;
}

export type OrganicPublicationBlockCode =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_EVALUATION_TIME'
  | 'MISSING_ACCOUNT_BINDING'
  | 'MISSING_MEDIA'
  | 'DUPLICATE_MEDIA_REFERENCE'
  | 'INVALID_SCHEDULE_TIME'
  | 'SCHEDULE_NOT_FUTURE'
  | 'CONTEXT_MISMATCH'
  | 'STALE_REVISION'
  | 'OPERATION_ID_CONFLICT'
  | 'ILLEGAL_TRANSITION'
  | 'NOT_DUE'
  | 'TERMINAL_CANCELLED';

export type OrganicPublicationResult =
  | Readonly<{
      status: 'APPLIED' | 'REPLAY' | 'ALREADY_CANCELLED';
      record: OrganicPublicationRecord;
    }>
  | Readonly<{ status: 'BLOCKED'; code: OrganicPublicationBlockCode }>;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function parseTimestamp(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hasDuplicateMedia(mediaReferences: readonly string[]): boolean {
  const normalized = mediaReferences.map((reference) => reference.trim());
  return new Set(normalized).size !== normalized.length;
}

function validateMedia(mediaReferences: readonly string[], required: boolean): OrganicPublicationBlockCode | undefined {
  if (required && mediaReferences.length === 0) return 'MISSING_MEDIA';
  if (mediaReferences.some((reference) => !nonEmpty(reference))) return 'MISSING_MEDIA';
  if (hasDuplicateMedia(mediaReferences)) return 'DUPLICATE_MEDIA_REFERENCE';
  return undefined;
}

function commandSignature(
  command: OrganicPublicationCommand | 'CREATE',
  idempotencyKey: string,
  scheduledAt?: string,
): string {
  return `${command}|${idempotencyKey.trim()}|${scheduledAt ?? ''}`;
}

function createTimer(
  tenantId: TenantId,
  correlationId: CorrelationId,
  publicationId: string,
  revision: number,
  scheduledAt: string,
): W11PublicationTimerProjection {
  return {
    source: 'W03_TIMER',
    tenantId,
    timerName: 'w11.organic-publication',
    scheduleKey: `${tenantId}:${publicationId}`,
    scheduledFor: scheduledAt,
    metadata: { publicationId, revision, correlationId },
    authorizesExecution: false,
  };
}

function createW07Request(
  record: OrganicPublicationRecord,
  idempotencyKey: string,
): W11PublicationW07RequestProjection {
  return {
    source: 'W07_EXECUTOR',
    tenantId: record.tenantId,
    correlationId: record.correlationId,
    publicationId: record.publicationId,
    action: 'social.publish',
    providerBindingReference: record.providerBindingReference,
    accountReference: record.accountReference,
    idempotencyKey,
    requiresCurrentAuthority: true,
    requiresW08ProviderBinding: true,
    authorizesExecution: false,
  };
}

function validateSchedule(
  scheduledAt: string | undefined,
  evaluatedAt: number,
): OrganicPublicationBlockCode | undefined {
  if (scheduledAt === undefined) return 'INVALID_SCHEDULE_TIME';
  const parsed = parseTimestamp(scheduledAt);
  if (parsed === undefined) return 'INVALID_SCHEDULE_TIME';
  if (parsed <= evaluatedAt) return 'SCHEDULE_NOT_FUTURE';
  return undefined;
}

/** Create a non-authoritative organic publication record. No provider call is reachable here. */
export function createOrganicPublication(input: OrganicPublicationCreateInput): OrganicPublicationResult {
  if (
    !nonEmpty(input.publicationId) ||
    !nonEmpty(input.operationId) ||
    !nonEmpty(input.idempotencyKey)
  ) {
    return { status: 'BLOCKED', code: 'INVALID_IDENTIFIER' };
  }
  if (!nonEmpty(input.accountReference) || !nonEmpty(input.providerBindingReference)) {
    return { status: 'BLOCKED', code: 'MISSING_ACCOUNT_BINDING' };
  }

  const evaluatedAt = parseTimestamp(input.evaluatedAt);
  if (evaluatedAt === undefined) return { status: 'BLOCKED', code: 'INVALID_EVALUATION_TIME' };

  const state = input.initialState ?? 'DRAFT';
  const mediaError = validateMedia(input.mediaReferences, state !== 'DRAFT');
  if (mediaError !== undefined) return { status: 'BLOCKED', code: mediaError };

  if (state === 'SCHEDULED') {
    const scheduleError = validateSchedule(input.scheduledAt, evaluatedAt);
    if (scheduleError !== undefined) return { status: 'BLOCKED', code: scheduleError };
  }

  const revision = 1;
  const timer =
    state === 'SCHEDULED' && input.scheduledAt !== undefined
      ? createTimer(input.tenantId, input.correlationId, input.publicationId, revision, input.scheduledAt)
      : undefined;

  return {
    status: 'APPLIED',
    record: {
      kind: 'OrganicPublicationRecord',
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      publicationId: input.publicationId,
      publicationKind: input.kind,
      accountReference: input.accountReference,
      providerBindingReference: input.providerBindingReference,
      mediaReferences: [...input.mediaReferences],
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
      state,
      revision,
      ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
      idempotencyKey: input.idempotencyKey,
      lastOperationId: input.operationId,
      lastOperationSignature: commandSignature('CREATE', input.idempotencyKey, input.scheduledAt),
      ...(timer !== undefined ? { timer } : {}),
      pausedSafe: true,
      authorizesExecution: false,
    },
  };
}

/**
 * Apply one deterministic lifecycle command. Dispatch creates only a W07 request projection;
 * it cannot invoke Meta/Instagram or bypass current authority validation.
 */
export function transitionOrganicPublication(
  input: OrganicPublicationTransitionInput,
): OrganicPublicationResult {
  const record = input.record;
  if (record.tenantId !== input.tenantId || record.correlationId !== input.correlationId) {
    return { status: 'BLOCKED', code: 'CONTEXT_MISMATCH' };
  }
  if (!nonEmpty(input.operationId) || !nonEmpty(input.idempotencyKey)) {
    return { status: 'BLOCKED', code: 'INVALID_IDENTIFIER' };
  }

  const evaluatedAt = parseTimestamp(input.evaluatedAt);
  if (evaluatedAt === undefined) return { status: 'BLOCKED', code: 'INVALID_EVALUATION_TIME' };

  const signature = commandSignature(input.command, input.idempotencyKey, input.scheduledAt);
  if (record.lastOperationId === input.operationId) {
    return record.lastOperationSignature === signature
      ? { status: 'REPLAY', record }
      : { status: 'BLOCKED', code: 'OPERATION_ID_CONFLICT' };
  }
  if (input.expectedRevision !== record.revision) {
    return { status: 'BLOCKED', code: 'STALE_REVISION' };
  }
  if (record.state === 'CANCELLED') {
    return input.command === 'CANCEL'
      ? { status: 'ALREADY_CANCELLED', record }
      : { status: 'BLOCKED', code: 'TERMINAL_CANCELLED' };
  }

  if (input.command === 'PREPARE') {
    if (record.state !== 'DRAFT') return { status: 'BLOCKED', code: 'ILLEGAL_TRANSITION' };
    const mediaError = validateMedia(record.mediaReferences, true);
    if (mediaError !== undefined) return { status: 'BLOCKED', code: mediaError };

    return {
      status: 'APPLIED',
      record: {
        ...record,
        state: 'PREPARED',
        revision: record.revision + 1,
        idempotencyKey: input.idempotencyKey,
        lastOperationId: input.operationId,
        lastOperationSignature: signature,
        pausedSafe: true,
        authorizesExecution: false,
      },
    };
  }

  if (input.command === 'SCHEDULE') {
    if (record.state !== 'PREPARED') return { status: 'BLOCKED', code: 'ILLEGAL_TRANSITION' };
    const scheduleError = validateSchedule(input.scheduledAt, evaluatedAt);
    if (scheduleError !== undefined) return { status: 'BLOCKED', code: scheduleError };
    const scheduledAt = input.scheduledAt;
    if (scheduledAt === undefined) return { status: 'BLOCKED', code: 'INVALID_SCHEDULE_TIME' };
    const revision = record.revision + 1;

    return {
      status: 'APPLIED',
      record: {
        ...record,
        state: 'SCHEDULED',
        revision,
        scheduledAt,
        idempotencyKey: input.idempotencyKey,
        lastOperationId: input.operationId,
        lastOperationSignature: signature,
        timer: createTimer(record.tenantId, record.correlationId, record.publicationId, revision, scheduledAt),
        pausedSafe: true,
        authorizesExecution: false,
      },
    };
  }

  if (input.command === 'CANCEL') {
    if (record.state === 'DISPATCH_REQUESTED') {
      return { status: 'BLOCKED', code: 'ILLEGAL_TRANSITION' };
    }
    return {
      status: 'APPLIED',
      record: {
        ...record,
        state: 'CANCELLED',
        revision: record.revision + 1,
        idempotencyKey: input.idempotencyKey,
        lastOperationId: input.operationId,
        lastOperationSignature: signature,
        timer: undefined,
        scheduledAt: undefined,
        pausedSafe: true,
        authorizesExecution: false,
      } as OrganicPublicationRecord,
    };
  }

  if (record.state !== 'PREPARED' && record.state !== 'SCHEDULED') {
    return { status: 'BLOCKED', code: 'ILLEGAL_TRANSITION' };
  }
  if (record.state === 'SCHEDULED') {
    const scheduledAt = record.scheduledAt === undefined ? undefined : parseTimestamp(record.scheduledAt);
    if (scheduledAt === undefined || evaluatedAt < scheduledAt) {
      return { status: 'BLOCKED', code: 'NOT_DUE' };
    }
  }

  const revision = record.revision + 1;
  const next: OrganicPublicationRecord = {
    ...record,
    state: 'DISPATCH_REQUESTED',
    revision,
    idempotencyKey: input.idempotencyKey,
    lastOperationId: input.operationId,
    lastOperationSignature: signature,
    timer: undefined,
    w07ExecutionRequest: createW07Request(record, input.idempotencyKey),
    pausedSafe: false,
    authorizesExecution: false,
  } as OrganicPublicationRecord;

  return { status: 'APPLIED', record: next };
}
