import type { N8nWorkflowBinding } from '../bindings/types.js';

export const N8N_TRIGGER_KINDS = ['EVENT', 'WEBHOOK', 'SCHEDULE'] as const;
export type N8nTriggerKind = (typeof N8N_TRIGGER_KINDS)[number];

export interface N8nTriggerEnvelope {
  readonly kind: 'N8N_TRIGGER_ENVELOPE';
  readonly triggerKind: N8nTriggerKind;
  readonly tenantId: string;
  readonly bindingId: string;
  readonly bindingVersion: string;
  readonly triggerId: string;
  readonly sourceStream: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly idempotencyKey: string;
  readonly sequence: number | null;
  readonly observedAt: string;
  readonly scheduledFor: string | null;
  readonly payloadHash: string;
  readonly provenanceReference: string;
}

export interface N8nGovernedExecutionRequest {
  readonly kind: 'N8N_GOVERNED_EXECUTION_REQUEST';
  readonly requestReference: string;
  readonly tenantId: string;
  readonly bindingId: string;
  readonly bindingVersion: string;
  readonly workflowReference: string;
  readonly workflowVersion: string;
  readonly workflowHash: string;
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly capabilityRegistryVersion: string;
  readonly triggerKind: N8nTriggerKind;
  readonly triggerId: string;
  readonly sourceStream: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly idempotencyKey: string;
  readonly sequence: number | null;
  readonly observedAt: string;
  readonly scheduledFor: string | null;
  readonly payloadHash: string;
  readonly provenanceReference: string;
  readonly executionBoundary: 'W07_EXECUTOR_REQUIRED';
  readonly requiresW07Execution: true;
  readonly directSideEffect: false;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export type N8nTriggerBridgeBlockCode =
  | 'INVALID_TRIGGER'
  | 'INVALID_IDENTIFIER'
  | 'INVALID_HASH'
  | 'INVALID_TIMESTAMP'
  | 'BINDING_NOT_ACTIVE'
  | 'CROSS_TENANT_BINDING'
  | 'WRONG_BINDING'
  | 'SCHEDULE_TIME_REQUIRED'
  | 'SCHEDULE_TIME_PROHIBITED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'STALE_OR_REORDERED_SEQUENCE';

export type N8nTriggerBridgeResult =
  | { readonly status: 'ACCEPTED'; readonly request: N8nGovernedExecutionRequest }
  | { readonly status: 'DUPLICATE'; readonly request: N8nGovernedExecutionRequest }
  | { readonly status: 'BLOCKED'; readonly code: N8nTriggerBridgeBlockCode };

interface ReplayReceipt {
  readonly fingerprint: string;
  readonly request: N8nGovernedExecutionRequest;
}

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function validTimestamp(value: string): boolean {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function validSequence(value: number | null): boolean {
  return value === null || (Number.isSafeInteger(value) && value > 0);
}

function replayKey(trigger: N8nTriggerEnvelope): string {
  return [trigger.tenantId, trigger.bindingId, trigger.bindingVersion, trigger.idempotencyKey].join(
    '\u0000',
  );
}

function streamKey(trigger: N8nTriggerEnvelope): string {
  return [trigger.tenantId, trigger.bindingId, trigger.bindingVersion, trigger.sourceStream].join(
    '\u0000',
  );
}

function fingerprint(trigger: N8nTriggerEnvelope): string {
  return JSON.stringify([
    trigger.triggerKind,
    trigger.triggerId,
    trigger.sourceStream,
    trigger.correlationId,
    trigger.causationId,
    trigger.sequence,
    trigger.scheduledFor,
    trigger.payloadHash,
    trigger.provenanceReference,
  ]);
}

function validateTrigger(trigger: N8nTriggerEnvelope): N8nTriggerBridgeBlockCode | null {
  if (trigger.kind !== 'N8N_TRIGGER_ENVELOPE' || !N8N_TRIGGER_KINDS.includes(trigger.triggerKind)) {
    return 'INVALID_TRIGGER';
  }
  if (
    !nonEmpty(trigger.tenantId) ||
    !nonEmpty(trigger.bindingId) ||
    !nonEmpty(trigger.bindingVersion) ||
    !nonEmpty(trigger.triggerId) ||
    !nonEmpty(trigger.sourceStream) ||
    !nonEmpty(trigger.correlationId) ||
    !nonEmpty(trigger.idempotencyKey) ||
    !nonEmpty(trigger.provenanceReference) ||
    (trigger.causationId !== null && !nonEmpty(trigger.causationId))
  ) {
    return 'INVALID_IDENTIFIER';
  }
  if (!HASH_PATTERN.test(trigger.payloadHash)) return 'INVALID_HASH';
  if (!validTimestamp(trigger.observedAt)) return 'INVALID_TIMESTAMP';
  if (!validSequence(trigger.sequence)) return 'INVALID_TRIGGER';

  if (trigger.triggerKind === 'SCHEDULE') {
    if (trigger.scheduledFor === null) return 'SCHEDULE_TIME_REQUIRED';
    if (!validTimestamp(trigger.scheduledFor)) return 'INVALID_TIMESTAMP';
  } else if (trigger.scheduledFor !== null) {
    return 'SCHEDULE_TIME_PROHIBITED';
  }

  return null;
}

function buildRequest(
  binding: N8nWorkflowBinding,
  trigger: N8nTriggerEnvelope,
): N8nGovernedExecutionRequest {
  return Object.freeze({
    kind: 'N8N_GOVERNED_EXECUTION_REQUEST',
    requestReference: `w09b:${binding.bindingId}:${binding.bindingVersion}:${trigger.triggerId}`,
    tenantId: trigger.tenantId,
    bindingId: binding.bindingId,
    bindingVersion: binding.bindingVersion,
    workflowReference: binding.workflow.workflowReference,
    workflowVersion: binding.workflow.workflowVersion,
    workflowHash: binding.workflow.workflowHash,
    capabilityId: binding.capability.capabilityId,
    capabilityVersion: binding.capability.capabilityVersion,
    capabilityRegistryVersion: binding.capability.registryVersion,
    triggerKind: trigger.triggerKind,
    triggerId: trigger.triggerId,
    sourceStream: trigger.sourceStream,
    correlationId: trigger.correlationId,
    causationId: trigger.causationId,
    idempotencyKey: trigger.idempotencyKey,
    sequence: trigger.sequence,
    observedAt: trigger.observedAt,
    scheduledFor: trigger.scheduledFor,
    payloadHash: trigger.payloadHash,
    provenanceReference: trigger.provenanceReference,
    executionBoundary: 'W07_EXECUTOR_REQUIRED',
    requiresW07Execution: true,
    directSideEffect: false,
    authorizesExecution: false,
    canGrantPermission: false,
  });
}

/**
 * W09-B normalizes workflow triggers into replay-safe requests for the canonical W07 executor.
 * It never performs provider side effects and never upgrades workflow/session state into authority.
 */
export class N8nTriggerBridge {
  readonly #replays = new Map<string, ReplayReceipt>();
  readonly #sequenceWatermarks = new Map<string, number>();

  ingest(binding: N8nWorkflowBinding, trigger: N8nTriggerEnvelope): N8nTriggerBridgeResult {
    const validationError = validateTrigger(trigger);
    if (validationError) return { status: 'BLOCKED', code: validationError };

    if (binding.status !== 'ACTIVE') return { status: 'BLOCKED', code: 'BINDING_NOT_ACTIVE' };
    if (binding.tenantId !== trigger.tenantId) {
      return { status: 'BLOCKED', code: 'CROSS_TENANT_BINDING' };
    }
    if (
      binding.bindingId !== trigger.bindingId ||
      binding.bindingVersion !== trigger.bindingVersion
    ) {
      return { status: 'BLOCKED', code: 'WRONG_BINDING' };
    }

    const dedupeKey = replayKey(trigger);
    const nextFingerprint = fingerprint(trigger);
    const prior = this.#replays.get(dedupeKey);
    if (prior) {
      if (prior.fingerprint !== nextFingerprint) {
        return { status: 'BLOCKED', code: 'IDEMPOTENCY_CONFLICT' };
      }
      return { status: 'DUPLICATE', request: prior.request };
    }

    if (trigger.sequence !== null) {
      const key = streamKey(trigger);
      const watermark = this.#sequenceWatermarks.get(key);
      if (watermark !== undefined && trigger.sequence <= watermark) {
        return { status: 'BLOCKED', code: 'STALE_OR_REORDERED_SEQUENCE' };
      }
    }

    const request = buildRequest(binding, trigger);
    this.#replays.set(dedupeKey, { fingerprint: nextFingerprint, request });
    if (trigger.sequence !== null) {
      this.#sequenceWatermarks.set(streamKey(trigger), trigger.sequence);
    }

    return { status: 'ACCEPTED', request };
  }
}
