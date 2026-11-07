import {
  QWEN35_2B_Q4_K_M_SHA256,
  LOCAL_QWEN_STRATEGY_ID,
  type LocalInferenceResult,
  type LocalInferenceRequest,
  type LocalModelManifestProjection,
  type SelectedModelRouteProjection,
  type LocalModelWorkObserver,
  startObservedLocalModelWork,
  registerLocalModelWork,
} from './local-inference.js';
import {
  KeyedLocalQwenInferenceClient,
  type EphemeralLocalModelCredentialSource,
} from './keyed-local-inference.js';
import { inferWithPublicLocalModelPrompt } from './public-local-model-bridge.js';

/** Private projection of W14-owned identity, not a new session or authority record. */
export interface SessionLocalModelBinding {
  readonly tenantId: string;
  readonly actorIdentityId: string;
  readonly correlationId: string;
  readonly gatewaySessionId: string;
  readonly connectionId: string;
  readonly gatewayGeneration: number;
  readonly deviceSessionId: string;
  readonly deviceId: string;
  readonly registrationVersion: number;
  readonly requestId: string;
  readonly deadlineMs: number;
}

/**
 * Prepared by the trusted W05/W06 composition, NEVER deserialized from Android or model output.
 * Binding, timestamps and this discriminant do not prove provenance or grant permission.
 */
export interface SessionLocalModelPreparation {
  readonly kind: 'W05_W06_SESSION_LOCAL_MODEL_PREPARATION';
  readonly binding: SessionLocalModelBinding;
  readonly preparationRef: string;
  readonly observedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly route: SelectedModelRouteProjection;
  readonly manifest: LocalModelManifestProjection;
  readonly minimizedPublicPrompt: unknown;
  readonly maxOutputTokens: number;
}

/**
 * Trusted producer port, not a consent engine. Its owner must invoke the existing W05/W06
 * producers using authenticated identity and CURRENT purpose/consent/source policy. A true
 * revalidation is an internal lookup result, never a caller-supplied approval or OS permission.
 * No production producer or application/HTTP/native wiring is installed by this readiness leaf.
 * Implementations must be asynchronous/cooperatively cancellable and must not block the event loop.
 */
export interface SessionLocalModelPreparationSource {
  prepareCurrent(
    binding: SessionLocalModelBinding,
    signal: AbortSignal,
    registerWork?: LocalModelWorkObserver,
  ): Promise<SessionLocalModelPreparation | null>;
  revalidateCurrent(
    preparationRef: string,
    binding: SessionLocalModelBinding,
    nowEpochMs: number,
    signal: AbortSignal,
    registerWork?: LocalModelWorkObserver,
  ): Promise<boolean>;
  /** Synchronous, side-effect-free current lookup, not an optimistic cached approval. */
  isCurrent(preparationRef: string, binding: SessionLocalModelBinding, nowEpochMs: number): boolean;
}

/** Private W14-owned callbacks; never accepted from the model or a network request body. */
export interface SessionLocalModelGuards {
  revalidateCurrent(): Promise<boolean>;
  isCurrent(): boolean;
  registerReleaseGuard(guard: (nowEpochMs: number) => boolean): void;
  registerWork(work: Promise<unknown>): void;
}

export interface SessionBoundLocalModelDependencies {
  /** Keep one existing bounded client; replacing it after a timeout would evade its BUSY guard. */
  readonly client: {
    /** The trusted adapter must enforce this guard immediately before its actual transport call. */
    infer(
      request: LocalInferenceRequest,
      dispatchGuard: () => boolean,
      registerWork: LocalModelWorkObserver,
    ): Promise<LocalInferenceResult>;
  };
  readonly source?: SessionLocalModelPreparationSource;
  readonly now: () => number;
}

