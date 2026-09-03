import type { IdentityId, TenantId } from '@aurora/contracts/ids';

import {
  type DeviceId,
  type DeviceLifecycleState,
  type DeviceRef,
  type DeviceRegistrationProvenance,
  type DeviceRegistrationRecord,
  type DeviceRegistrationRequest,
  type DeviceRegistrationResult,
  type DeviceResolutionResult,
  type DeviceReregistrationPolicy,
  type DeviceTransition,
  type DeviceTransitionRequest,
  type DeviceTransitionResult,
  type ResolveDeviceRequest,
} from './types.js';

const DEVICE_ID_PATTERN = /^dvc_[0-9A-HJKMNP-TV-Z]{26}$/u;
const TENANT_ID_PATTERN = /^ten_[0-9A-HJKMNP-TV-Z]{26}$/u;
const IDENTITY_ID_PATTERN = /^idn_[0-9A-HJKMNP-TV-Z]{26}$/u;

const DEVICE_REF_KEYS = new Set(['kind', 'deviceId', 'tenantId', 'registrationVersion']);
const PROVENANCE_KEYS = new Set(['source', 'reference', 'observedAt']);
const REGISTRATION_KEYS = new Set([
  'deviceId',
  'tenantId',
  'boundIdentityId',
  'registeredAt',
  'provenance',
  'expectedVersion',
]);
const TRANSITION_KEYS = new Set(['ref', 'expectedVersion', 'transitionedAt', 'provenance']);
const RESOLUTION_KEYS = new Set(['ref', 'boundIdentityId']);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyOwnDataProperties(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return false;
  }
  return true;
}

function ownValue(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function isRfc3339Like(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isPositiveVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

export function isDeviceId(value: unknown): value is DeviceId {
  return typeof value === 'string' && DEVICE_ID_PATTERN.test(value);
}

export function parseDeviceId(value: unknown): DeviceId {
  if (!isDeviceId(value)) throw new TypeError('Expected canonical dvc_<ULID> DeviceId');
  return value;
}

function isTenantId(value: unknown): value is TenantId {
  return typeof value === 'string' && TENANT_ID_PATTERN.test(value);
}

function isIdentityId(value: unknown): value is IdentityId {
  return typeof value === 'string' && IDENTITY_ID_PATTERN.test(value);
}

function parseDeviceRef(value: unknown): DeviceRef | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, DEVICE_REF_KEYS)) return null;
  const kind = ownValue(value, 'kind');
  const deviceId = ownValue(value, 'deviceId');
  const tenantId = ownValue(value, 'tenantId');
  const registrationVersion = ownValue(value, 'registrationVersion');
  if (
    kind !== 'AURORA_DEVICE' ||
    !isDeviceId(deviceId) ||
    !isTenantId(tenantId) ||
    !isPositiveVersion(registrationVersion)
  ) {
    return null;
  }
  return Object.freeze({ kind, deviceId, tenantId, registrationVersion });
}

function parseProvenance(value: unknown): DeviceRegistrationProvenance | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, PROVENANCE_KEYS)) return null;
  const source = ownValue(value, 'source');
  const reference = ownValue(value, 'reference');
  const observedAt = ownValue(value, 'observedAt');
  if (
    source !== 'W14_DEVICE_REGISTRATION' ||
    typeof reference !== 'string' ||
    reference.length === 0 ||
    reference.length > 256 ||
    reference.trim() !== reference ||
    !isRfc3339Like(observedAt)
  ) {
    return null;
  }
  return Object.freeze({ source, reference, observedAt });
}

function registrationFailure(
  error: Exclude<DeviceRegistrationResult, { ok: true }>['error'],
): DeviceRegistrationResult {
  return { ok: false, error, authorizesExecution: false };
}

function transitionFailure(
  error: Exclude<DeviceTransitionResult, { ok: true }>['error'],
): DeviceTransitionResult {
  return { ok: false, error, authorizesExecution: false };
}

function resolutionFailure(
  error: Exclude<DeviceResolutionResult, { ok: true }>['error'],
): DeviceResolutionResult {
  return { ok: false, error, authorizesExecution: false, canGrantPermission: false };
}

function makeRecord(input: {
  readonly deviceId: DeviceId;
  readonly tenantId: TenantId;
  readonly boundIdentityId?: IdentityId;
  readonly state: DeviceLifecycleState;
  readonly registeredAt: string;
  readonly updatedAt: string;
  readonly registrationVersion: number;
  readonly provenance: DeviceRegistrationProvenance;
}): DeviceRegistrationRecord {
  const ref: DeviceRef = Object.freeze({
    kind: 'AURORA_DEVICE',
    deviceId: input.deviceId,
    tenantId: input.tenantId,
    registrationVersion: input.registrationVersion,
  });
  return Object.freeze({
    kind: 'DeviceRegistrationRecord',
    schemaVersion: '1.0.0',
    ref,
    ...(input.boundIdentityId === undefined ? {} : { boundIdentityId: input.boundIdentityId }),
    state: input.state,
    registeredAt: input.registeredAt,
    updatedAt: input.updatedAt,
    provenance: input.provenance,
    authoritySemantics: 'DEVICE_REGISTRATION_ONLY_NO_ACTION_AUTHORITY',
    authorizesExecution: false,
    canGrantPermission: false,
  });
}

