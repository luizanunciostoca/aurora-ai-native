import type { DeviceSessionTrustManager } from '../device-session/session-trust.js';
import type {
  DeviceAttestationReference,
  DeviceSessionTrustSnapshot,
} from '../device-session/types.js';
import type { InMemoryDeviceRegistry } from '../device/registry.js';
import type { DeviceRef } from '../device/types.js';
import {
  LocalModelSessionAdmission,
  type LocalModelAuthenticatedSocketBinding,
} from './local-model-session-admission.js';
import type { GatewaySessionManager } from './session-manager.js';
import { GATEWAY_PROTOCOL_VERSION, type GatewaySessionSnapshot } from './types.js';

const MAX_TIME_MS = 8_640_000_000_000_000;
const MAX_OPERATION_MS = 30_000;
const MAX_OUTPUT_BYTES = 32_768;
const MAX_REGISTERED_WORK = 64;
const SAFE_REFERENCE = /^[A-Za-z0-9._:-]+$/u;
const NO_AUTHORITY = {
  authoritySemantics: 'INTELLIGENCE_ONLY_NO_AUTHORITY',
  authorizesExecution: false,
  canInvokeTools: false,
  canGrantPermission: false,
} as const;

/** All fields are derived from the authenticated socket and canonical W14 records. */
export interface LocalModelBoundRequest {
  readonly tenantId: GatewaySessionSnapshot['tenantId'];
  readonly actorIdentityId: GatewaySessionSnapshot['actorIdentityId'];
  readonly correlationId: GatewaySessionSnapshot['correlationId'];
  readonly gatewaySessionId: string;
  readonly connectionId: string;
  readonly gatewayGeneration: number;
  readonly deviceSessionId: string;
  readonly deviceId: DeviceRef['deviceId'];
  readonly registrationVersion: number;
  readonly requestId: string;
  readonly deadlineMs: number;
}

export type LocalModelSessionOperationCode =
  | 'BODY_MALFORMED'
  | 'SOCKET_NOT_AUTHENTICATED'
  | 'DEVICE_TRUST_NOT_CURRENT'
  | 'REQUEST_NOT_ADMITTED'
  | 'W14_UPSTREAM_UNAVAILABLE'
  | 'INVALID_RESULT'
  | 'RECONCILIATION_REQUIRED'
  | 'INVALID_REQUEST'
  | 'INVALID_ROUTE'
  | 'UNVERIFIED_MODEL'
  | 'STALE_MODEL'
  | 'UNAVAILABLE'
  | 'REJECTED'
  | 'MALFORMED_RESPONSE'
  | 'BUSY'
  | 'CANCELLED'
  | 'TIMEOUT';

type NoAuthority = typeof NO_AUTHORITY;

export type LocalModelSessionOperationResult = NoAuthority &
  (
    | {
        readonly status: 'GENERATED';
        readonly content: string;
        readonly strategyId: string;
        readonly modelSha256: string;
      }
    | { readonly status: 'ABSTAINED'; readonly code: LocalModelSessionOperationCode }
  );

export type LocalModelSessionCancelResult = NoAuthority & {
  readonly requested: boolean;
  readonly code:
    'CANCELLED' | 'BODY_MALFORMED' | 'REQUEST_NOT_ADMITTED' | 'RECONCILIATION_REQUIRED';
};

/** Private orchestration checks; none of these functions is caller-supplied authority. */
export interface LocalModelSessionGuards {
  readonly revalidateCurrent: () => Promise<boolean>;
  readonly isCurrent: () => boolean;
  readonly registerReleaseGuard: (guard: (nowMs: number) => boolean) => void;
  /** Private real-work observation, distinct from the bounded logical result. */
  readonly registerWork: (work: Promise<unknown>) => void;
}