const BINDING_KEYS = [
  'tenantId',
  'actorIdentityId',
  'correlationId',
  'gatewaySessionId',
  'connectionId',
  'gatewayGeneration',
  'deviceSessionId',
  'deviceId',
  'registrationVersion',
  'requestId',
  'deadlineMs',
] as const;
const PREPARATION_KEYS = [
  'kind',
  'binding',
  'preparationRef',
  'observedAtEpochMs',
  'expiresAtEpochMs',
  'route',
  'manifest',
  'minimizedPublicPrompt',
  'maxOutputTokens',
] as const;
const FAILURE_CODES = new Set([
  'INVALID_REQUEST',
  'INVALID_ROUTE',
  'UNVERIFIED_MODEL',
  'STALE_MODEL',
  'BUSY',
  'CANCELLED',
  'TIMEOUT',
  'UNAVAILABLE',
  'REJECTED',
  'MALFORMED_RESPONSE',
]);
const MAX_REQUEST_MS = 30_000;
const MAX_PREPARATION_AGE_MS = 10_000;
const MAX_TIME_MS = 8_640_000_000_000_000;
const SAFE_REFERENCE = /^[A-Za-z0-9._:-]+$/u;
const NO_AUTHORITY = {
  authoritySemantics: 'INTELLIGENCE_ONLY_NO_AUTHORITY',
  authorizesExecution: false,
  canInvokeTools: false,
} as const;

function abstain(
  code: Extract<LocalInferenceResult, { status: 'ABSTAINED' }>['code'],
): LocalInferenceResult {
  return { ...NO_AUTHORITY, status: 'ABSTAINED', code };
}

function synchronousTrue(value: unknown): boolean {
  if (value === true) return true;
  if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
    try {
      // Reject async approvals, but contain rejection from a mistaken native Promise.
      // Do not inspect or assimilate an arbitrary then accessor.
      void Promise.prototype.then.call(
        value,
        () => undefined,
        () => undefined,
      );
    } catch {
      // A non-Promise remains a denied synchronous verdict.
    }
  }
  return false;
}

function time(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIME_MS
  );
}

function reference(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    SAFE_REFERENCE.test(value)
  );
}

/** Bounded own-data capture: no accessors, coercion, iterators, JSON hooks or retained aliases. */
function capture(value: unknown): unknown {
  let nodes = 0;
  let textUnits = 0;
  const active = new Set<object>();
  const visit = (part: unknown, depth: number): unknown => {
    nodes += 1;
    if (nodes > 1_024 || depth > 16) throw new Error('INVALID_PREPARATION');
    if (typeof part === 'string') {
      textUnits += part.length;
      if (textUnits > 65_536) throw new Error('INVALID_PREPARATION');
      return part;
    }
    if (part === null || part === undefined || typeof part === 'boolean') return part;
    if (typeof part === 'number' && Number.isFinite(part)) return part;
    if (typeof part !== 'object' || active.has(part)) throw new Error('INVALID_PREPARATION');
    const array = Array.isArray(part);
    const prototype = Object.getPrototypeOf(part);
    if (prototype !== null && prototype !== (array ? Array.prototype : Object.prototype)) {
      throw new Error('INVALID_PREPARATION');
    }
    const keys = Reflect.ownKeys(part);
    if (keys.length > 129 || keys.some((key) => typeof key !== 'string')) {
      throw new Error('INVALID_PREPARATION');
    }
    active.add(part);
    try {
      if (array) {
        const length = Object.getOwnPropertyDescriptor(part, 'length')?.value as unknown;
        if (
          typeof length !== 'number' ||
          !Number.isSafeInteger(length) ||
          length < 0 ||
          length > 128 ||
          keys.length !== length + 1
        ) {
          throw new Error('INVALID_PREPARATION');
        }
        const copy: unknown[] = [];
        for (let index = 0; index < length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(part, String(index));
          if (!descriptor || !('value' in descriptor)) throw new Error('INVALID_PREPARATION');
          copy.push(visit(descriptor.value, depth + 1));
        }
        return Object.freeze(copy);
      }
      const copy: Record<string, unknown> = {};
      for (const key of keys as string[]) {
        const descriptor = Object.getOwnPropertyDescriptor(part, key);
        if (!descriptor || !('value' in descriptor)) throw new Error('INVALID_PREPARATION');
        Object.defineProperty(copy, key, {
          value: visit(descriptor.value, depth + 1),
          enumerable: true,
        });
      }
      return Object.freeze(copy);
    } finally {
      active.delete(part);
    }
  };
  return visit(value, 0);
}

function ownRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Reflect.ownKeys(value);
  return (
    actual.length === keys.length &&
    actual.every((key) => typeof key === 'string' && keys.includes(key))
  );
}

function bindingFrom(value: unknown): SessionLocalModelBinding | null {
  if (!ownRecord(value, BINDING_KEYS)) return null;
  for (const key of BINDING_KEYS) {
    if (key === 'gatewayGeneration' || key === 'registrationVersion') {
      if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 1) return null;
    } else if (key === 'deadlineMs') {
      if (!time(value[key])) return null;
    } else if (!reference(value[key])) return null;
  }
  if ((value.requestId as string).length > 128 || (value.gatewaySessionId as string).length > 128)
    return null;
  return value as unknown as SessionLocalModelBinding;
}

function guardsFrom(value: unknown): SessionLocalModelGuards | null {
  const keys = ['revalidateCurrent', 'isCurrent', 'registerReleaseGuard', 'registerWork'] as const;
  if (!ownRecord(value, keys)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const copy: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'function')
      return null;
    copy[key] = descriptor.value;
  }
  return Object.freeze(copy) as unknown as SessionLocalModelGuards;
}

const signalGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')?.get;
function aborted(signal: AbortSignal): boolean {
  if (!signalGetter) throw new Error('SIGNAL_UNAVAILABLE');
  return signalGetter.call(signal) === true;
}

function hasInvalidTextControl(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) return true;
  }
  return false;
}

function cleanResult(value: unknown): LocalInferenceResult {
  const result = capture(value);
  if (!result || typeof result !== 'object' || Array.isArray(result))
    return abstain('MALFORMED_RESPONSE');
  const data = result as Record<string, unknown>;
  if (
    data.authoritySemantics !== NO_AUTHORITY.authoritySemantics ||
    data.authorizesExecution !== false ||
    data.canInvokeTools !== false
  )
    return abstain('MALFORMED_RESPONSE');
  if (
    data.status === 'ABSTAINED' &&
    ownRecord(data, [
      'authoritySemantics',
      'authorizesExecution',
      'canInvokeTools',
      'status',
      'code',
    ]) &&
    typeof data.code === 'string' &&
    FAILURE_CODES.has(data.code)
  ) {
    return abstain(data.code as Extract<LocalInferenceResult, { status: 'ABSTAINED' }>['code']);
  }
  if (
    !ownRecord(data, [
      'authoritySemantics',
      'authorizesExecution',
      'canInvokeTools',
      'status',
      'content',
      'strategyId',
      'modelSha256',
    ]) ||
    data.status !== 'GENERATED' ||
    data.strategyId !== LOCAL_QWEN_STRATEGY_ID ||
    data.modelSha256 !== QWEN35_2B_Q4_K_M_SHA256 ||
    typeof data.content !== 'string' ||
    data.content.trim().length === 0 ||
    new TextEncoder().encode(data.content).byteLength > 32_768 ||
    hasInvalidTextControl(data.content)
  )
    return abstain('MALFORMED_RESPONSE');
  return {
    ...NO_AUTHORITY,
    status: 'GENERATED',
    content: data.content,
    strategyId: LOCAL_QWEN_STRATEGY_ID,
    modelSha256: QWEN35_2B_Q4_K_M_SHA256,
  };
}

/**
 * Private readiness composition: W14-bound identity -> current W05/W06 preparation -> existing
 * bounded information-only client. No host route, native activation, model, policy or executor.
 * Logical completion never proves model/transport quiescence. The persistent client's own BUSY
 * guard remains authoritative for its underlying work after its Promise returns TIMEOUT/CANCELLED.
 */
export class SessionBoundLocalModel {
  readonly #client: SessionBoundLocalModelDependencies['client'];
  readonly #source: SessionLocalModelPreparationSource | undefined;
  readonly #now: () => number;
  #busy = false;

  constructor(dependencies: SessionBoundLocalModelDependencies) {
    this.#client = dependencies.client;
    this.#source = dependencies.source;
    this.#now = dependencies.now;
  }

