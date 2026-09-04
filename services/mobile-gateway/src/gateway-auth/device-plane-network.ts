import type { GatewaySessionSnapshot } from './types.js';

const DEVICE_ROUTES = new Set([
  '/v1/device/registrations/register',
  '/v1/device/registrations/activate',
  '/v1/device/sessions/open',
  '/v1/device/sessions/resume',
  '/v1/device/sessions/revoke',
  '/v1/device/commands/claim',
  '/v1/device/commands/acknowledge',
  '/v1/device/receipts/ingest',
]);

const DEVICE_ID = /^dvc_[0-9A-HJKMNP-TV-Z]{26}$/u;
const COMMAND_ID = /^cmd_[0-9A-HJKMNP-TV-Z]{26}$/u;
const EXECUTION_ID = /^exe_[0-9A-HJKMNP-TV-Z]{26}$/u;
const RECEIPT_ID = /^rcp_[0-9A-HJKMNP-TV-Z]{26}$/u;
const EVIDENCE_ID = /^evd_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SAFE_REFERENCE = /^[A-Za-z0-9._:/+-]+$/u;
const OPAQUE_PROOF = /^[A-Za-z0-9+/=_-]+$/u;
const MAX_PROOF_LENGTH = 24 * 1024;
const MAX_REFERENCE_LENGTH = 512;
const MAX_DATE_MS = 8_640_000_000_000_000;

const REGISTER_KEYS = new Set(['deviceId', 'proof', 'expectedVersion']);
const EMPTY_KEYS = new Set<string>();
const OPEN_SESSION_KEYS = new Set(['deviceSessionId', 'proof']);
const RESUME_SESSION_KEYS = new Set(['deviceSessionId', 'previousConnectionId', 'proof']);
const REVOKE_SESSION_KEYS = new Set(['reasonReference']);
const CLAIM_KEYS = new Set(['commandId']);
const ACK_KEYS = new Set(['commandId', 'deliveryReference', 'ackReference']);
const RECEIPT_KEYS = new Set([
  'receiptId',
  'evidenceId',
  'commandId',
  'executionId',
  'connectionId',
  'gatewayGeneration',
  'deliveryReference',
  'reportedState',
  'sourceReference',
  'proofReference',
  'integrityDigest',
  'capturedAtMs',
]);

export interface GatewayDevicePlaneSocketBinding {
  readonly sessionId: string;
  readonly connectionId: string;
  readonly tenantId: GatewaySessionSnapshot['tenantId'];
  readonly actorIdentityId: GatewaySessionSnapshot['actorIdentityId'];
  readonly correlationId: GatewaySessionSnapshot['correlationId'];
}

interface BoundDeviceRef {
  readonly kind: 'AURORA_DEVICE';
  readonly deviceId: string;
  readonly tenantId: string;
  readonly registrationVersion: number;
}

export interface GatewayDevicePlaneConnectionState {
  deviceRef?: BoundDeviceRef;
  registrationProofReference?: string;
  deviceSessionId?: string;
}

export interface GatewayDevicePlaneResponse {
  readonly statusCode: number;
  readonly body: unknown;
}

/**
 * Composition-only ports. Existing W14 owners remain the source of truth; this
 * adapter intentionally owns no registration, trust, command, delivery, or
 * receipt ledger.
 */
export interface GatewayDevicePlaneDependencies {
  readonly devices: object;
  readonly deviceSessions: object;
  readonly realtimeCommands: object;
  readonly deliveries: object;
  readonly receiptIngress: object;
  readonly deviceProofVerifier: object;
}

export interface GatewayDevicePlaneHandleInput {
  readonly path: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly gatewaySession: GatewaySessionSnapshot;
  readonly socketBinding: GatewayDevicePlaneSocketBinding;
  readonly connectionState: GatewayDevicePlaneConnectionState;
  readonly nowMs: number;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.values(Object.getOwnPropertyDescriptors(value)).every(
      (descriptor) => descriptor.get === undefined && descriptor.set === undefined,
    );
  } catch {
    return false;
  }
}

function hasOnlyKeys(value: Readonly<Record<string, unknown>>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function safeReference(value: unknown, maxLength = MAX_REFERENCE_LENGTH): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    SAFE_REFERENCE.test(value)
  );
}

function opaqueProof(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_PROOF_LENGTH &&
    OPAQUE_PROOF.test(value)
  );
}

function safeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function response(statusCode: number, body: unknown): GatewayDevicePlaneResponse {
  return { statusCode, body };
}

function devicePlaneError(
  statusCode: number,
  code: string,
  upstreamCode?: string,
): GatewayDevicePlaneResponse {
  return response(statusCode, {
    ok: false,
    devicePlaneError: {
      code,
      ...(upstreamCode === undefined ? {} : { upstreamCode }),
    },
    authorizesExecution: false,
    canGrantPermission: false,
  });
}

function safeUpstreamCode(value: unknown): string | undefined {
  return safeReference(value, 128) ? value : undefined;
}

function resultErrorCode(result: unknown): string | undefined {
  if (!isPlainRecord(result)) return undefined;
  const direct = result.error;
  if (typeof direct === 'string') return safeUpstreamCode(direct);
  if (!isPlainRecord(direct)) return undefined;
  return safeUpstreamCode(direct.code);
}

function nonAuthorityResult(result: unknown): boolean {
  if (!isPlainRecord(result)) return false;
  return result.authorizesExecution === false && result.canGrantPermission !== true;
}

function resultOk(result: unknown): result is Record<string, unknown> & { ok: true } {
  return isPlainRecord(result) && result.ok === true && nonAuthorityResult(result);
}

function invoke(port: object, method: string, ...args: readonly unknown[]): unknown {
  const candidate = (port as Record<string, unknown>)[method];
  if (typeof candidate !== 'function') {
    throw new Error(`Required W14 composition method is unavailable: ${method}`);
  }
  return Reflect.apply(candidate, port, args);
}

async function invokeAsync(port: object, method: string, ...args: readonly unknown[]): Promise<unknown> {
  return Promise.resolve(invoke(port, method, ...args));
}

function parseDeviceRef(value: unknown): BoundDeviceRef | null {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, new Set(['kind', 'deviceId', 'tenantId', 'registrationVersion'])) ||
    value.kind !== 'AURORA_DEVICE' ||
    typeof value.deviceId !== 'string' ||
    !DEVICE_ID.test(value.deviceId) ||
    !safeReference(value.tenantId, 128) ||
    !positiveInteger(value.registrationVersion)
  ) {
    return null;
  }
  return {
    kind: 'AURORA_DEVICE',
    deviceId: value.deviceId,
    tenantId: value.tenantId,
    registrationVersion: value.registrationVersion,
  };
}

function resultRecord(result: unknown): Record<string, unknown> | null {
  if (!resultOk(result) || !isPlainRecord(result.record)) return null;
  return result.record;
}

function resultSnapshot(result: unknown): Record<string, unknown> | null {
  if (!resultOk(result) || !isPlainRecord(result.snapshot)) return null;
  return result.snapshot;
}

function canonicalDeviceRefFromRecord(result: unknown): BoundDeviceRef | null {
  const record = resultRecord(result);
  return record === null ? null : parseDeviceRef(record.ref);
}

function canonicalRegistrationProofReference(result: unknown): string | null {
  const record = resultRecord(result);
  if (record === null || !isPlainRecord(record.provenance)) return null;
  const reference = record.provenance.reference;
  return safeReference(reference, 256) ? reference : null;
}

function validGatewayBinding(
  gateway: GatewaySessionSnapshot,
  binding: GatewayDevicePlaneSocketBinding,
  nowMs: number,
): boolean {
  return (
    gateway.state === 'OPEN' &&
    gateway.authorizesExecution === false &&
    gateway.sessionId === binding.sessionId &&
    gateway.connectionId === binding.connectionId &&
    gateway.tenantId === binding.tenantId &&
    gateway.actorIdentityId === binding.actorIdentityId &&
    gateway.correlationId === binding.correlationId &&
    gateway.generation > 0 &&
    nowMs < gateway.authExpiresAtMs
  );
}

function managerResponse(result: unknown): GatewayDevicePlaneResponse {
  if (!isPlainRecord(result) || result.authorizesExecution !== false) {
    return devicePlaneError(503, 'UPSTREAM_PROTOCOL_VIOLATION');
  }
  return response(200, result);
}