export interface LocalModelSessionOperationDependencies {
  readonly gatewaySessions: Pick<
    GatewaySessionManager,
    'getSession' | 'beginRequest' | 'cancelRequest' | 'completeRequest'
  >;
  readonly deviceSessions: Pick<DeviceSessionTrustManager, 'getSession' | 'evaluateSession'>;
  readonly devices: Pick<InMemoryDeviceRegistry, 'resolve'>;
  /** A trusted observation source; never manufacture a new observation time here. */
  readonly currentAttestation: {
    readCurrent(binding: LocalModelBoundRequest): Promise<DeviceAttestationReference | null>;
  };
  readonly now: () => number;
  /** A private, information-only core adapter, not a model body or an executor. */
  readonly invoke: (
    binding: LocalModelBoundRequest,
    signal: AbortSignal,
    guards: LocalModelSessionGuards,
  ) => Promise<unknown>;
}

interface RequestBody {
  readonly deviceSessionId: string;
  readonly requestId: string;
  readonly deadlineMs: number;
}

interface Flight {
  readonly body: RequestBody;
  readonly socket: LocalModelAuthenticatedSocketBinding;
  readonly controller: AbortController;
  readonly deliver: (result: LocalModelSessionOperationResult) => void;
  readonly pendingChecks: Set<Promise<boolean>>;
  readonly pendingWork: Set<Promise<void>>;
  readonly registeredWork: Set<Promise<unknown>>;
  workRegistrationOpen: boolean;
  workProtocolFailed: boolean;
  workRejected: boolean;
  bound: LocalModelBoundRequest | null;
  lastNowMs: number;
  latestAttestation: DeviceAttestationReference | null;
  timer: ReturnType<typeof setTimeout> | null;
  beginAttempted: boolean;
  beginReturned: boolean;
  admitted: boolean;
  cancelAttempted: boolean;
  completeAttempted: boolean;
  invoking: boolean;
  releaseGuard: ((nowMs: number) => boolean) | null;
  releaseGuardInvalid: boolean;
  stopped: LocalModelSessionOperationCode | null;
  reconciliationRequired: boolean;
  delivered: boolean;
}

function abstain(code: LocalModelSessionOperationCode): LocalModelSessionOperationResult {
  return { ...NO_AUTHORITY, status: 'ABSTAINED', code };
}

function synchronousCurrentVerdict(value: unknown): boolean {
  if (value === true) return true;
  if (value !== null && typeof value === 'object') {
    try {
      // A mistaken async source is still rejected. Contain a native Promise's
      // rejection without awaiting it or reading an arbitrary `then` accessor.
      void Promise.prototype.then.call(
        value,
        () => undefined,
        () => undefined,
      );
    } catch {
      // Non-Promise values are not assimilated or coerced into a current verdict.
    }
  }
  return false;
}

function validTime(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIME_MS
  );
}

function reference(value: unknown, limit = 256): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= limit &&
    SAFE_REFERENCE.test(value)
  );
}

/** Snapshot once with descriptors: no getters, coercion, retained proxies or symbol extras. */
function snapshot(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object') return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length > keys.length) return null;
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of ownKeys) {
    if (typeof key !== 'string' || !keys.includes(key)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return null;
    result[key] = descriptor.value as unknown;
  }
  return result;
}

function parseBody(value: unknown): RequestBody | null {
  const data = snapshot(value, ['deviceSessionId', 'requestId', 'deadlineMs']);
  if (
    !data ||
    !reference(data.deviceSessionId) ||
    !reference(data.requestId, 128) ||
    !validTime(data.deadlineMs)
  )
    return null;
  return Object.freeze({
    deviceSessionId: data.deviceSessionId,
    requestId: data.requestId,
    deadlineMs: data.deadlineMs,
  });
}

function parseSocket(value: unknown): LocalModelAuthenticatedSocketBinding | null {
  const data = snapshot(value, [
    'sessionId',
    'connectionId',
    'tenantId',
    'actorIdentityId',
    'correlationId',
  ]);
  if (
    !data ||
    !reference(data.sessionId, 128) ||
    !reference(data.connectionId) ||
    !reference(data.tenantId) ||
    !reference(data.actorIdentityId) ||
    !reference(data.correlationId)
  )
    return null;
  return Object.freeze({ ...data }) as unknown as LocalModelAuthenticatedSocketBinding;
}