  infer(
    input: SessionLocalModelBinding,
    signal: AbortSignal,
    sessionGuards: SessionLocalModelGuards,
  ): Promise<LocalInferenceResult> {
    let binding: SessionLocalModelBinding | null;
    let guards: SessionLocalModelGuards | null;
    let startedAt: number;
    try {
      guards = guardsFrom(sessionGuards);
      if (guards === null) return Promise.resolve(abstain('INVALID_REQUEST'));
    } catch {
      return Promise.resolve(abstain('INVALID_REQUEST'));
    }
    // The mandatory root fence is registered synchronously, even for a genuine
    // no-work rejection. It settles only after the producer and every admitted
    // descendant operation have terminated; it is NOT the logical response.
    let resolveRoot: () => void = () => undefined;
    const rootWork = new Promise<void>((resolve) => {
      resolveRoot = resolve;
    });
    try {
      registerLocalModelWork(guards.registerWork, rootWork);
    } catch {
      resolveRoot();
      return Promise.resolve(abstain('UNAVAILABLE'));
    }
    const noWork = (code: Extract<LocalInferenceResult, { status: 'ABSTAINED' }>['code']) => {
      resolveRoot();
      return Promise.resolve(abstain(code));
    };
    try {
      binding = bindingFrom(capture(input));
      if (binding === null) return noWork('INVALID_REQUEST');
      if (aborted(signal)) return noWork('CANCELLED');
      startedAt = this.#now();
      if (!time(startedAt) || binding.deadlineMs - startedAt > MAX_REQUEST_MS)
        return noWork('INVALID_REQUEST');
      if (binding.deadlineMs <= startedAt) return noWork('TIMEOUT');
    } catch {
      return noWork('INVALID_REQUEST');
    }
    if (!this.#source) return noWork('UNAVAILABLE');
    if (this.#busy) return noWork('BUSY');
    this.#busy = true;
    const capturedBinding = binding;
    const capturedGuards = guards;
    const controller = new AbortController();
    let producerDone = false;
    const pendingWork = new Set<Promise<void>>();
    const releaseIfQuiescent = (): void => {
      if (!producerDone || pendingWork.size !== 0) return;
      this.#busy = false;
      resolveRoot();
    };
    const registerWork: LocalModelWorkObserver = (work) => {
      // Delegate first: the gated descendant must not start if admission fails.
      registerLocalModelWork(capturedGuards.registerWork, work);
      const settled = Promise.prototype.then.call(
        work,
        () => undefined,
        () => undefined,
      ) as Promise<void>;
      pendingWork.add(settled);
      void settled.then(() => {
        pendingWork.delete(settled);
        releaseIfQuiescent();
      });
    };
    return new Promise((resolve) => {
      let finished = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const detach = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        // Cleanup must not turn a fail-closed outcome into an unhandled rejection/hang.
        try {
          EventTarget.prototype.removeEventListener.call(signal, 'abort', onCancel);
        } catch {
          // A revoked signal proxy cannot be detached; resolve the bounded result regardless.
        }
      };
      const finish = (result: LocalInferenceResult): void => {
        if (finished) return;
        let safeResult = result;
        try {
          if (aborted(signal)) safeResult = abstain('CANCELLED');
        } catch {
          safeResult = abstain('INVALID_REQUEST');
        }
        finished = true;
        detach();
        resolve(safeResult);
      };
      const stop = (code: 'CANCELLED' | 'TIMEOUT'): void => {
        controller.abort();
        finish(abstain(code));
      };
      const onCancel = (): void => stop('CANCELLED');
      try {
        EventTarget.prototype.addEventListener.call(signal, 'abort', onCancel, { once: true });
        timer = setTimeout(() => stop('TIMEOUT'), capturedBinding.deadlineMs - startedAt);
        if (aborted(signal)) {
          onCancel();
          producerDone = true;
          releaseIfQuiescent();
          return;
        }
      } catch {
        producerDone = true;
        releaseIfQuiescent();
        finish(abstain('INVALID_REQUEST'));
        return;
      }
      void this.#produce(
        capturedBinding,
        controller.signal,
        capturedGuards,
        startedAt,
        registerWork,
      ).then(
        (result) => {
          producerDone = true;
          releaseIfQuiescent();
          finish(result);
        },
        () => {
          producerDone = true;
          releaseIfQuiescent();
          finish(abstain('UNAVAILABLE'));
        },
      );
    });
  }

