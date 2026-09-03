import { validateN8nWorkflowBinding, type N8nWorkflowBinding } from '../bindings/index.js';
import {
  N8N_W07_FORWARDING_STATES,
  N8N_WORKFLOW_RUN_STATES,
  type N8nW07EvidenceReferenceForwarding,
  type N8nW07ForwardingState,
  type N8nWorkflowEvidenceChain,
  type N8nWorkflowEvidenceChainResult,
  type N8nWorkflowEvidenceProvenance,
  type N8nWorkflowForwardingError,
  type N8nWorkflowForwardingEvent,
  type N8nWorkflowForwardingResult,
  type N8nWorkflowRunState,
  type N8nWorkflowStatusForwarding,
} from './types.js';

const BASE_KEYS = [
  'schemaVersion',
  'forwardingId',
  'sequence',
  'tenantId',
  'bindingId',
  'bindingVersion',
  'workflowReference',
  'workflowVersion',
  'workflowHash',
  'workflowRunReference',
  'correlationId',
  'causationId',
  'occurredAt',
  'provenance',
  'authorizesExecution',
  'verifiedExternalState',
  'canGrantRetry',
] as const;
const STATUS_KEYS = new Set([
  ...BASE_KEYS,
  'kind',
  'workflowState',
  'safeOutputReferences',
  'errorReference',
]);
const W07_KEYS = new Set([
  ...BASE_KEYS,
  'kind',
  'w07State',
  'receiptReference',
  'evidenceReference',
]);
const PROVENANCE_KEYS = new Set([
  'bindingSourceKind',
  'bindingSourceReference',
  'bindingSourceHash',
  'bindingLicenseStatus',
]);
const REQUEST_KEYS = new Set(['binding', 'event']);
const FORBIDDEN_KEYS = new Set([
  'credential',
  'credentials',
  'credentialvalue',
  'secret',
  'secretvalue',
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'pindata',
  'authorization',
  'rawoutput',
  'rawerror',
  'rawproviderdata',
  'privateoutput',
  'privateerror',
  'reasoning',
  'chainofthought',
  'accountid',
  'provideraccountid',
  'externalaccountid',
]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const MAX_SAFE_REFERENCES = 32;
const MAX_CHAIN_EVENTS = 1024;

function fail(
  error: N8nWorkflowForwardingError,
): Extract<N8nWorkflowForwardingResult, { ok: false }> {
  return {
    ok: false,
    error,
    authorizesExecution: false,
    verifiedExternalState: false,
    canGrantRetry: false,
  };
}

function chainFail(
  error: N8nWorkflowForwardingError,
): Extract<N8nWorkflowEvidenceChainResult, { ok: false }> {
  return {
    ok: false,
    error,
    authorizesExecution: false,
    verifiedExternalState: false,
    canGrantRetry: false,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasOnlyOwnDataProperties(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  try {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !allowed.has(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function ownValue(value: Record<string, unknown>, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function isPlainDataTree(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== 'object') return typeof value !== 'function';
  if (seen.has(value)) return true;
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (key === 'length') continue;
        if (!('value' in descriptor) || !isPlainDataTree(descriptor.value, seen)) return false;
      }
      return Object.getOwnPropertySymbols(value).length === 0;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || !isPlainDataTree(descriptor.value, seen)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function hasSensitiveMaterial(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);

  try {
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (key !== 'length' && FORBIDDEN_KEYS.has(key.toLowerCase())) return true;
      if ('value' in descriptor && hasSensitiveMaterial(descriptor.value, seen)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

function isVersion(value: unknown): value is string {
  return typeof value === 'string' && VERSION.test(value);
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

function isRunState(value: unknown): value is N8nWorkflowRunState {
  return (
    typeof value === 'string' && N8N_WORKFLOW_RUN_STATES.includes(value as N8nWorkflowRunState)
  );
}

function isW07State(value: unknown): value is N8nW07ForwardingState {
  return (
    typeof value === 'string' && N8N_W07_FORWARDING_STATES.includes(value as N8nW07ForwardingState)
  );
}

function validReferenceArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_SAFE_REFERENCES &&
    value.every((entry) => isIdentifier(entry)) &&
    new Set(value).size === value.length
  );
}

function parseProvenance(value: unknown): N8nWorkflowEvidenceProvenance | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, PROVENANCE_KEYS)) return null;
  const bindingSourceKind = ownValue(value, 'bindingSourceKind');
  const bindingSourceReference = ownValue(value, 'bindingSourceReference');
  const bindingSourceHash = ownValue(value, 'bindingSourceHash');
  const bindingLicenseStatus = ownValue(value, 'bindingLicenseStatus');

  if (
    (bindingSourceKind !== 'AURORA_NATIVE' &&
      bindingSourceKind !== 'SANITIZED_CORPUS' &&
      bindingSourceKind !== 'GOVERNED_MIGRATION') ||
    !isIdentifier(bindingSourceReference) ||
    !isHash(bindingSourceHash) ||
    (bindingLicenseStatus !== 'AURORA_OWNED' &&
      bindingLicenseStatus !== 'REFERENCE_ONLY' &&
      bindingLicenseStatus !== 'PROVENANCE_ACCEPTED' &&
      bindingLicenseStatus !== 'PROVENANCE_HOLD')
  ) {
    return null;
  }

  return Object.freeze({
    bindingSourceKind,
    bindingSourceReference,
    bindingSourceHash,
    bindingLicenseStatus,
  });
}

function normalizeEvent(binding: N8nWorkflowBinding, input: unknown): N8nWorkflowForwardingResult {
  if (!isPlainDataTree(input)) return fail('EVENT_MALFORMED');
  if (hasSensitiveMaterial(input)) return fail('SENSITIVE_MATERIAL_PROHIBITED');
  if (!isPlainRecord(input)) return fail('EVENT_MALFORMED');

  const kind = ownValue(input, 'kind');
  const allowed =
    kind === 'N8N_WORKFLOW_STATUS_FORWARDING'
      ? STATUS_KEYS
      : kind === 'N8N_W07_EVIDENCE_REFERENCE_FORWARDING'
        ? W07_KEYS
        : null;
  if (allowed === null || !hasOnlyOwnDataProperties(input, allowed)) return fail('EVENT_MALFORMED');

  const schemaVersion = ownValue(input, 'schemaVersion');
  const forwardingId = ownValue(input, 'forwardingId');
  const sequence = ownValue(input, 'sequence');
  const tenantId = ownValue(input, 'tenantId');
  const bindingId = ownValue(input, 'bindingId');
  const bindingVersion = ownValue(input, 'bindingVersion');
  const workflowReference = ownValue(input, 'workflowReference');
  const workflowVersion = ownValue(input, 'workflowVersion');
  const workflowHash = ownValue(input, 'workflowHash');
  const workflowRunReference = ownValue(input, 'workflowRunReference');
  const correlationId = ownValue(input, 'correlationId');
  const causationId = ownValue(input, 'causationId');
  const occurredAt = ownValue(input, 'occurredAt');
  const provenance = parseProvenance(ownValue(input, 'provenance'));
  const authorizesExecution = ownValue(input, 'authorizesExecution');
  const verifiedExternalState = ownValue(input, 'verifiedExternalState');
  const canGrantRetry = ownValue(input, 'canGrantRetry');

  if (
    !isVersion(schemaVersion) ||
    !isIdentifier(forwardingId) ||
    !Number.isSafeInteger(sequence) ||
    (sequence as number) < 1 ||
    !isIdentifier(tenantId) ||
    !isIdentifier(bindingId) ||
    !isVersion(bindingVersion) ||
    !isIdentifier(workflowReference) ||
    !isIdentifier(workflowVersion) ||
    !isHash(workflowHash) ||
    !isIdentifier(workflowRunReference) ||
    !isIdentifier(correlationId) ||
    (causationId !== null && !isIdentifier(causationId)) ||
    !isTimestamp(occurredAt) ||
    provenance === null ||
    authorizesExecution !== false ||
    verifiedExternalState !== false ||
    canGrantRetry !== false
  ) {
    return fail('EVENT_MALFORMED');
  }

  if (Date.parse(occurredAt) < Date.parse(binding.registeredAt)) return fail('EVENT_MALFORMED');
  if (tenantId !== binding.tenantId) return fail('TENANT_MISMATCH');
  if (bindingId !== binding.bindingId || bindingVersion !== binding.bindingVersion) {
    return fail('BINDING_MISMATCH');
  }
  if (
    workflowReference !== binding.workflow.workflowReference ||
    workflowVersion !== binding.workflow.workflowVersion ||
    workflowHash !== binding.workflow.workflowHash
  ) {
    return fail('WORKFLOW_MISMATCH');
  }
  if (
    provenance.bindingSourceKind !== binding.provenance.sourceKind ||
    provenance.bindingSourceReference !== binding.provenance.sourceReference ||
    provenance.bindingSourceHash !== binding.provenance.sourceHash ||
    provenance.bindingLicenseStatus !== binding.provenance.licenseStatus
  ) {
    return fail('PROVENANCE_MISMATCH');
  }

  const base = {
    schemaVersion,
    forwardingId,
    sequence: sequence as number,
    tenantId,
    bindingId,
    bindingVersion,
    workflowReference,
    workflowVersion,
    workflowHash,
    workflowRunReference,
    correlationId,
    causationId,
    occurredAt,
    provenance,
    authorizesExecution: false as const,
    verifiedExternalState: false as const,
    canGrantRetry: false as const,
  };

  if (kind === 'N8N_WORKFLOW_STATUS_FORWARDING') {
    const workflowState = ownValue(input, 'workflowState');
    const safeOutputReferences = ownValue(input, 'safeOutputReferences');
    const errorReference = ownValue(input, 'errorReference');
    if (
      !isRunState(workflowState) ||
      !validReferenceArray(safeOutputReferences) ||
      (errorReference !== null && !isIdentifier(errorReference))
    ) {
      return fail('EVENT_MALFORMED');
    }
    if (
      (workflowState === 'STARTED' || workflowState === 'CANCELLED') &&
      (safeOutputReferences.length !== 0 || errorReference !== null)
    ) {
      return fail('EVENT_MALFORMED');
    }
    if (workflowState === 'COMPLETED' && errorReference !== null) return fail('EVENT_MALFORMED');
    if (
      (workflowState === 'FAILED' || workflowState === 'EXECUTION_UNCERTAIN') &&
      errorReference === null
    ) {
      return fail('EVENT_MALFORMED');
    }

    const event: N8nWorkflowStatusForwarding = Object.freeze({
      ...base,
      kind,
      workflowState,
      safeOutputReferences: Object.freeze([...safeOutputReferences]),
      errorReference,
    });
    return Object.freeze({
      ok: true,
      event,
      authorizesExecution: false,
      verifiedExternalState: false,
      canGrantRetry: false,
    });
  }

  const w07State = ownValue(input, 'w07State');
  const receiptReference = ownValue(input, 'receiptReference');
  const evidenceReference = ownValue(input, 'evidenceReference');
  if (
    !isW07State(w07State) ||
    !isIdentifier(receiptReference) ||
    (evidenceReference !== null && !isIdentifier(evidenceReference))
  ) {
    return fail('EVENT_MALFORMED');
  }
  if (w07State === 'ACKNOWLEDGED' && evidenceReference !== null) {
    return fail('ACKNOWLEDGEMENT_EVIDENCE_CONFLICT');
  }
  if (w07State !== 'ACKNOWLEDGED' && evidenceReference === null) {
    return fail('READBACK_EVIDENCE_REQUIRED');
  }

  const event: N8nW07EvidenceReferenceForwarding = Object.freeze({
    ...base,
    kind: 'N8N_W07_EVIDENCE_REFERENCE_FORWARDING',
    w07State,
    receiptReference,
    evidenceReference,
  });
  return Object.freeze({
    ok: true,
    event,
    authorizesExecution: false,
    verifiedExternalState: false,
    canGrantRetry: false,
  });
}

export function normalizeN8nWorkflowForwarding(request: unknown): N8nWorkflowForwardingResult {
  if (!isPlainDataTree(request)) return fail('REQUEST_MALFORMED');
  if (hasSensitiveMaterial(request)) return fail('SENSITIVE_MATERIAL_PROHIBITED');
  if (!isPlainRecord(request) || !hasOnlyOwnDataProperties(request, REQUEST_KEYS)) {
    return fail('REQUEST_MALFORMED');
  }

  const bindingResult = validateN8nWorkflowBinding(ownValue(request, 'binding'));
  if (!bindingResult.ok) return fail('BINDING_MALFORMED');
  if (bindingResult.value.status !== 'ACTIVE') return fail('BINDING_UNAVAILABLE');
  return normalizeEvent(bindingResult.value, ownValue(request, 'event'));
}

function eventFingerprint(event: N8nWorkflowForwardingEvent): string {
  return JSON.stringify(event);
}

function sameChainContext(
  left: N8nWorkflowForwardingEvent,
  right: N8nWorkflowForwardingEvent,
): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.bindingId === right.bindingId &&
    left.bindingVersion === right.bindingVersion &&
    left.workflowReference === right.workflowReference &&
    left.workflowVersion === right.workflowVersion &&
    left.workflowHash === right.workflowHash &&
    left.workflowRunReference === right.workflowRunReference &&
    left.correlationId === right.correlationId
  );
}

export function reconstructN8nWorkflowEvidenceChain(
  bindingInput: unknown,
  eventsInput: unknown,
): N8nWorkflowEvidenceChainResult {
  const bindingResult = validateN8nWorkflowBinding(bindingInput);
  if (!bindingResult.ok) return chainFail('BINDING_MALFORMED');
  const binding = bindingResult.value;
  if (binding.status !== 'ACTIVE') return chainFail('BINDING_UNAVAILABLE');
  if (!Array.isArray(eventsInput) || eventsInput.length === 0) return chainFail('EMPTY_CHAIN');
  if (eventsInput.length > MAX_CHAIN_EVENTS) return chainFail('EVENT_MALFORMED');

  const byId = new Map<string, N8nWorkflowForwardingEvent>();
  for (const rawEvent of eventsInput) {
    const normalized = normalizeEvent(binding, rawEvent);
    if (!normalized.ok) return chainFail(normalized.error);
    const prior = byId.get(normalized.event.forwardingId);
    if (prior !== undefined) {
      if (eventFingerprint(prior) !== eventFingerprint(normalized.event)) {
        return chainFail('DUPLICATE_EVENT_CONFLICT');
      }
      continue;
    }
    byId.set(normalized.event.forwardingId, normalized.event);
  }

  const ordered = [...byId.values()].sort((left, right) => left.sequence - right.sequence);
  if (ordered.length === 0) return chainFail('EMPTY_CHAIN');

  const sequenceOwners = new Map<number, string>();
  for (const event of ordered) {
    const owner = sequenceOwners.get(event.sequence);
    if (owner !== undefined && owner !== event.forwardingId) return chainFail('SEQUENCE_CONFLICT');
    sequenceOwners.set(event.sequence, event.forwardingId);
  }
  for (let index = 0; index < ordered.length; index += 1) {
    const event = ordered[index];
    if (event === undefined || event.sequence !== index + 1) return chainFail('SEQUENCE_GAP');
  }

  const first = ordered[0];
  if (first === undefined) return chainFail('EMPTY_CHAIN');
  for (const event of ordered) {
    if (!sameChainContext(first, event)) return chainFail('CHAIN_CONTEXT_MISMATCH');
  }
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const event = ordered[index];
    if (
      previous === undefined ||
      event === undefined ||
      event.causationId !== previous.forwardingId
    ) {
      return chainFail('CHAIN_CONTEXT_MISMATCH');
    }
  }

  let currentWorkflowState: N8nWorkflowRunState | null = null;
  for (const event of ordered) {
    if (event.kind === 'N8N_W07_EVIDENCE_REFERENCE_FORWARDING') {
      if (currentWorkflowState === null) return chainFail('WORKFLOW_STATE_REGRESSION');
      continue;
    }
    if (currentWorkflowState === null) {
      if (event.workflowState !== 'STARTED') return chainFail('WORKFLOW_STATE_REGRESSION');
      currentWorkflowState = 'STARTED';
      continue;
    }
    if (currentWorkflowState !== 'STARTED' || event.workflowState === 'STARTED') {
      return chainFail('WORKFLOW_STATE_REGRESSION');
    }
    currentWorkflowState = event.workflowState;
  }

  if (currentWorkflowState === null) return chainFail('WORKFLOW_STATE_REGRESSION');
  const w07References = ordered.filter(
    (event): event is N8nW07EvidenceReferenceForwarding =>
      event.kind === 'N8N_W07_EVIDENCE_REFERENCE_FORWARDING',
  );
  const last = ordered[ordered.length - 1];
  if (last === undefined) return chainFail('EMPTY_CHAIN');

  const chain: N8nWorkflowEvidenceChain = Object.freeze({
    tenantId: first.tenantId,
    bindingId: first.bindingId,
    bindingVersion: first.bindingVersion,
    workflowReference: first.workflowReference,
    workflowVersion: first.workflowVersion,
    workflowHash: first.workflowHash,
    workflowRunReference: first.workflowRunReference,
    correlationId: first.correlationId,
    currentWorkflowState,
    lastSequence: last.sequence,
    events: Object.freeze([...ordered]),
    w07References: Object.freeze([...w07References]),
    authorizesExecution: false,
    verifiedExternalState: false,
    canGrantRetry: false,
  });
  return Object.freeze({ ok: true, chain });
}
