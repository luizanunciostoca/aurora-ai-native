import type {
  N8nWorkflowBinding,
  N8nWorkflowBindingLifecycleEvent,
  N8nWorkflowBindingLookup,
  N8nWorkflowBindingRegistrySnapshot,
  N8nWorkflowBindingResult,
  N8nWorkflowBindingStatus,
  N8nWorkflowBindingValidationError,
  N8nWorkflowSanitizedLineage,
} from './types.js';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const FORBIDDEN_KEYS = new Set([
  'credentials',
  'pindata',
  'secret',
  'secretvalue',
  'password',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'accountid',
]);

interface BindingRecord {
  readonly binding: N8nWorkflowBinding;
  status: N8nWorkflowBindingStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasForbiddenMaterial(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value !== 'object' || value === null) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => hasForbiddenMaterial(entry, seen));
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) return true;
    if (hasForbiddenMaterial(child, seen)) return true;
  }
  return false;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length && actual.every((key, index) => key === canonical[index]);
}

function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

function validVersion(value: unknown): value is string {
  return typeof value === 'string' && VERSION.test(value);
}

function validHash(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

function validStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => validIdentifier(entry)) &&
    new Set(value).size === value.length
  );
}

function promotable(binding: N8nWorkflowBinding): boolean {
  return (
    binding.provenance.licenseStatus !== 'REFERENCE_ONLY' &&
    binding.provenance.licenseStatus !== 'PROVENANCE_HOLD'
  );
}

function normalizeLineage(value: Record<string, unknown> | null): N8nWorkflowSanitizedLineage | null {
  if (value === null) return null;
  return Object.freeze({
    corpusReference: value.corpusReference as string,
    sourceEntryHash: value.sourceEntryHash as string,
    sanitizerVersion: value.sanitizerVersion as string,
  });
}