function trustSnapshot(result: unknown): Record<string, unknown> | null {
  const snapshot = resultSnapshot(result);
  if (
    snapshot === null ||
    snapshot.authorizesExecution !== false ||
    snapshot.canGrantPermission !== false ||
    !safeReference(snapshot.deviceSessionId) ||
    !safeReference(snapshot.connectionId) ||
    !safeReference(snapshot.gatewaySessionId) ||
    !positiveInteger(snapshot.gatewayGeneration) ||
    !isPlainRecord(snapshot.deviceRef)
  ) {
    return null;
  }
  return snapshot;
}

function commandFromResult(result: unknown): Record<string, unknown> | null {
  if (!resultOk(result) || !isPlainRecord(result.value)) return null;
  const command = result.value;
  if (
    command.authorizesExecution !== false ||
    command.provesExecutionSuccess !== false ||
    typeof command.commandId !== 'string' ||
    !COMMAND_ID.test(command.commandId)
  ) {
    return null;
  }
  return command;
}

export class GatewayDevicePlaneNetworkHandler {
  readonly #dependencies: GatewayDevicePlaneDependencies;

  constructor(dependencies: GatewayDevicePlaneDependencies) {
    this.#dependencies = dependencies;
  }

  isRoute(path: string): boolean {
    return DEVICE_ROUTES.has(path);
  }

  async handle(input: GatewayDevicePlaneHandleInput): Promise<GatewayDevicePlaneResponse> {
    if (!this.isRoute(input.path)) return devicePlaneError(404, 'ROUTE_NOT_FOUND');
    if (
      !Number.isSafeInteger(input.nowMs) ||
      input.nowMs < 0 ||
      input.nowMs > MAX_DATE_MS ||
      !validGatewayBinding(input.gatewaySession, input.socketBinding, input.nowMs)
    ) {
      return devicePlaneError(409, 'GATEWAY_BINDING_NOT_CURRENT');
    }

    try {
      switch (input.path) {
        case '/v1/device/registrations/register':
          return await this.#register(input);
        case '/v1/device/registrations/activate':
          return this.#activate(input);
        case '/v1/device/sessions/open':
          return await this.#openSession(input);
        case '/v1/device/sessions/resume':
          return await this.#resumeSession(input);
        case '/v1/device/sessions/revoke':
          return this.#revokeSession(input);
        case '/v1/device/commands/claim':
          return this.#claim(input);
        case '/v1/device/commands/acknowledge':
          return this.#acknowledge(input);
        case '/v1/device/receipts/ingest':
          return this.#ingestReceipt(input);
      }
    } catch {
      return devicePlaneError(503, 'DEVICE_PLANE_DEPENDENCY_UNAVAILABLE');
    }
  }

  async #register(input: GatewayDevicePlaneHandleInput): Promise<GatewayDevicePlaneResponse> {
    if (
      !hasOnlyKeys(input.body, REGISTER_KEYS) ||
      typeof input.body.deviceId !== 'string' ||
      !DEVICE_ID.test(input.body.deviceId) ||
      !opaqueProof(input.body.proof) ||
      (input.body.expectedVersion !== undefined && !positiveInteger(input.body.expectedVersion))
    ) {
      return devicePlaneError(400, 'BODY_MALFORMED');
    }