function parseRegistrationRequest(request: DeviceRegistrationRequest):
  | {
      readonly ok: true;
      readonly deviceId: DeviceId;
      readonly tenantId: TenantId;
      readonly boundIdentityId?: IdentityId;
      readonly registeredAt: string;
      readonly provenance: DeviceRegistrationProvenance;
      readonly expectedVersion?: number;
    }
  | { readonly ok: false; readonly error: DeviceRegistrationResult extends infer _T ? string : never } {
  if (!isPlainRecord(request) || !hasOnlyOwnDataProperties(request, REGISTRATION_KEYS)) {
    return { ok: false, error: 'REQUEST_MALFORMED' };
  }
  const deviceId = ownValue(request, 'deviceId');
  if (!isDeviceId(deviceId)) return { ok: false, error: 'DEVICE_ID_INVALID' };
  const tenantId = ownValue(request, 'tenantId');
  if (!isTenantId(tenantId)) return { ok: false, error: 'TENANT_ID_INVALID' };
  const boundIdentityId = ownValue(request, 'boundIdentityId');
  if (boundIdentityId !== undefined && !isIdentityId(boundIdentityId)) {
    return { ok: false, error: 'IDENTITY_ID_INVALID' };
  }
  const registeredAt = ownValue(request, 'registeredAt');
  if (!isRfc3339Like(registeredAt)) return { ok: false, error: 'REQUEST_MALFORMED' };
  const provenance = parseProvenance(ownValue(request, 'provenance'));
  if (provenance === null || Date.parse(provenance.observedAt) > Date.parse(registeredAt)) {
    return { ok: false, error: 'PROVENANCE_INVALID' };
  }
  const expectedVersion = ownValue(request, 'expectedVersion');
  if (expectedVersion !== undefined && !isPositiveVersion(expectedVersion)) {
    return { ok: false, error: 'REQUEST_MALFORMED' };
  }
  return {
    ok: true,
    deviceId,
    tenantId,
    ...(boundIdentityId === undefined ? {} : { boundIdentityId }),
    registeredAt,
    provenance,
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
  };
}

function nextState(current: DeviceLifecycleState, transition: DeviceTransition): DeviceLifecycleState | null {
  if (transition === 'ACTIVATE') return current === 'REGISTERED' ? 'ACTIVE' : null;
  if (transition === 'REVOKE') {
    return current === 'REGISTERED' || current === 'ACTIVE' ? 'REVOKED' : null;
  }
  if (transition === 'MARK_COMPROMISED') {
    return current === 'RETIRED' || current === 'COMPROMISED' ? null : 'COMPROMISED';
  }
  return current === 'RETIRED' ? null : 'RETIRED';
}

export class InMemoryDeviceRegistry {
  readonly #records = new Map<DeviceId, DeviceRegistrationRecord>();
  readonly #reregistrationPolicy: DeviceReregistrationPolicy;

  constructor(
    reregistrationPolicy: DeviceReregistrationPolicy = 'DENY_AFTER_REVOCATION',
  ) {
    this.#reregistrationPolicy = reregistrationPolicy;
  }

  register(request: DeviceRegistrationRequest): DeviceRegistrationResult {
    const parsed = parseRegistrationRequest(request);
    if (!parsed.ok) {
      return registrationFailure(
        parsed.error as Exclude<DeviceRegistrationResult, { ok: true }>['error'],
      );
    }

    const existing = this.#records.get(parsed.deviceId);
    if (!existing) {
      if (parsed.expectedVersion !== undefined) return registrationFailure('STALE_VERSION');
      const record = makeRecord({
        deviceId: parsed.deviceId,
        tenantId: parsed.tenantId,
        ...(parsed.boundIdentityId === undefined
          ? {}
          : { boundIdentityId: parsed.boundIdentityId }),
        state: 'REGISTERED',
        registeredAt: parsed.registeredAt,
        updatedAt: parsed.registeredAt,
        registrationVersion: 1,
        provenance: parsed.provenance,
      });
      this.#records.set(parsed.deviceId, record);
      return { ok: true, disposition: 'REGISTERED', record, authorizesExecution: false };
    }

    if (existing.ref.tenantId !== parsed.tenantId) return registrationFailure('CROSS_TENANT');
    if (existing.boundIdentityId !== parsed.boundIdentityId) {
      return registrationFailure('IDENTITY_BINDING_MISMATCH');
    }
    if (
      parsed.expectedVersion !== undefined &&
      parsed.expectedVersion !== existing.ref.registrationVersion
    ) {
      return registrationFailure('STALE_VERSION');
    }
    if (existing.state === 'COMPROMISED') return registrationFailure('DEVICE_COMPROMISED');
    if (existing.state === 'RETIRED') return registrationFailure('DEVICE_RETIRED');
    if (existing.state !== 'REVOKED') {
      return {
        ok: true,
        disposition: 'ALREADY_REGISTERED',
        record: existing,
        authorizesExecution: false,
      };
    }
    if (this.#reregistrationPolicy !== 'ALLOW_SAME_BINDING_AFTER_REVOCATION') {
      return registrationFailure('REREGISTRATION_DENIED');
    }
    if (parsed.expectedVersion === undefined) return registrationFailure('STALE_VERSION');
    if (Date.parse(parsed.registeredAt) < Date.parse(existing.updatedAt)) {
      return registrationFailure('REQUEST_MALFORMED');
    }

    const record = makeRecord({
      deviceId: parsed.deviceId,
      tenantId: parsed.tenantId,
      ...(parsed.boundIdentityId === undefined
        ? {}
        : { boundIdentityId: parsed.boundIdentityId }),
      state: 'REGISTERED',
      registeredAt: existing.registeredAt,
      updatedAt: parsed.registeredAt,
      registrationVersion: existing.ref.registrationVersion + 1,
      provenance: parsed.provenance,
    });
    this.#records.set(parsed.deviceId, record);
    return { ok: true, disposition: 'REREGISTERED', record, authorizesExecution: false };
  }