export function validateN8nWorkflowBinding(
  input: unknown,
): N8nWorkflowBindingResult<N8nWorkflowBinding> {
  if (hasForbiddenMaterial(input)) return { ok: false, error: 'SENSITIVE_MATERIAL_PROHIBITED' };
  if (!isRecord(input)) return { ok: false, error: 'INVALID_SCHEMA' };
  if (
    !exactKeys(input, [
      'kind',
      'bindingId',
      'bindingVersion',
      'tenantId',
      'workflow',
      'capability',
      'provenance',
      'credentialRequirements',
      'compatibility',
      'status',
      'registeredAt',
      'supersedesVersion',
      'authorizesExecution',
      'canGrantPermission',
    ])
  ) {
    return { ok: false, error: 'INVALID_SCHEMA' };
  }
  if (
    input.kind !== 'N8N_WORKFLOW_BINDING' ||
    input.authorizesExecution !== false ||
    input.canGrantPermission !== false
  ) {
    return { ok: false, error: 'INVALID_SCHEMA' };
  }
  if (!validIdentifier(input.bindingId) || !validIdentifier(input.tenantId)) {
    return { ok: false, error: 'INVALID_IDENTIFIER' };
  }
  if (!validVersion(input.bindingVersion)) return { ok: false, error: 'INVALID_VERSION' };
  if (!validTimestamp(input.registeredAt)) return { ok: false, error: 'INVALID_TIMESTAMP' };
  if (
    input.supersedesVersion !== null &&
    (!validVersion(input.supersedesVersion) || input.supersedesVersion === input.bindingVersion)
  ) {
    return { ok: false, error: 'INVALID_SUPERSESSION' };
  }
  if (input.status !== 'CANDIDATE' && input.status !== 'ACTIVE') {
    return { ok: false, error: 'INVALID_INITIAL_STATUS' };
  }

  const workflow = input.workflow;
  if (
    !isRecord(workflow) ||
    !exactKeys(workflow, ['workflowReference', 'workflowVersion', 'workflowHash'])
  ) {
    return { ok: false, error: 'INVALID_SCHEMA' };
  }
  if (!validIdentifier(workflow.workflowReference) || !validIdentifier(workflow.workflowVersion)) {
    return { ok: false, error: 'INVALID_IDENTIFIER' };
  }
  if (!validHash(workflow.workflowHash)) return { ok: false, error: 'INVALID_HASH' };

  const capability = input.capability;
  if (
    !isRecord(capability) ||
    !exactKeys(capability, ['capabilityId', 'capabilityVersion', 'registryVersion'])
  ) {
    return { ok: false, error: 'INVALID_SCHEMA' };
  }
  if (!validIdentifier(capability.capabilityId) || !validIdentifier(capability.registryVersion)) {
    return { ok: false, error: 'INVALID_IDENTIFIER' };
  }
  if (!validVersion(capability.capabilityVersion)) return { ok: false, error: 'INVALID_VERSION' };

  const provenance = input.provenance;
  if (
    !isRecord(provenance) ||
    !exactKeys(provenance, [
      'sourceKind',
      'sourceReference',
      'sourceHash',
      'licenseStatus',
      'sanitizedLineage',
    ])
  ) {
    return { ok: false, error: 'INVALID_SCHEMA' };
  }
  if (
    provenance.sourceKind !== 'AURORA_NATIVE' &&
    provenance.sourceKind !== 'SANITIZED_CORPUS' &&
    provenance.sourceKind !== 'GOVERNED_MIGRATION'
  ) {
    return { ok: false, error: 'INVALID_PROVENANCE' };
  }
  if (
    provenance.licenseStatus !== 'AURORA_OWNED' &&
    provenance.licenseStatus !== 'REFERENCE_ONLY' &&
    provenance.licenseStatus !== 'PROVENANCE_ACCEPTED' &&
    provenance.licenseStatus !== 'PROVENANCE_HOLD'
  ) {
    return { ok: false, error: 'INVALID_PROVENANCE' };
  }
  if (!validIdentifier(provenance.sourceReference) || !validHash(provenance.sourceHash)) {
    return { ok: false, error: 'INVALID_PROVENANCE' };
  }

  const rawLineage = provenance.sanitizedLineage;
  if (rawLineage !== null) {
    if (
      !isRecord(rawLineage) ||
      !exactKeys(rawLineage, ['corpusReference', 'sourceEntryHash', 'sanitizerVersion']) ||
      !validIdentifier(rawLineage.corpusReference) ||
      !validHash(rawLineage.sourceEntryHash) ||
      !validVersion(rawLineage.sanitizerVersion)
    ) {
      return { ok: false, error: 'INVALID_PROVENANCE' };
    }
  }
  if (provenance.sourceKind === 'SANITIZED_CORPUS' && rawLineage === null) {
    return { ok: false, error: 'INVALID_PROVENANCE' };
  }
  const lineage = normalizeLineage(rawLineage as Record<string, unknown> | null);

  const credentialRequirements = input.credentialRequirements;
  if (!Array.isArray(credentialRequirements)) return { ok: false, error: 'INVALID_SCHEMA' };
  const credentialKeys = new Set<string>();
  for (const requirement of credentialRequirements) {
    if (
      !isRecord(requirement) ||
      !exactKeys(requirement, ['credentialReference', 'integration']) ||
      !validIdentifier(requirement.credentialReference) ||
      !validIdentifier(requirement.integration)
    ) {
      return { ok: false, error: 'INVALID_SCHEMA' };
    }
    const key = `${requirement.integration}\u0000${requirement.credentialReference}`;
    if (credentialKeys.has(key)) return { ok: false, error: 'DUPLICATE_REQUIREMENT' };
    credentialKeys.add(key);
  }

  const compatibility = input.compatibility;
  if (
    !isRecord(compatibility) ||
    !exactKeys(compatibility, [
      'contractVersion',
      'requiredTargetClasses',
      'integrationPrerequisites',
    ])
  ) {
    return { ok: false, error: 'INVALID_SCHEMA' };
  }
  if (!validVersion(compatibility.contractVersion)) return { ok: false, error: 'INVALID_VERSION' };
  if (
    !validStringArray(compatibility.requiredTargetClasses) ||
    !validStringArray(compatibility.integrationPrerequisites)
  ) {
    return { ok: false, error: 'INVALID_IDENTIFIER' };
  }

  const normalized: N8nWorkflowBinding = Object.freeze({
    kind: 'N8N_WORKFLOW_BINDING',
    bindingId: input.bindingId,
    bindingVersion: input.bindingVersion,
    tenantId: input.tenantId,
    workflow: Object.freeze({
      workflowReference: workflow.workflowReference,
      workflowVersion: workflow.workflowVersion,
      workflowHash: workflow.workflowHash,
    }),
    capability: Object.freeze({
      capabilityId: capability.capabilityId,
      capabilityVersion: capability.capabilityVersion,
      registryVersion: capability.registryVersion,
    }),
    provenance: Object.freeze({
      sourceKind: provenance.sourceKind,
      sourceReference: provenance.sourceReference,
      sourceHash: provenance.sourceHash,
      licenseStatus: provenance.licenseStatus,
      sanitizedLineage: lineage,
    }),
    credentialRequirements: Object.freeze(
      credentialRequirements
        .map((requirement) =>
          Object.freeze({
            credentialReference: (requirement as Record<string, unknown>).credentialReference as string,
            integration: (requirement as Record<string, unknown>).integration as string,
          }),
        )
        .sort((left, right) => {
          const leftKey = `${left.integration}:${left.credentialReference}`;
          const rightKey = `${right.integration}:${right.credentialReference}`;
          return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
        }),
    ),
    compatibility: Object.freeze({
      contractVersion: compatibility.contractVersion,
      requiredTargetClasses: Object.freeze([...compatibility.requiredTargetClasses].sort()),
      integrationPrerequisites: Object.freeze([...compatibility.integrationPrerequisites].sort()),
    }),
    status: input.status,
    registeredAt: input.registeredAt,
    supersedesVersion: input.supersedesVersion,
    authorizesExecution: false,
    canGrantPermission: false,
  });

  if (normalized.status === 'ACTIVE' && !promotable(normalized)) {
    return { ok: false, error: 'INVALID_PROVENANCE' };
  }
  return { ok: true, value: normalized };
}