function parseAttestation(value: unknown): DeviceAttestationReference | null {
  const data = snapshot(value, [
    'kind',
    'reference',
    'provider',
    'version',
    'state',
    'observedAtMs',
    'expiresAtMs',
  ]);
  if (
    !data ||
    data.kind !== 'DEVICE_ATTESTATION_REFERENCE' ||
    typeof data.reference !== 'string' ||
    typeof data.provider !== 'string' ||
    typeof data.version !== 'string' ||
    !['VERIFIED', 'REVOKED', 'AMBIGUOUS'].includes(data.state as string) ||
    !validTime(data.observedAtMs) ||
    !validTime(data.expiresAtMs)
  )
    return null;
  // The canonical trust manager owns identity, freshness and state semantics.
  return Object.freeze({ ...data }) as unknown as DeviceAttestationReference;
}

const DELEGATE_FAILURE_CODES = new Set<LocalModelSessionOperationCode>([
  'INVALID_REQUEST',
  'INVALID_ROUTE',
  'UNVERIFIED_MODEL',
  'STALE_MODEL',
  'UNAVAILABLE',
  'REJECTED',
  'MALFORMED_RESPONSE',
  'BUSY',
  'CANCELLED',
  'TIMEOUT',
]);

function parseResult(value: unknown): LocalModelSessionOperationResult {
  const data = snapshot(value, [
    'authoritySemantics',
    'authorizesExecution',
    'canInvokeTools',
    'canGrantPermission',
    'status',
    'content',
    'strategyId',
    'modelSha256',
    'code',
  ]);
  if (
    !data ||
    data.authoritySemantics !== NO_AUTHORITY.authoritySemantics ||
    data.authorizesExecution !== false ||
    data.canInvokeTools !== false ||
    (data.canGrantPermission !== undefined && data.canGrantPermission !== false)
  )
    return abstain('INVALID_RESULT');
  if (data.status === 'ABSTAINED') {
    if (
      typeof data.code !== 'string' ||
      !DELEGATE_FAILURE_CODES.has(data.code as LocalModelSessionOperationCode) ||
      ['content', 'strategyId', 'modelSha256'].some((key) => Object.hasOwn(data, key))
    )
      return abstain('INVALID_RESULT');
    return abstain(data.code as LocalModelSessionOperationCode);
  }
  if (
    data.status !== 'GENERATED' ||
    Object.hasOwn(data, 'code') ||
    typeof data.content !== 'string' ||
    data.content.length > MAX_OUTPUT_BYTES ||
    data.content.trim().length === 0 ||
    new TextEncoder().encode(data.content).byteLength > MAX_OUTPUT_BYTES ||
    !reference(data.strategyId) ||
    typeof data.modelSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(data.modelSha256)
  )
    return abstain('INVALID_RESULT');
  return {
    ...NO_AUTHORITY,
    status: 'GENERATED',
    content: data.content,
    strategyId: data.strategyId,
    modelSha256: data.modelSha256,
  };
}

/**
 * Private preparation-only composition over the existing W14 managers.
 *
 * This is neither an ingress route nor a new identity/replay/policy registry. The
 * authenticator, attestation observer and core source must be bound by their
 * owners. No prompt or credential is accepted here. One instance must be reused
 * with the existing bounded W05 client: logical request completion does NOT prove
 * model/transport quiescence. A nonsettling delegate keeps this operation BUSY;
 * uncertain canonical finalization quarantines it pending external reconciliation.
 * Timers bound asynchronous waits, not a trusted port that blocks the JS thread.
 */
export class LocalModelSessionOperation {
  readonly #deps: LocalModelSessionOperationDependencies;
  #flight: Flight | null = null;
  #quarantined = false;

  constructor(dependencies: LocalModelSessionOperationDependencies) {
    this.#deps = dependencies;
  }