  #currentTime(
    binding: SessionLocalModelBinding,
    startedAt: number,
    signal: AbortSignal,
  ): number | null {
    const current = this.#now();
    return !aborted(signal) && time(current) && current >= startedAt && current < binding.deadlineMs
      ? current
      : null;
  }

  async #produce(
    binding: SessionLocalModelBinding,
    signal: AbortSignal,
    guards: SessionLocalModelGuards,
    startedAt: number,
    registerWork: LocalModelWorkObserver,
  ): Promise<LocalInferenceResult> {
    const source = this.#source;
    if (!source) return abstain('UNAVAILABLE');
    // Do not call a producer after the logical timeout/cancel has already won.
    if (this.#currentTime(binding, startedAt, signal) === null)
      return abstain(aborted(signal) ? 'CANCELLED' : 'TIMEOUT');
    const raw = await startObservedLocalModelWork(
      () => source.prepareCurrent(binding, signal, registerWork),
      registerWork,
    );
    if (aborted(signal)) return abstain('CANCELLED');
    if (raw === null) return abstain('UNAVAILABLE');
    const snapshot = capture(raw);
    if (
      !ownRecord(snapshot, PREPARATION_KEYS) ||
      snapshot.kind !== 'W05_W06_SESSION_LOCAL_MODEL_PREPARATION'
    )
      return abstain('INVALID_REQUEST');
    const preparedBinding = bindingFrom(snapshot.binding);
    if (
      !preparedBinding ||
      BINDING_KEYS.some((key) => preparedBinding[key] !== binding[key]) ||
      !reference(snapshot.preparationRef)
    )
      return abstain('INVALID_REQUEST');
    if (
      !time(snapshot.observedAtEpochMs) ||
      !time(snapshot.expiresAtEpochMs) ||
      snapshot.expiresAtEpochMs > binding.deadlineMs ||
      snapshot.expiresAtEpochMs <= snapshot.observedAtEpochMs ||
      snapshot.expiresAtEpochMs - snapshot.observedAtEpochMs > MAX_PREPARATION_AGE_MS ||
      !Number.isSafeInteger(snapshot.maxOutputTokens) ||
      (snapshot.maxOutputTokens as number) < 1 ||
      (snapshot.maxOutputTokens as number) > 256
    )
      return abstain('INVALID_REQUEST');
    const prepared = snapshot as unknown as SessionLocalModelPreparation;
    let lastObservedAt = startedAt;
    const current = (): number | null => {
      const observed = this.#currentTime(binding, startedAt, signal);
      if (observed === null || observed < lastObservedAt) return null;
      lastObservedAt = observed;
      return observed >= prepared.observedAtEpochMs &&
        observed < prepared.expiresAtEpochMs &&
        observed - prepared.observedAtEpochMs <= MAX_PREPARATION_AGE_MS
        ? observed
        : null;
    };
    const sourceCurrent = (releaseAt?: number): boolean => {
      const now = current();
      if (now === null) return false;
      const observed = releaseAt === undefined ? now : Math.max(now, releaseAt);
      if (
        (releaseAt !== undefined && (!time(releaseAt) || releaseAt < startedAt)) ||
        observed >= prepared.expiresAtEpochMs ||
        observed >= binding.deadlineMs
      )
        return false;
      return (
        synchronousTrue(source.isCurrent(prepared.preparationRef, binding, observed)) &&
        current() !== null
      );
    };
    // W14 rechecks this captured preparation after its last asynchronous session check.
    guards.registerReleaseGuard((releaseAt) => {
      try {
        return sourceCurrent(releaseAt);
      } catch {
        return false;
      }
    });
    const live = (): boolean =>
      sourceCurrent() && synchronousTrue(guards.isCurrent()) && current() !== null;
    const validate = async (): Promise<boolean> => {
      let now = current();
      if (now === null) return false;
      const checkedAt = now;
      if (
        (await startObservedLocalModelWork(
          () =>
            source.revalidateCurrent(
              prepared.preparationRef,
              binding,
              checkedAt,
              signal,
              registerWork,
            ),
          registerWork,
        )) !== true
      )
        return false;
      now = current();
      if (now === null || (await guards.revalidateCurrent()) !== true) return false;
      return current() !== null;
    };
    if (!(await validate()) || !live()) return abstain(aborted(signal) ? 'CANCELLED' : 'REJECTED');
    const result = await inferWithPublicLocalModelPrompt(
      {
        infer: (request) =>
          startObservedLocalModelWork(
            () => this.#client.infer(request, live, registerWork),
            registerWork,
          ),
      },
      {
        tenantId: binding.tenantId,
        correlationId: binding.correlationId,
        route: prepared.route,
        manifest: prepared.manifest,
        minimizedPublicPrompt: prepared.minimizedPublicPrompt,
        maxOutputTokens: prepared.maxOutputTokens,
        deadlineEpochMs: Math.min(binding.deadlineMs, prepared.expiresAtEpochMs),
        signal,
      },
    );
    if (!(await validate()) || !live()) return abstain(aborted(signal) ? 'CANCELLED' : 'REJECTED');
    return cleanResult(result);
  }
}