function recordKey(tenantId: string, bindingId: string, bindingVersion: string): string {
  return `${tenantId}\u0000${bindingId}\u0000${bindingVersion}`;
}

function familyKey(tenantId: string, bindingId: string): string {
  return `${tenantId}\u0000${bindingId}`;
}

function project(record: BindingRecord): N8nWorkflowBinding {
  if (record.binding.status === record.status) return record.binding;
  return Object.freeze({ ...record.binding, status: record.status });
}

function validateTransitionTimestamp(value: string): N8nWorkflowBindingValidationError | null {
  return validTimestamp(value) ? null : 'INVALID_TIMESTAMP';
}

export class N8nWorkflowBindingRegistry {
  private readonly records = new Map<string, BindingRecord>();
  private readonly activeVersions = new Map<string, string>();
  private readonly events: N8nWorkflowBindingLifecycleEvent[] = [];
  private sequence = 0;

  register(input: unknown): N8nWorkflowBindingResult<N8nWorkflowBinding> {
    const validated = validateN8nWorkflowBinding(input);
    if (!validated.ok) return validated;
    const binding = validated.value;
    const key = recordKey(binding.tenantId, binding.bindingId, binding.bindingVersion);
    if (this.records.has(key)) return { ok: false, error: 'DUPLICATE_BINDING_VERSION' };

    if (binding.status === 'ACTIVE') {
      const supersession = this.prepareSupersession(binding);
      if (!supersession.ok) return supersession;
      if (supersession.value !== null) {
        this.transitionRecord(
          supersession.value,
          'SUPERSEDED',
          binding.registeredAt,
          `SUPERSEDED_BY:${binding.bindingVersion}`,
        );
      }
      this.activeVersions.set(familyKey(binding.tenantId, binding.bindingId), binding.bindingVersion);
    }

    const record: BindingRecord = { binding, status: binding.status };
    this.records.set(key, record);
    this.appendEvent(record, null, binding.status, binding.registeredAt, 'REGISTERED');
    return { ok: true, value: project(record) };
  }