  run(body: unknown, socketBinding: unknown): Promise<LocalModelSessionOperationResult> {
    if (this.#quarantined) return Promise.resolve(abstain('RECONCILIATION_REQUIRED'));
    if (this.#flight) return Promise.resolve(abstain('BUSY'));
    let parsedBody: RequestBody | null;
    let socket: LocalModelAuthenticatedSocketBinding | null;
    let nowMs: number;
    try {
      parsedBody = parseBody(body);
    } catch {
      return Promise.resolve(abstain('BODY_MALFORMED'));
    }
    if (!parsedBody) return Promise.resolve(abstain('BODY_MALFORMED'));
    try {
      socket = parseSocket(socketBinding);
    } catch {
      return Promise.resolve(abstain('SOCKET_NOT_AUTHENTICATED'));
    }
    if (!socket) return Promise.resolve(abstain('SOCKET_NOT_AUTHENTICATED'));
    try {
      nowMs = this.#deps.now();
      if (!validTime(nowMs)) return Promise.resolve(abstain('W14_UPSTREAM_UNAVAILABLE'));
      if (parsedBody.deadlineMs <= nowMs) return Promise.resolve(abstain('TIMEOUT'));
      if (parsedBody.deadlineMs - nowMs > MAX_OPERATION_MS)
        return Promise.resolve(abstain('BODY_MALFORMED'));
    } catch {
      return Promise.resolve(abstain('W14_UPSTREAM_UNAVAILABLE'));
    }
    return new Promise<LocalModelSessionOperationResult>((resolve) => {
      const flight: Flight = {
        body: parsedBody,
        socket,
        controller: new AbortController(),
        deliver: resolve,
        pendingChecks: new Set(),
        pendingWork: new Set(),
        registeredWork: new Set(),
        workRegistrationOpen: false,
        workProtocolFailed: false,
        workRejected: false,
        bound: null,
        lastNowMs: nowMs,
        latestAttestation: null,
        timer: null,
        beginAttempted: false,
        beginReturned: false,
        admitted: false,
        cancelAttempted: false,
        completeAttempted: false,
        invoking: false,
        releaseGuard: null,
        releaseGuardInvalid: false,
        stopped: null,
        reconciliationRequired: false,
        delivered: false,
      };
      this.#flight = flight;
      flight.timer = setTimeout(() => this.#stop(flight, 'TIMEOUT'), parsedBody.deadlineMs - nowMs);
      // Scheduling keeps even an immediate cancellation bound to this same slot.
      void Promise.resolve().then(() => this.#perform(flight));
    });
  }

  cancel(body: unknown, socketBinding: unknown): LocalModelSessionCancelResult {
    if (this.#quarantined)
      return { ...NO_AUTHORITY, requested: false, code: 'RECONCILIATION_REQUIRED' };
    try {
      const parsed = parseBody(body);
      const socket = parseSocket(socketBinding);
      if (!parsed || !socket) return { ...NO_AUTHORITY, requested: false, code: 'BODY_MALFORMED' };
      const flight = this.#flight;
      if (
        !flight ||
        flight.stopped !== null ||
        parsed.deviceSessionId !== flight.body.deviceSessionId ||
        parsed.requestId !== flight.body.requestId ||
        parsed.deadlineMs !== flight.body.deadlineMs ||
        Object.keys(socket).some(
          (key) =>
            socket[key as keyof LocalModelAuthenticatedSocketBinding] !==
            flight.socket[key as keyof LocalModelAuthenticatedSocketBinding],
        )
      )
        return { ...NO_AUTHORITY, requested: false, code: 'REQUEST_NOT_ADMITTED' };
      this.#stop(flight, 'CANCELLED');
      return {
        ...NO_AUTHORITY,
        requested: !flight.reconciliationRequired,
        code: flight.reconciliationRequired ? 'RECONCILIATION_REQUIRED' : 'CANCELLED',
      };
    } catch {
      return { ...NO_AUTHORITY, requested: false, code: 'BODY_MALFORMED' };
    }
  }

  #now(flight: Flight): number {
    const nowMs = this.#deps.now();
    if (!validTime(nowMs) || nowMs < flight.lastNowMs)
      throw new Error('Current server time is unavailable');
    flight.lastNowMs = nowMs;
    return nowMs;
  }

  #boundOperation(flight: Flight, nowMs: number): Record<string, unknown> {
    return {
      protocolVersion: GATEWAY_PROTOCOL_VERSION,
      ...flight.socket,
      requestId: flight.body.requestId,
      nowMs,
    };
  }

  #deliver(flight: Flight, result: LocalModelSessionOperationResult): void {
    if (flight.delivered) return;
    flight.delivered = true;
    if (flight.timer !== null) clearTimeout(flight.timer);
    flight.timer = null;
    flight.deliver(result);
  }

  #stop(flight: Flight, code: LocalModelSessionOperationCode): void {
    if (this.#flight !== flight) return;
    flight.stopped ??= code;
    flight.controller.abort();
    if (flight.admitted && !flight.cancelAttempted && !flight.completeAttempted) {
      flight.cancelAttempted = true;
      try {
        const result = this.#deps.gatewaySessions.cancelRequest(
          this.#boundOperation(flight, this.#now(flight)),
        );
        if (
          !result.ok ||
          result.value.state !== 'CANCEL_REQUESTED' ||
          result.value.authorizesExecution !== false ||
          result.value.requestId !== flight.body.requestId ||
          result.value.sessionId !== flight.socket.sessionId ||
          result.value.connectionId !== flight.socket.connectionId ||
          result.value.deadlineMs !== flight.body.deadlineMs
        )
          flight.reconciliationRequired = true;
      } catch {
        flight.reconciliationRequired = true;
      }
    }
    if (flight.beginAttempted && !flight.beginReturned) flight.reconciliationRequired = true;
    if (flight.reconciliationRequired) this.#quarantined = true;
    this.#deliver(
      flight,
      abstain(flight.reconciliationRequired ? 'RECONCILIATION_REQUIRED' : flight.stopped),
    );
  }