  transition(
    transition: DeviceTransition,
    request: DeviceTransitionRequest,
  ): DeviceTransitionResult {
    if (!isPlainRecord(request) || !hasOnlyOwnDataProperties(request, TRANSITION_KEYS)) {
      return transitionFailure('REQUEST_MALFORMED');
    }
    const ref = parseDeviceRef(ownValue(request, 'ref'));
    if (ref === null) return transitionFailure('DEVICE_REF_INVALID');
    const expectedVersion = ownValue(request, 'expectedVersion');
    const transitionedAt = ownValue(request, 'transitionedAt');
    const provenance = parseProvenance(ownValue(request, 'provenance'));
    if (
      !isPositiveVersion(expectedVersion) ||
      !isRfc3339Like(transitionedAt) ||
      provenance === null ||
      Date.parse(provenance.observedAt) > Date.parse(transitionedAt)
    ) {
      return transitionFailure('REQUEST_MALFORMED');
    }

    const existing = this.#records.get(ref.deviceId);
    if (!existing) return transitionFailure('DEVICE_NOT_FOUND');
    if (existing.ref.tenantId !== ref.tenantId) return transitionFailure('CROSS_TENANT');
    if (
      existing.ref.registrationVersion !== ref.registrationVersion ||
      existing.ref.registrationVersion !== expectedVersion
    ) {
      return transitionFailure('STALE_VERSION');
    }
    if (Date.parse(transitionedAt) < Date.parse(existing.updatedAt)) {
      return transitionFailure('REQUEST_MALFORMED');
    }

    const state = nextState(existing.state, transition);
    if (state === null) return transitionFailure('TRANSITION_NOT_ALLOWED');
    const record = makeRecord({
      deviceId: existing.ref.deviceId,
      tenantId: existing.ref.tenantId,
      ...(existing.boundIdentityId === undefined
        ? {}
        : { boundIdentityId: existing.boundIdentityId }),
      state,
      registeredAt: existing.registeredAt,
      updatedAt: transitionedAt,
      registrationVersion: existing.ref.registrationVersion + 1,
      provenance,
    });
    this.#records.set(existing.ref.deviceId, record);
    return { ok: true, transition, record, authorizesExecution: false };
  }

  resolve(request: ResolveDeviceRequest): DeviceResolutionResult {
    if (!isPlainRecord(request) || !hasOnlyOwnDataProperties(request, RESOLUTION_KEYS)) {
      return resolutionFailure('REQUEST_MALFORMED');
    }
    const ref = parseDeviceRef(ownValue(request, 'ref'));
    if (ref === null) return resolutionFailure('DEVICE_REF_INVALID');
    const boundIdentityId = ownValue(request, 'boundIdentityId');
    if (boundIdentityId !== undefined && !isIdentityId(boundIdentityId)) {
      return resolutionFailure('REQUEST_MALFORMED');
    }

    const existing = this.#records.get(ref.deviceId);
    if (!existing) return resolutionFailure('DEVICE_NOT_FOUND');
    if (existing.ref.tenantId !== ref.tenantId) return resolutionFailure('CROSS_TENANT');
    if (existing.ref.registrationVersion !== ref.registrationVersion) {
      return resolutionFailure('STALE_VERSION');
    }
    if (boundIdentityId !== undefined && existing.boundIdentityId !== boundIdentityId) {
      return resolutionFailure('IDENTITY_BINDING_MISMATCH');
    }
    if (existing.state === 'REGISTERED') return resolutionFailure('DEVICE_NOT_ACTIVE');
    if (existing.state === 'REVOKED') return resolutionFailure('DEVICE_REVOKED');
    if (existing.state === 'COMPROMISED') return resolutionFailure('DEVICE_COMPROMISED');
    if (existing.state === 'RETIRED') return resolutionFailure('DEVICE_RETIRED');
    return {
      ok: true,
      record: existing,
      authorizesExecution: false,
      canGrantPermission: false,
    };
  }
}