    const verified = await invokeAsync(this.#dependencies.deviceProofVerifier, 'verifyRegistration', {
      deviceId: input.body.deviceId,
      gatewaySession: input.gatewaySession,
      proof: input.body.proof,
      nowMs: input.nowMs,
    });
    if (!resultOk(verified) || !safeReference(verified.proofReference, 256)) {
      return devicePlaneError(403, 'DEVICE_PROOF_REJECTED', resultErrorCode(verified));
    }

    const observedAt = new Date(input.nowMs).toISOString();
    const registered = invoke(this.#dependencies.devices, 'register', {
      deviceId: input.body.deviceId,
      tenantId: input.gatewaySession.tenantId,
      boundIdentityId: input.gatewaySession.actorIdentityId,
      registeredAt: observedAt,
      provenance: {
        source: 'W14_DEVICE_REGISTRATION',
        reference: verified.proofReference,
        observedAt,
      },
      ...(input.body.expectedVersion === undefined
        ? {}
        : { expectedVersion: input.body.expectedVersion }),
    });
    if (!resultOk(registered)) return managerResponse(registered);

    const deviceRef = canonicalDeviceRefFromRecord(registered);
    const proofReference = canonicalRegistrationProofReference(registered);
    if (
      deviceRef === null ||
      proofReference === null ||
      deviceRef.tenantId !== input.gatewaySession.tenantId
    ) {
      return devicePlaneError(503, 'UPSTREAM_PROTOCOL_VIOLATION');
    }
    input.connectionState.deviceRef = deviceRef;
    input.connectionState.registrationProofReference = proofReference;
    delete input.connectionState.deviceSessionId;
    return managerResponse(registered);
  }

  #activate(input: GatewayDevicePlaneHandleInput): GatewayDevicePlaneResponse {
    if (!hasOnlyKeys(input.body, EMPTY_KEYS)) return devicePlaneError(400, 'BODY_MALFORMED');
    const deviceRef = input.connectionState.deviceRef;
    if (deviceRef === undefined) return devicePlaneError(409, 'DEVICE_BINDING_REQUIRED');

    const current = invoke(this.#dependencies.devices, 'resolve', {
      ref: deviceRef,
      boundIdentityId: input.gatewaySession.actorIdentityId,
    });
    if (resultOk(current)) return managerResponse(current);

    const proofReference = input.connectionState.registrationProofReference;
    if (proofReference === undefined) return devicePlaneError(409, 'DEVICE_BINDING_REQUIRED');
    const observedAt = new Date(input.nowMs).toISOString();
    const activated = invoke(this.#dependencies.devices, 'transition', 'ACTIVATE', {
      ref: deviceRef,
      expectedVersion: deviceRef.registrationVersion,
      transitionedAt: observedAt,
      provenance: {
        source: 'W14_DEVICE_REGISTRATION',
        reference: proofReference,
        observedAt,
      },
    });
    if (!resultOk(activated)) return managerResponse(activated);
    const nextRef = canonicalDeviceRefFromRecord(activated);
    if (nextRef === null || nextRef.tenantId !== input.gatewaySession.tenantId) {
      return devicePlaneError(503, 'UPSTREAM_PROTOCOL_VIOLATION');
    }
    input.connectionState.deviceRef = nextRef;
    return managerResponse(activated);
  }

  #resolveActiveDevice(input: GatewayDevicePlaneHandleInput): unknown {
    const deviceRef = input.connectionState.deviceRef;
    if (deviceRef === undefined) return null;
    return invoke(this.#dependencies.devices, 'resolve', {
      ref: deviceRef,
      boundIdentityId: input.gatewaySession.actorIdentityId,
    });
  }

  async #verifiedAttestation(
    input: GatewayDevicePlaneHandleInput,
    proof: string,
    deviceRecord: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const verified = await invokeAsync(this.#dependencies.deviceProofVerifier, 'verifyAttestation', {
      deviceRecord,
      gatewaySession: input.gatewaySession,
      proof,
      nowMs: input.nowMs,
    });
    if (!resultOk(verified) || !isPlainRecord(verified.attestation)) return null;
    const attestation = verified.attestation;
    if (
      attestation.kind !== 'DEVICE_ATTESTATION_REFERENCE' ||
      attestation.state !== 'VERIFIED' ||
      !safeReference(attestation.reference) ||
      !safeReference(attestation.provider, 128) ||
      !safeReference(attestation.version, 64) ||
      !safeNonNegativeInteger(attestation.observedAtMs) ||
      !safeNonNegativeInteger(attestation.expiresAtMs) ||
      attestation.observedAtMs > input.nowMs ||
      attestation.expiresAtMs <= input.nowMs
    ) {
      return null;
    }
    return attestation;
  }

  async #openSession(input: GatewayDevicePlaneHandleInput): Promise<GatewayDevicePlaneResponse> {
    if (
      !hasOnlyKeys(input.body, OPEN_SESSION_KEYS) ||
      !safeReference(input.body.deviceSessionId) ||
      !opaqueProof(input.body.proof)
    ) {
      return devicePlaneError(400, 'BODY_MALFORMED');
    }
    const device = this.#resolveActiveDevice(input);
    const deviceRecord = resultRecord(device);
    if (deviceRecord === null) return managerResponse(device);
    const attestation = await this.#verifiedAttestation(input, input.body.proof, deviceRecord);
    if (attestation === null) return devicePlaneError(403, 'ATTESTATION_PROOF_REJECTED');

    const opened = invoke(this.#dependencies.deviceSessions, 'openSession', {
      deviceSessionId: input.body.deviceSessionId,
      gatewaySession: input.gatewaySession,
      deviceRecord,
      attestation,
      nowMs: input.nowMs,
    });
    const snapshot = trustSnapshot(opened);
    if (snapshot === null) return managerResponse(opened);
    if (
      snapshot.deviceSessionId !== input.body.deviceSessionId ||
      snapshot.connectionId !== input.gatewaySession.connectionId
    ) {
      return devicePlaneError(503, 'UPSTREAM_PROTOCOL_VIOLATION');
    }
    input.connectionState.deviceSessionId = input.body.deviceSessionId;
    return managerResponse(opened);
  }

  async #resumeSession(input: GatewayDevicePlaneHandleInput): Promise<GatewayDevicePlaneResponse> {
    if (
      !hasOnlyKeys(input.body, RESUME_SESSION_KEYS) ||
      !safeReference(input.body.deviceSessionId) ||
      !safeReference(input.body.previousConnectionId) ||
      !opaqueProof(input.body.proof) ||
      input.body.previousConnectionId === input.gatewaySession.connectionId
    ) {
      return devicePlaneError(400, 'BODY_MALFORMED');
    }
    const device = this.#resolveActiveDevice(input);
    const deviceRecord = resultRecord(device);
    if (deviceRecord === null) return managerResponse(device);
    const attestation = await this.#verifiedAttestation(input, input.body.proof, deviceRecord);
    if (attestation === null) return devicePlaneError(403, 'ATTESTATION_PROOF_REJECTED');

    const resumed = invoke(this.#dependencies.deviceSessions, 'resumeSession', {
      deviceSessionId: input.body.deviceSessionId,
      previousConnectionId: input.body.previousConnectionId,
      gatewaySession: input.gatewaySession,
      deviceRecord,
      attestation,
      nowMs: input.nowMs,
    });
    const snapshot = trustSnapshot(resumed);
    if (snapshot === null) return managerResponse(resumed);
    if (
      snapshot.deviceSessionId !== input.body.deviceSessionId ||
      snapshot.connectionId !== input.gatewaySession.connectionId
    ) {
      return devicePlaneError(503, 'UPSTREAM_PROTOCOL_VIOLATION');
    }
    input.connectionState.deviceSessionId = input.body.deviceSessionId;
    return managerResponse(resumed);
  }

  #currentTrust(input: GatewayDevicePlaneHandleInput): unknown {
    const deviceSessionId = input.connectionState.deviceSessionId;
    if (deviceSessionId === undefined) return null;
    return invoke(
      this.#dependencies.deviceSessions,
      'getSession',
      deviceSessionId,
      input.gatewaySession.connectionId,
      input.nowMs,
    );
  }

  #revokeSession(input: GatewayDevicePlaneHandleInput): GatewayDevicePlaneResponse {
    if (
      !hasOnlyKeys(input.body, REVOKE_SESSION_KEYS) ||
      !safeReference(input.body.reasonReference)
    ) {
      return devicePlaneError(400, 'BODY_MALFORMED');
    }
    const deviceSessionId = input.connectionState.deviceSessionId;
    if (deviceSessionId === undefined) return devicePlaneError(409, 'DEVICE_SESSION_BINDING_REQUIRED');
    return managerResponse(
      invoke(this.#dependencies.deviceSessions, 'revokeSession', {
        deviceSessionId,
        connectionId: input.gatewaySession.connectionId,
        revokedAtMs: input.nowMs,
        reasonReference: input.body.reasonReference,
      }),
    );
  }

  #currentCommand(input: GatewayDevicePlaneHandleInput, commandId: string): unknown {
    return invoke(
      this.#dependencies.realtimeCommands,
      'getCommand',
      input.gatewaySession.sessionId,
      input.gatewaySession.connectionId,
      commandId,
      input.nowMs,
    );
  }

  #claim(input: GatewayDevicePlaneHandleInput): GatewayDevicePlaneResponse {
    if (
      !hasOnlyKeys(input.body, CLAIM_KEYS) ||
      typeof input.body.commandId !== 'string' ||
      !COMMAND_ID.test(input.body.commandId)
    ) {
      return devicePlaneError(400, 'BODY_MALFORMED');
    }
    const currentTrust = this.#currentTrust(input);
    const trust = trustSnapshot(currentTrust);
    if (trust === null) return managerResponse(currentTrust);
    const currentCommand = this.#currentCommand(input, input.body.commandId);
    const command = commandFromResult(currentCommand);
    if (command === null) return managerResponse(currentCommand);
    return managerResponse(
      invoke(this.#dependencies.deliveries, 'claim', {
        command,
        deviceSession: trust,
        nowMs: input.nowMs,
      }),
    );
  }

  #acknowledge(input: GatewayDevicePlaneHandleInput): GatewayDevicePlaneResponse {
    if (
      !hasOnlyKeys(input.body, ACK_KEYS) ||
      typeof input.body.commandId !== 'string' ||
      !COMMAND_ID.test(input.body.commandId) ||
      !safeReference(input.body.deliveryReference) ||
      !safeReference(input.body.ackReference, 256)
    ) {
      return devicePlaneError(400, 'BODY_MALFORMED');
    }
    const currentTrust = this.#currentTrust(input);
    const trust = trustSnapshot(currentTrust);
    if (trust === null) return managerResponse(currentTrust);
    const currentCommand = this.#currentCommand(input, input.body.commandId);
    const command = commandFromResult(currentCommand);
    if (command === null) return managerResponse(currentCommand);
    return managerResponse(
      invoke(this.#dependencies.deliveries, 'acknowledge', {
        command,
        deviceSession: trust,
        deliveryReference: input.body.deliveryReference,
        ackReference: input.body.ackReference,
        observedAtMs: input.nowMs,
      }),
    );
  }

  #ingestReceipt(input: GatewayDevicePlaneHandleInput): GatewayDevicePlaneResponse {
    if (
      !hasOnlyKeys(input.body, RECEIPT_KEYS) ||
      typeof input.body.receiptId !== 'string' ||
      !RECEIPT_ID.test(input.body.receiptId) ||
      (input.body.evidenceId !== undefined &&
        (typeof input.body.evidenceId !== 'string' || !EVIDENCE_ID.test(input.body.evidenceId))) ||
      typeof input.body.commandId !== 'string' ||
      !COMMAND_ID.test(input.body.commandId) ||
      typeof input.body.executionId !== 'string' ||
      !EXECUTION_ID.test(input.body.executionId) ||
      !safeReference(input.body.connectionId) ||
      !positiveInteger(input.body.gatewayGeneration) ||
      !safeReference(input.body.deliveryReference) ||
      !['COMPLETED', 'FAILED', 'UNCERTAIN'].includes(String(input.body.reportedState)) ||
      !safeReference(input.body.sourceReference) ||
      !safeReference(input.body.proofReference) ||
      !safeReference(input.body.integrityDigest, 256) ||
      !safeNonNegativeInteger(input.body.capturedAtMs)
    ) {
      return devicePlaneError(400, 'BODY_MALFORMED');
    }
    const currentTrust = this.#currentTrust(input);
    const trust = trustSnapshot(currentTrust);
    if (trust === null) return managerResponse(currentTrust);
    const deviceRef = parseDeviceRef(trust.deviceRef);
    if (
      deviceRef === null ||
      typeof trust.tenantId !== 'string' ||
      typeof trust.correlationId !== 'string' ||
      typeof trust.deviceSessionId !== 'string' ||
      typeof trust.gatewaySessionId !== 'string'
    ) {
      return devicePlaneError(503, 'UPSTREAM_PROTOCOL_VIOLATION');
    }

    return managerResponse(
      invoke(this.#dependencies.receiptIngress, 'ingest', {
        receiptId: input.body.receiptId,
        ...(input.body.evidenceId === undefined ? {} : { evidenceId: input.body.evidenceId }),
        tenantId: trust.tenantId,
        correlationId: trust.correlationId,
        commandId: input.body.commandId,
        executionId: input.body.executionId,
        deviceRef,
        deviceSessionId: trust.deviceSessionId,
        gatewaySessionId: trust.gatewaySessionId,
        connectionId: input.body.connectionId,
        gatewayGeneration: input.body.gatewayGeneration,
        deliveryReference: input.body.deliveryReference,
        reportedState: input.body.reportedState,
        sourceReference: input.body.sourceReference,
        proofReference: input.body.proofReference,
        integrityDigest: input.body.integrityDigest,
        capturedAtMs: input.body.capturedAtMs,
        receivedAtMs: input.nowMs,
        deviceSession: trust,
      }),
    );
  }
}