  activate(
    tenantId: string,
    bindingId: string,
    bindingVersion: string,
    occurredAt: string,
    expectedPreviousVersion: string | null,
  ): N8nWorkflowBindingResult<N8nWorkflowBinding> {
    const timestampError = validateTransitionTimestamp(occurredAt);
    if (timestampError !== null) return { ok: false, error: timestampError };
    const record = this.records.get(recordKey(tenantId, bindingId, bindingVersion));
    if (record === undefined) return this.missingResult(tenantId, bindingId, bindingVersion);
    if (record.status !== 'CANDIDATE') return { ok: false, error: 'INVALID_LIFECYCLE_TRANSITION' };
    if (!promotable(record.binding)) return { ok: false, error: 'INVALID_PROVENANCE' };
    if (
      record.binding.supersedesVersion !== null &&
      record.binding.supersedesVersion !== expectedPreviousVersion
    ) {
      return { ok: false, error: 'INVALID_SUPERSESSION' };
    }

    const family = familyKey(tenantId, bindingId);
    const currentVersion = this.activeVersions.get(family) ?? null;
    if (currentVersion !== expectedPreviousVersion) {
      return { ok: false, error: 'INVALID_SUPERSESSION' };
    }
    if (currentVersion !== null) {
      const current = this.records.get(recordKey(tenantId, bindingId, currentVersion));
      if (current === undefined || current.status !== 'ACTIVE') {
        return { ok: false, error: 'INVALID_SUPERSESSION' };
      }
      this.transitionRecord(current, 'SUPERSEDED', occurredAt, `SUPERSEDED_BY:${bindingVersion}`);
    }

    this.transitionRecord(record, 'ACTIVE', occurredAt, 'ACTIVATED');
    this.activeVersions.set(family, bindingVersion);
    return { ok: true, value: project(record) };
  }

  disable(
    tenantId: string,
    bindingId: string,
    bindingVersion: string,
    occurredAt: string,
    reason: string,
  ): N8nWorkflowBindingResult<N8nWorkflowBinding> {
    return this.terminalTransition(
      tenantId,
      bindingId,
      bindingVersion,
      occurredAt,
      reason,
      'DISABLED',
    );
  }

  revoke(
    tenantId: string,
    bindingId: string,
    bindingVersion: string,
    occurredAt: string,
    reason: string,
  ): N8nWorkflowBindingResult<N8nWorkflowBinding> {
    return this.terminalTransition(
      tenantId,
      bindingId,
      bindingVersion,
      occurredAt,
      reason,
      'REVOKED',
    );
  }

  resolve(lookup: N8nWorkflowBindingLookup): N8nWorkflowBindingResult<N8nWorkflowBinding> {
    if (!validIdentifier(lookup.tenantId) || !validIdentifier(lookup.bindingId)) {
      return { ok: false, error: 'INVALID_IDENTIFIER' };
    }
    if (!validVersion(lookup.bindingVersion)) return { ok: false, error: 'INVALID_VERSION' };
    const record = this.records.get(recordKey(lookup.tenantId, lookup.bindingId, lookup.bindingVersion));
    if (record === undefined) {
      return this.missingResult(lookup.tenantId, lookup.bindingId, lookup.bindingVersion);
    }
    if (record.status === 'CANDIDATE') return { ok: false, error: 'STALE_BINDING' };
    if (record.status === 'SUPERSEDED') return { ok: false, error: 'SUPERSEDED_BINDING' };
    if (record.status === 'DISABLED') return { ok: false, error: 'DISABLED_BINDING' };
    if (record.status === 'REVOKED') return { ok: false, error: 'REVOKED_BINDING' };

    const activeVersion = this.activeVersions.get(familyKey(lookup.tenantId, lookup.bindingId));
    if (activeVersion !== lookup.bindingVersion) return { ok: false, error: 'STALE_BINDING' };
    const binding = project(record);
    if (
      (lookup.expectedWorkflowReference !== undefined &&
        lookup.expectedWorkflowReference !== binding.workflow.workflowReference) ||
      (lookup.expectedWorkflowVersion !== undefined &&
        lookup.expectedWorkflowVersion !== binding.workflow.workflowVersion) ||
      (lookup.expectedWorkflowHash !== undefined &&
        lookup.expectedWorkflowHash !== binding.workflow.workflowHash)
    ) {
      return { ok: false, error: 'INCOMPATIBLE_WORKFLOW' };
    }
    if (
      (lookup.expectedCapabilityId !== undefined &&
        lookup.expectedCapabilityId !== binding.capability.capabilityId) ||
      (lookup.expectedCapabilityVersion !== undefined &&
        lookup.expectedCapabilityVersion !== binding.capability.capabilityVersion) ||
      (lookup.expectedCapabilityRegistryVersion !== undefined &&
        lookup.expectedCapabilityRegistryVersion !== binding.capability.registryVersion)
    ) {
      return { ok: false, error: 'INCOMPATIBLE_CAPABILITY' };
    }
    if (
      lookup.expectedContractVersion !== undefined &&
      lookup.expectedContractVersion !== binding.compatibility.contractVersion
    ) {
      return { ok: false, error: 'INCOMPATIBLE_CONTRACT' };
    }
    return { ok: true, value: binding };
  }