  #current(
    flight: Flight,
    nowMs: number,
  ): { gateway: GatewaySessionSnapshot; trust: DeviceSessionTrustSnapshot } | null {
    const gateway = this.#deps.gatewaySessions.getSession(flight.socket.sessionId, nowMs);
    if (!gateway.ok) return null;
    const current = gateway.value;
    if (
      current.protocolVersion !== GATEWAY_PROTOCOL_VERSION ||
      current.state !== 'OPEN' ||
      current.authorizesExecution !== false ||
      !Number.isSafeInteger(current.generation) ||
      current.generation < 1 ||
      current.sessionId !== flight.socket.sessionId ||
      current.connectionId !== flight.socket.connectionId ||
      current.tenantId !== flight.socket.tenantId ||
      current.actorIdentityId !== flight.socket.actorIdentityId ||
      current.correlationId !== flight.socket.correlationId ||
      nowMs < current.authIssuedAtMs ||
      nowMs >= current.authExpiresAtMs
    )
      return null;
    const device = this.#deps.deviceSessions.getSession(
      flight.body.deviceSessionId,
      current.connectionId,
      nowMs,
    );
    if (!device.ok) return null;
    const trust = device.snapshot;
    if (
      trust.kind !== 'DeviceSessionTrustSnapshot' ||
      trust.schemaVersion !== '1.0.0' ||
      trust.state !== 'ACTIVE' ||
      trust.executionPreconditionSatisfied !== true ||
      trust.authorizesExecution !== false ||
      trust.canGrantPermission !== false ||
      trust.requiresCurrentAuthorityValidation !== true ||
      trust.authoritySemantics !== 'DEVICE_SESSION_TRUST_IS_PRECONDITION_METADATA_ONLY' ||
      trust.deviceSessionId !== flight.body.deviceSessionId ||
      trust.gatewaySessionId !== current.sessionId ||
      trust.connectionId !== current.connectionId ||
      trust.gatewayGeneration !== current.generation ||
      trust.tenantId !== current.tenantId ||
      trust.actorIdentityId !== current.actorIdentityId ||
      trust.correlationId !== current.correlationId ||
      trust.deviceRef.kind !== 'AURORA_DEVICE' ||
      trust.deviceRef.tenantId !== current.tenantId
    )
      return null;
    if (
      flight.bound &&
      (current.generation !== flight.bound.gatewayGeneration ||
        trust.deviceRef.deviceId !== flight.bound.deviceId ||
        trust.deviceRef.registrationVersion !== flight.bound.registrationVersion)
    )
      return null;
    return { gateway: current, trust };
  }

  #evaluateCurrent(
    flight: Flight,
    attestation: DeviceAttestationReference,
    nowMs: number,
  ): boolean {
    const current = this.#current(flight, nowMs);
    if (!current) return false;
    const resolution = this.#deps.devices.resolve({
      ref: current.trust.deviceRef,
      boundIdentityId: current.gateway.actorIdentityId,
    });
    if (
      !resolution.ok ||
      resolution.authorizesExecution !== false ||
      resolution.canGrantPermission !== false
    )
      return false;
    const result = this.#deps.deviceSessions.evaluateSession({
      deviceSessionId: flight.body.deviceSessionId,
      connectionId: current.gateway.connectionId,
      currentDeviceRecord: resolution.record,
      currentAttestation: attestation,
      nowMs,
    });
    if (!result.ok || result.authorizesExecution !== false || result.canGrantPermission !== false)
      return false;
    return this.#current(flight, nowMs) !== null;
  }

  async #revalidate(flight: Flight): Promise<boolean> {
    try {
      if (this.#flight !== flight || flight.stopped || !flight.bound) return false;
      const before = this.#now(flight);
      if (before >= flight.body.deadlineMs) {
        this.#stop(flight, 'TIMEOUT');
        return false;
      }
      if (!this.#current(flight, before)) return false;
      const raw = await this.#deps.currentAttestation.readCurrent(flight.bound);
      if (this.#flight !== flight || flight.stopped) return false;
      const nowMs = this.#now(flight);
      if (nowMs >= flight.body.deadlineMs) {
        this.#stop(flight, 'TIMEOUT');
        return false;
      }
      const observation = parseAttestation(raw);
      if (!observation || !this.#evaluateCurrent(flight, observation, nowMs)) return false;
      flight.latestAttestation = observation;
      return true;
    } catch {
      return false;
    }
  }

  #delegateRevalidation(flight: Flight): Promise<boolean> {
    if (!flight.invoking || flight.stopped || this.#flight !== flight)
      return Promise.resolve(false);
    const pending = this.#revalidate(flight);
    flight.pendingChecks.add(pending);
    void pending.then(() => flight.pendingChecks.delete(pending));
    return pending;
  }

  #isCurrent(flight: Flight): boolean {
    try {
      if (this.#flight !== flight || flight.stopped || !flight.bound || !flight.latestAttestation)
        return false;
      const nowMs = this.#now(flight);
      if (nowMs >= flight.body.deadlineMs) {
        this.#stop(flight, 'TIMEOUT');
        return false;
      }
      return this.#evaluateCurrent(flight, flight.latestAttestation, nowMs);
    } catch {
      return false;
    }
  }

  #registerReleaseGuard(flight: Flight, guard: (nowMs: number) => boolean): void {
    if (
      this.#flight !== flight ||
      !flight.invoking ||
      flight.stopped ||
      flight.releaseGuard !== null ||
      flight.releaseGuardInvalid ||
      typeof guard !== 'function'
    ) {
      flight.releaseGuardInvalid = true;
      flight.releaseGuard = null;
      return;
    }
    flight.releaseGuard = guard;
  }

  #workProtocolFailure(flight: Flight): void {
    flight.workProtocolFailed = true;
    flight.workRegistrationOpen = false;
    flight.reconciliationRequired = true;
    this.#quarantined = true;
    const current = this.#flight;
    if (current && current !== flight) {
      // A stale callback cannot lend the previous binding to the new flight.
      // Global ownership uncertainty also stops the current flight using ONLY
      // its own cancellation identity, retaining all of its accepted fences.
      current.workProtocolFailed = true;
      current.workRegistrationOpen = false;
      current.reconciliationRequired = true;
    }
    if (current) this.#stop(current, 'RECONCILIATION_REQUIRED');
  }

  #registerWork(flight: Flight, work: Promise<unknown>): void {
    if (
      this.#flight !== flight ||
      !flight.invoking ||
      !flight.workRegistrationOpen ||
      flight.stopped ||
      flight.workProtocolFailed ||
      flight.registeredWork.size >= MAX_REGISTERED_WORK ||
      flight.registeredWork.has(work)
    ) {
      try {
        // Contain a refused native rejection without admitting it as evidence,
        // invoking a thenable, or forgetting any already accepted operation.
        void Promise.prototype.then.call(
          work,
          () => undefined,
          () => undefined,
        );
      } catch {
        /* A malformed/thenable input is still rejected. */
      }
      this.#workProtocolFailure(flight);
      throw new Error('LOCAL_MODEL_WORK_NOT_ADMITTED');
    }
    let terminal: Promise<void>;
    try {
      // Brand-check without evaluating a caller-controlled then accessor or
      // assimilating a thenable. Rejection proves termination, not permission.
      terminal = Promise.prototype.then.call(
        work,
        () => undefined,
        () => {
          flight.workRejected = true;
        },
      ) as Promise<void>;
    } catch {
      this.#workProtocolFailure(flight);
      throw new Error('LOCAL_MODEL_WORK_INVALID');
    }
    flight.registeredWork.add(work);
    flight.pendingWork.add(terminal);
    void terminal.then(() => flight.pendingWork.delete(terminal));
  }

  async #perform(flight: Flight): Promise<void> {
    let result = abstain('W14_UPSTREAM_UNAVAILABLE');
    try {
      if (flight.stopped) return;
      const nowMs = this.#now(flight);
      if (nowMs >= flight.body.deadlineMs) {
        this.#stop(flight, 'TIMEOUT');
        return;
      }
      const admission = new LocalModelSessionAdmission(
        {
          getSession: (sessionId, now) => this.#deps.gatewaySessions.getSession(sessionId, now),
          beginRequest: (input) => {
            flight.beginAttempted = true;
            const begun = this.#deps.gatewaySessions.beginRequest(input);
            flight.admitted = begun.ok;
            flight.beginReturned = true;
            return begun;
          },
        },
        this.#deps.deviceSessions,
      ).admit(flight.body, flight.socket, nowMs);
      if (!admission.ok) {
        result = abstain(admission.error.code);
        return;
      }
      const current = this.#current(flight, this.#now(flight));
      if (!current) {
        result = abstain('DEVICE_TRUST_NOT_CURRENT');
        return;
      }
      flight.bound = Object.freeze({
        tenantId: current.gateway.tenantId,
        actorIdentityId: current.gateway.actorIdentityId,
        correlationId: current.gateway.correlationId,
        gatewaySessionId: current.gateway.sessionId,
        connectionId: current.gateway.connectionId,
        gatewayGeneration: current.gateway.generation,
        deviceSessionId: current.trust.deviceSessionId,
        deviceId: current.trust.deviceRef.deviceId,
        registrationVersion: current.trust.deviceRef.registrationVersion,
        requestId: flight.body.requestId,
        deadlineMs: flight.body.deadlineMs,
      });
      if (!(await this.#revalidate(flight))) {
        result = abstain('DEVICE_TRUST_NOT_CURRENT');
        return;
      }
      if (flight.stopped) return;
      // A resolved async validation is not a lock: recheck in this dispatch turn.
      if (!this.#isCurrent(flight)) {
        result = abstain('DEVICE_TRUST_NOT_CURRENT');
        return;
      }
      flight.invoking = true;
      flight.workRegistrationOpen = true;
      const guards: LocalModelSessionGuards = Object.freeze({
        revalidateCurrent: () => this.#delegateRevalidation(flight),
        isCurrent: () => flight.invoking && this.#isCurrent(flight),
        registerReleaseGuard: (guard: (nowMs: number) => boolean) =>
          this.#registerReleaseGuard(flight, guard),
        registerWork: (work: Promise<unknown>) => this.#registerWork(flight, work),
      });
      const invocation = this.#deps.invoke(flight.bound, flight.controller.signal, guards);
      // The core must register its root fence within the invoke call itself,
      // before any queued producer can start. Missing evidence is not no-work.
      if (flight.registeredWork.size === 0) this.#workProtocolFailure(flight);
      const raw = await invocation;
      flight.workRegistrationOpen = false;
      flight.invoking = false;
      if (flight.stopped) return;
      try {
        result = parseResult(raw);
      } catch {
        result = abstain('INVALID_RESULT');
      }
      if (!(await this.#revalidate(flight))) result = abstain('DEVICE_TRUST_NOT_CURRENT');
    } catch {
      if (flight.invoking && flight.registeredWork.size === 0) this.#workProtocolFailure(flight);
      result = abstain('W14_UPSTREAM_UNAVAILABLE');
    } finally {
      flight.invoking = false;
      flight.workRegistrationOpen = false;
      // A delegate cannot release the slot while an initiated validation is still unresolved.
      if (flight.pendingChecks.size > 0) await Promise.all([...flight.pendingChecks]);
      // Registration is closed. Drain actual work, including cleanup, rather
      // than a Promise.race that already returned TIMEOUT/CANCELLED.
      while (flight.pendingWork.size > 0) await Promise.all([...flight.pendingWork]);
      if (flight.workRejected) result = abstain('W14_UPSTREAM_UNAVAILABLE');
      this.#finish(flight, result);
    }
  }

  #finish(flight: Flight, result: LocalModelSessionOperationResult): void {
    try {
      const nowMs = this.#now(flight);
      if (!flight.stopped && nowMs >= flight.body.deadlineMs) this.#stop(flight, 'TIMEOUT');
      if (flight.beginAttempted && !flight.beginReturned) flight.reconciliationRequired = true;
      if (flight.admitted && !flight.completeAttempted && !flight.workProtocolFailed) {
        flight.completeAttempted = true;
        const completed = this.#deps.gatewaySessions.completeRequest(
          this.#boundOperation(flight, nowMs),
        );
        if (
          !completed.ok ||
          completed.value.state !== 'COMPLETED' ||
          completed.value.authorizesExecution !== false ||
          completed.value.requestId !== flight.body.requestId ||
          completed.value.sessionId !== flight.socket.sessionId ||
          completed.value.connectionId !== flight.socket.connectionId ||
          completed.value.deadlineMs !== flight.body.deadlineMs
        )
          flight.reconciliationRequired = true;
      }
      // No await between this last canonical check and releasing information to the caller.
      if (!flight.stopped && result.status === 'GENERATED') {
        const releaseNow = this.#now(flight);
        if (releaseNow >= flight.body.deadlineMs) this.#stop(flight, 'TIMEOUT');
        else if (
          !flight.latestAttestation ||
          !this.#evaluateCurrent(flight, flight.latestAttestation, releaseNow)
        )
          result = abstain('DEVICE_TRUST_NOT_CURRENT');
        else {
          let releaseAllowed = false;
          if (flight.releaseGuard && !flight.releaseGuardInvalid) {
            try {
              // This is the owning core producer's synchronous current read,
              // not a fabricated approval or an async optimistic-cache check.
              releaseAllowed = synchronousCurrentVerdict(flight.releaseGuard(releaseNow));
            } catch {
              releaseAllowed = false;
            }
          }
          if (!releaseAllowed || flight.releaseGuardInvalid) result = abstain('REJECTED');
          // A guard may consume the last budget or request cancellation itself.
          if (!flight.stopped && this.#now(flight) >= flight.body.deadlineMs)
            this.#stop(flight, 'TIMEOUT');
        }
      }
    } catch {
      if (flight.beginAttempted) flight.reconciliationRequired = true;
      result = abstain('W14_UPSTREAM_UNAVAILABLE');
    }
    if (flight.reconciliationRequired) {
      this.#quarantined = true;
      result = abstain('RECONCILIATION_REQUIRED');
    } else if (flight.stopped) result = abstain(flight.stopped);
    // Unknown ownership cannot be repaired by forgetting the original binding.
    if (this.#flight === flight && !flight.workProtocolFailed) this.#flight = null;
    this.#deliver(flight, result);
  }
}