/**
 * Supported private session composition for the EXISTING keyed HTTP client, not JNI.
 * One persistent bounded client is shared; the last synchronous dispatch check occurs
 * AFTER credential lookup. This factory installs no host route, fetch default or runtime.
 * Only a trusted transport injected by the eventual owner can perform network I/O.
 */
export function createSessionBoundKeyedLocalModel(dependencies: {
  readonly credentialSource: EphemeralLocalModelCredentialSource;
  readonly transport: typeof fetch;
  readonly source?: SessionLocalModelPreparationSource;
  readonly now: () => number;
}): SessionBoundLocalModel {
  const transport = dependencies.transport;
  let activeGuard: (() => boolean) | null = null;
  const keyed = new KeyedLocalQwenInferenceClient({
    credentialSource: dependencies.credentialSource,
    now: dependencies.now,
    transport: (input, init) => {
      const guard = activeGuard;
      if (
        guard === null ||
        !init?.signal ||
        aborted(init.signal) ||
        !synchronousTrue(guard()) ||
        aborted(init.signal)
      )
        throw new Error('SESSION_LOCAL_MODEL_DISPATCH_REJECTED');
      // There is deliberately no await between the current guard and this call.
      return transport(input, init);
    },
  });
  return new SessionBoundLocalModel({
    ...(dependencies.source === undefined ? {} : { source: dependencies.source }),
    now: dependencies.now,
    client: {
      async infer(request, guard, registerWork) {
        if (activeGuard !== null) return abstain('BUSY');
        // Cleanup is separately owned so the captured guard cannot be lent to a
        // newer request while the original credential/transport still runs.
        let finishCleanup: () => void = () => undefined;
        const cleanup = new Promise<void>((resolve) => {
          finishCleanup = resolve;
        });
        try {
          registerLocalModelWork(registerWork, cleanup);
        } catch {
          finishCleanup();
          return abstain('UNAVAILABLE');
        }
        let logicalDone = false;
        const pending = new Set<Promise<void>>();
        const release = (): void => {
          if (!logicalDone || pending.size !== 0) return;
          if (activeGuard === guard) activeGuard = null;
          finishCleanup();
        };
        const observe: LocalModelWorkObserver = (work) => {
          registerLocalModelWork(registerWork, work);
          const settled = Promise.prototype.then.call(
            work,
            () => undefined,
            () => undefined,
          ) as Promise<void>;
          pending.add(settled);
          void settled.then(() => {
            pending.delete(settled);
            release();
          });
        };
        activeGuard = guard;
        try {
          return await keyed.infer(request, observe);
        } finally {
          logicalDone = true;
          release();
        }
      },
    },
  });
}