  snapshot(): N8nWorkflowBindingRegistrySnapshot {
    const bindings = [...this.records.values()].map(project).sort((left, right) => {
      const leftKey = `${left.tenantId}:${left.bindingId}:${left.bindingVersion}`;
      const rightKey = `${right.tenantId}:${right.bindingId}:${right.bindingVersion}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
    return Object.freeze({
      bindings: Object.freeze(bindings),
      lifecycle: Object.freeze(this.events.map((event) => Object.freeze({ ...event }))),
      authorizesExecution: false,
      canGrantPermission: false,
    });
  }

  private prepareSupersession(
    binding: N8nWorkflowBinding,
  ): N8nWorkflowBindingResult<BindingRecord | null> {
    const family = familyKey(binding.tenantId, binding.bindingId);
    const currentVersion = this.activeVersions.get(family) ?? null;
    if (currentVersion === null) {
      if (binding.supersedesVersion !== null) return { ok: false, error: 'INVALID_SUPERSESSION' };
      return { ok: true, value: null };
    }
    if (binding.supersedesVersion !== currentVersion) {
      return { ok: false, error: 'INVALID_SUPERSESSION' };
    }
    const current = this.records.get(recordKey(binding.tenantId, binding.bindingId, currentVersion));
    if (current === undefined || current.status !== 'ACTIVE') {
      return { ok: false, error: 'INVALID_SUPERSESSION' };
    }
    return { ok: true, value: current };
  }

  private terminalTransition(
    tenantId: string,
    bindingId: string,
    bindingVersion: string,
    occurredAt: string,
    reason: string,
    nextStatus: 'DISABLED' | 'REVOKED',
  ): N8nWorkflowBindingResult<N8nWorkflowBinding> {
    const timestampError = validateTransitionTimestamp(occurredAt);
    if (timestampError !== null) return { ok: false, error: timestampError };
    if (!validIdentifier(reason)) return { ok: false, error: 'INVALID_IDENTIFIER' };
    const record = this.records.get(recordKey(tenantId, bindingId, bindingVersion));
    if (record === undefined) return this.missingResult(tenantId, bindingId, bindingVersion);
    if (record.status === 'REVOKED' || record.status === 'DISABLED') {
      return { ok: false, error: 'INVALID_LIFECYCLE_TRANSITION' };
    }
    if (record.status === 'SUPERSEDED' && nextStatus === 'DISABLED') {
      return { ok: false, error: 'INVALID_LIFECYCLE_TRANSITION' };
    }

    this.transitionRecord(record, nextStatus, occurredAt, reason);
    const family = familyKey(tenantId, bindingId);
    if (this.activeVersions.get(family) === bindingVersion) this.activeVersions.delete(family);
    return { ok: true, value: project(record) };
  }

  private transitionRecord(
    record: BindingRecord,
    nextStatus: N8nWorkflowBindingStatus,
    occurredAt: string,
    reason: string,
  ): void {
    const previous = record.status;
    record.status = nextStatus;
    this.appendEvent(record, previous, nextStatus, occurredAt, reason);
  }

  private appendEvent(
    record: BindingRecord,
    from: N8nWorkflowBindingStatus | null,
    to: N8nWorkflowBindingStatus,
    occurredAt: string,
    reason: string,
  ): void {
    this.sequence += 1;
    this.events.push(
      Object.freeze({
        sequence: this.sequence,
        tenantId: record.binding.tenantId,
        bindingId: record.binding.bindingId,
        bindingVersion: record.binding.bindingVersion,
        from,
        to,
        occurredAt,
        reason,
      }),
    );
  }

  private missingResult(
    tenantId: string,
    bindingId: string,
    bindingVersion: string,
  ): N8nWorkflowBindingResult<never> {
    const exactOtherTenant = [...this.records.values()].some(
      (record) =>
        record.binding.bindingId === bindingId &&
        record.binding.bindingVersion === bindingVersion &&
        record.binding.tenantId !== tenantId,
    );
    if (exactOtherTenant) return { ok: false, error: 'CROSS_TENANT_BINDING' };
    const sameFamily = [...this.records.values()].some(
      (record) => record.binding.bindingId === bindingId && record.binding.tenantId === tenantId,
    );
    return { ok: false, error: sameFamily ? 'STALE_BINDING' : 'UNKNOWN_BINDING' };
  }
}
