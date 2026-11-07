import {
  LOCAL_QWEN_MODEL_ID,
  LOCAL_QWEN_STRATEGY_ID,
  QWEN35_2B_Q4_K_M_SHA256,
  type LocalModelManifestProjection,
  type SelectedModelRouteProjection,
  type LocalModelWorkObserver,
  startObservedLocalModelWork,
  registerLocalModelWork,
} from './local-inference.js';
import type {
  SessionLocalModelBinding,
  SessionLocalModelPreparation,
  SessionLocalModelPreparationSource,
} from './session-bound-local-model.js';

/** Private structural W06 consumption port; no public cross-package API is published. */
export interface CurrentPublicModelContextPreparation {
  readonly kind: 'CURRENT_PUBLIC_MODEL_CONTEXT_PREPARATION';
  readonly binding: SessionLocalModelBinding;
  readonly contextRef: string;
  readonly observedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly minimizedPublicPrompt: unknown;
}

export interface CurrentPublicModelContextPort {
  prepareCurrent(
    binding: SessionLocalModelBinding,
    signal: AbortSignal,
    registerWork?: LocalModelWorkObserver,
  ): Promise<CurrentPublicModelContextPreparation | null>;
  revalidateCurrent(
    reference: string,
    binding: SessionLocalModelBinding,
    nowEpochMs: number,
    signal: AbortSignal,
    registerWork?: LocalModelWorkObserver,
  ): Promise<boolean>;
  isCurrent(reference: string, binding: SessionLocalModelBinding, nowEpochMs: number): boolean;
}

/** Current owner records, never Android/model-supplied approvals or a preselected route. */
export interface CurrentLocalModelRoutingRecord {
  readonly kind: 'CURRENT_LOCAL_MODEL_ROUTING_RECORD';
  readonly reference: string;
  readonly binding: SessionLocalModelBinding;
  readonly observedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly routerRequest: Readonly<Record<string, unknown>>;
  readonly manifest: LocalModelManifestProjection;
  readonly maxOutputTokens: number;
}

export interface CurrentLocalModelRoutingOwner {
  readCurrent(binding: SessionLocalModelBinding): CurrentLocalModelRoutingRecord | null;
  /** The existing W05-E port, not a second strategy registry. */
  readonly strategies: { readonly registryVersion: string; select(criteria: unknown): unknown };
  /** Bind the canonical W05-B function in the owning composition, not a permissive stub. */
  routeIntelligence(request: Readonly<Record<string, unknown>>): unknown;
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
const RECORD_KEYS = [
  'kind',
  'reference',
  'binding',
  'observedAtEpochMs',
  'expiresAtEpochMs',
  'routerRequest',
  'manifest',
  'maxOutputTokens',
];
const ROUTER_KEYS = [
  'tenant',
  'correlation',
  'classification',
  'reasoning',
  'confidence',
  'lane',
  'capabilityPlan',
  'budget',
  'preferences',
];
const CONTEXT_KEYS = [
  'kind',
  'binding',
  'contextRef',
  'observedAtEpochMs',
  'expiresAtEpochMs',
  'minimizedPublicPrompt',
];
const MAX_AGE_MS = 10_000;
const MAX_TIME = 8_640_000_000_000_000;
type Data = Readonly<Record<string, unknown>>;

function data(value: unknown): value is Data {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function keys(value: unknown, expected: readonly string[]): value is Data {
  return (
    data(value) &&
    Object.keys(value).length === expected.length &&
    Object.keys(value).every((key) => expected.includes(key))
  );
}

function time(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIME
  );
}

function reference(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    /^[A-Za-z0-9._:-]+$/u.test(value)
  );
}

function drainNativePromise(value: unknown): void {
  try {
    // Reject asynchronous synchronous-port results without invoking arbitrary then accessors.
    void Promise.prototype.then.call(
      value,
      () => undefined,
      () => undefined,
    );
  } catch {
    /* Not a native Promise; it is still never approval. */
  }
}

/** Bounded immutable own-data copy, with sorted keys for deterministic equality. */
function capture(input: unknown): unknown {
  let nodes = 0;
  let text = 0;
  const active = new Set<object>();
  const visit = (value: unknown, depth: number): unknown => {
    if (++nodes > 2_048 || depth > 24) throw new Error('INVALID_CURRENT_RECORD');
    if (typeof value === 'string') {
      text += value.length;
      if (text > 65_536) throw new Error('INVALID_CURRENT_RECORD');
      return value;
    }
    if (value === null || value === undefined || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object' || active.has(value)) throw new Error('INVALID_CURRENT_RECORD');
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== (array ? Array.prototype : Object.prototype)) {
      drainNativePromise(value);
      throw new Error('INVALID_CURRENT_RECORD');
    }
    const fields = Reflect.ownKeys(value);
    if (fields.length > 129 || fields.some((key) => typeof key !== 'string'))
      throw new Error('INVALID_CURRENT_RECORD');
    active.add(value);
    try {
      if (array) {
        const length = Object.getOwnPropertyDescriptor(value, 'length')?.value as unknown;
        if (
          typeof length !== 'number' ||
          !Number.isInteger(length) ||
          length < 0 ||
          length > 128 ||
          fields.length !== length + 1
        )
          throw new Error('INVALID_CURRENT_RECORD');
        const result: unknown[] = [];
        for (let i = 0; i < length; i += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
          if (!descriptor || !('value' in descriptor)) throw new Error('INVALID_CURRENT_RECORD');
          result.push(visit(descriptor.value, depth + 1));
        }
        return Object.freeze(result);
      }
      const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const key of (fields as string[]).sort()) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !('value' in descriptor)) throw new Error('INVALID_CURRENT_RECORD');
        result[key] = visit(descriptor.value, depth + 1);
      }
      return Object.freeze(result);
    } finally {
      active.delete(value);
    }
  };
  return visit(input, 0);
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function bindingOf(input: unknown): SessionLocalModelBinding | null {
  const value = capture(input);
  if (!keys(value, BINDING_KEYS)) return null;
  for (const key of BINDING_KEYS) {
    if (key === 'deadlineMs') {
      if (!time(value[key])) return null;
    } else if (key === 'gatewayGeneration' || key === 'registrationVersion') {
      if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 1) return null;
    } else if (!reference(value[key])) return null;
  }
  if ((value.requestId as string).length > 128 || (value.gatewaySessionId as string).length > 128)
    return null;
  return value as unknown as SessionLocalModelBinding;
}

function liveWindow(value: Data, now: number, deadline: number): boolean {
  return (
    time(value.observedAtEpochMs) &&
    time(value.expiresAtEpochMs) &&
    value.observedAtEpochMs <= now &&
    now < value.expiresAtEpochMs &&
    value.expiresAtEpochMs <= deadline &&
    value.expiresAtEpochMs > value.observedAtEpochMs &&
    value.expiresAtEpochMs - value.observedAtEpochMs <= MAX_AGE_MS
  );
}

function manifestValid(value: unknown, now: number): value is LocalModelManifestProjection {
  return (
    keys(value, [
      'source',
      'modelId',
      'modelSha256',
      'observedAtEpochMs',
      'maxAgeMs',
      'authorizesExecution',
    ]) &&
    value.source === 'LOCAL_RUNTIME_MANIFEST_PROJECTION' &&
    value.modelId === LOCAL_QWEN_MODEL_ID &&
    value.modelSha256 === QWEN35_2B_Q4_K_M_SHA256 &&
    value.authorizesExecution === false &&
    time(value.observedAtEpochMs) &&
    value.observedAtEpochMs <= now &&
    typeof value.maxAgeMs === 'number' &&
    Number.isSafeInteger(value.maxAgeMs) &&
    value.maxAgeMs > 0 &&
    value.maxAgeMs <= MAX_AGE_MS &&
    now - value.observedAtEpochMs <= value.maxAgeMs
  );
}

function routerScope(value: unknown, binding: SessionLocalModelBinding): value is Data {
  if (
    !keys(value, ROUTER_KEYS) ||
    !data(value.tenant) ||
    !data(value.correlation) ||
    value.tenant.tenantId !== binding.tenantId ||
    value.correlation.correlationId !== binding.correlationId
  )
    return false;
  for (const name of ['classification', 'reasoning', 'confidence']) {
    const nested = value[name];
    if (
      !data(nested) ||
      !data(nested.tenant) ||
      !data(nested.correlation) ||
      nested.tenant.tenantId !== binding.tenantId ||
      nested.correlation.correlationId !== binding.correlationId
    )
      return false;
  }
  for (const name of ['lane', 'capabilityPlan', 'budget']) {
    const nested = value[name];
    if (
      !data(nested) ||
      nested.tenantId !== binding.tenantId ||
      nested.correlationId !== binding.correlationId
    )
      return false;
  }
  return true;
}

function routeValid(
  value: unknown,
  binding: SessionLocalModelBinding,
  registryVersion: string,
): value is SelectedModelRouteProjection {
  return (
    data(value) &&
    value.status === 'SELECTED' &&
    value.family === 'MODEL' &&
    value.strategyId === LOCAL_QWEN_STRATEGY_ID &&
    reference(value.strategyVersion) &&
    (value.selectedVia === 'PREFERRED' || value.selectedVia === 'FALLBACK') &&
    value.currentAvailability === 'CURRENT_AVAILABLE' &&
    value.authoritySemantics === 'INTELLIGENCE_ONLY_NO_AUTHORITY' &&
    value.authorizesExecution === false &&
    value.downstreamExecutionStillRequiresCurrentValidation === true &&
    value.canInvokeTools !== true &&
    value.canGrantPermission !== true &&
    data(value.tenant) &&
    value.tenant.tenantId === binding.tenantId &&
    data(value.correlation) &&
    value.correlation.correlationId === binding.correlationId &&
    data(value.evidence) &&
    value.evidence.strategyRegistryVersion === registryVersion &&
    value.evidence.capabilityPlanStatus === 'READY' &&
    value.evidence.budgetState === 'WITHIN_BUDGET' &&
    value.evidence.budgetAction === 'CONTINUE_OPTIONAL'
  );
}

const signalAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')?.get;
function aborted(signal: AbortSignal): boolean {
  if (!signalAborted) throw new Error('SIGNAL_UNAVAILABLE');
  return signalAborted.call(signal) === true;
}

interface ActivePreparation {
  readonly prepared: SessionLocalModelPreparation;
  readonly routing: CurrentLocalModelRoutingRecord;
  readonly context: CurrentPublicModelContextPreparation;
  readonly signal: AbortSignal;
  lastNow: number;
}

/**
 * Private composition, not a current-record store or an activated Host. One bounded
 * capture is retained, always re-read; its handle is never a permission token. A
 * pending uncooperative context read keeps this instance busy until it settles.
 * SessionBoundLocalModel owns the independent cancellation/deadline response.
 */
export class CurrentLocalModelPreparationSource implements SessionLocalModelPreparationSource {
  readonly #now: () => number;
  readonly #context: CurrentPublicModelContextPort | undefined;
  readonly #routing: CurrentLocalModelRoutingOwner | undefined;
  #active: ActivePreparation | null = null;
  #busy = false;
  #sequence = 0;

  constructor(dependencies: {
    readonly now: () => number;
    readonly context?: CurrentPublicModelContextPort;
    readonly routing?: CurrentLocalModelRoutingOwner;
  }) {
    this.#now = dependencies.now;
    this.#context = dependencies.context;
    this.#routing = dependencies.routing;
  }

  #readRouting(
    binding: SessionLocalModelBinding,
    now: number,
  ): { record: CurrentLocalModelRoutingRecord; route: SelectedModelRouteProjection } | null {
    const owner = this.#routing;
    if (!owner) return null;
    const value = capture(owner.readCurrent(binding));
    if (
      !keys(value, RECORD_KEYS) ||
      value.kind !== 'CURRENT_LOCAL_MODEL_ROUTING_RECORD' ||
      !reference(value.reference) ||
      !same(bindingOf(value.binding), binding) ||
      !liveWindow(value, now, binding.deadlineMs) ||
      !routerScope(value.routerRequest, binding) ||
      !manifestValid(value.manifest, now) ||
      !Number.isSafeInteger(value.maxOutputTokens) ||
      (value.maxOutputTokens as number) < 1 ||
      (value.maxOutputTokens as number) > 256
    )
      return null;
    const registryVersion = owner.strategies.registryVersion;
    if (!reference(registryVersion) || typeof owner.strategies.select !== 'function') return null;
    const route = capture(
      owner.routeIntelligence(
        Object.freeze({ ...value.routerRequest, strategies: owner.strategies, nowEpochMs: now }),
      ),
    );
    if (
      !routeValid(route, binding, registryVersion) ||
      owner.strategies.registryVersion !== registryVersion
    )
      return null;
    return { record: value as unknown as CurrentLocalModelRoutingRecord, route };
  }

  async prepareCurrent(
    input: SessionLocalModelBinding,
    signal: AbortSignal,
    registerWork?: LocalModelWorkObserver,
  ): Promise<SessionLocalModelPreparation | null> {
    if (this.#busy) return null;
    this.#active = null;
    let binding: SessionLocalModelBinding | null;
    let start: number;
    try {
      binding = bindingOf(input);
      start = this.#now();
      if (
        !binding ||
        !time(start) ||
        binding.deadlineMs <= start ||
        binding.deadlineMs - start > 30_000 ||
        aborted(signal) ||
        !this.#context ||
        !this.#routing
      )
        return null;
    } catch {
      return null;
    }
    this.#busy = true;
    const contextSource = this.#context;
    let producerDone = false;
    const pending = new Set<Promise<void>>();
    const release = (): void => {
      if (producerDone && pending.size === 0) this.#busy = false;
    };
    const observe: LocalModelWorkObserver = (work) => {
      if (registerWork !== undefined) registerLocalModelWork(registerWork, work);
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
    try {
      return await startObservedLocalModelWork(async () => {
        if (aborted(signal)) return null;
        const routing = this.#readRouting(binding, start);
        if (!routing) return null;
        const context = capture(await contextSource.prepareCurrent(binding, signal, observe));
        const now = this.#now();
        if (
          !time(now) ||
          now < start ||
          aborted(signal) ||
          !keys(context, CONTEXT_KEYS) ||
          context.kind !== 'CURRENT_PUBLIC_MODEL_CONTEXT_PREPARATION' ||
          !reference(context.contextRef) ||
          !same(bindingOf(context.binding), binding) ||
          !liveWindow(context, now, binding.deadlineMs)
        )
          return null;
        const prompt = context.minimizedPublicPrompt;
        if (
          !data(prompt) ||
          prompt.status !== 'READY' ||
          prompt.authorizesExecution !== false ||
          prompt.canInvokeTools !== false ||
          prompt.purpose !== 'INFORMATION_ONLY' ||
          prompt.tenantId !== binding.tenantId ||
          prompt.correlationId !== binding.correlationId
        )
          return null;
        const current = this.#readRouting(binding, now);
        if (
          !current ||
          !same(current.record, routing.record) ||
          !same(current.route, routing.route)
        )
          return null;
        if (this.#sequence >= Number.MAX_SAFE_INTEGER) return null;
        const expiresAtEpochMs = Math.min(
          binding.deadlineMs,
          routing.record.expiresAtEpochMs,
          context.expiresAtEpochMs as number,
          now + MAX_AGE_MS,
        );
        const prepared: SessionLocalModelPreparation = Object.freeze({
          kind: 'W05_W06_SESSION_LOCAL_MODEL_PREPARATION',
          binding,
          preparationRef: 'local-preparation:' + String(++this.#sequence),
          observedAtEpochMs: now,
          expiresAtEpochMs,
          route: current.route,
          manifest: current.record.manifest,
          minimizedPublicPrompt: context.minimizedPublicPrompt,
          maxOutputTokens: current.record.maxOutputTokens,
        });
        this.#active = {
          prepared,
          routing: current.record,
          context: context as unknown as CurrentPublicModelContextPreparation,
          signal,
          lastNow: now,
        };
        return this.isCurrent(prepared.preparationRef, binding, now) ? prepared : null;
      }, registerWork);
    } catch {
      this.#active = null;
      return null;
    } finally {
      producerDone = true;
      release();
    }
  }

  isCurrent(reference_: string, input: SessionLocalModelBinding, nowEpochMs: number): boolean {
    const active = this.#active;
    if (!active || active.prepared.preparationRef !== reference_) return false;
    let binding: SessionLocalModelBinding | null;
    try {
      binding = bindingOf(input);
    } catch {
      return false;
    }
    if (!binding || !same(binding, active.prepared.binding) || !time(nowEpochMs)) return false;
    // An observed loss of currentness permanently retires this capture. Recovery
    // requires a new preparation; restoring old source bytes is not a new grant.
    const deny = (): false => {
      if (this.#active === active) this.#active = null;
      return false;
    };
    try {
      const clock = this.#now();
      if (
        !time(clock) ||
        clock < active.lastNow ||
        nowEpochMs < active.lastNow ||
        aborted(active.signal)
      )
        return deny();
      const now = Math.max(clock, nowEpochMs);
      if (now >= active.prepared.expiresAtEpochMs || now >= binding.deadlineMs) return deny();
      const current = this.#readRouting(binding, now);
      if (
        !current ||
        !same(current.record, active.routing) ||
        !same(current.route, active.prepared.route)
      )
        return deny();
      const verdict: unknown = this.#context?.isCurrent(active.context.contextRef, binding, now);
      if (verdict !== true) {
        drainNativePromise(verdict);
        return deny();
      }
      const after = this.#now();
      if (
        !time(after) ||
        after < now ||
        after >= active.prepared.expiresAtEpochMs ||
        aborted(active.signal)
      )
        return deny();
      active.lastNow = after;
      return true;
    } catch {
      return deny();
    }
  }

  async revalidateCurrent(
    reference_: string,
    binding: SessionLocalModelBinding,
    nowEpochMs: number,
    signal: AbortSignal,
    registerWork?: LocalModelWorkObserver,
  ): Promise<boolean> {
    const active = this.#active;
    let admitted = false;
    try {
      return await startObservedLocalModelWork(async () => {
        if (
          !active ||
          aborted(signal) ||
          !this.isCurrent(reference_, binding, nowEpochMs) ||
          !this.#context
        )
          return false;
        admitted = true;
        if (
          (await this.#context.revalidateCurrent(
            active.context.contextRef,
            active.prepared.binding,
            nowEpochMs,
            signal,
            registerWork,
          )) !== true
        ) {
          if (this.#active === active) this.#active = null;
          return false;
        }
        if (this.#active !== active) return false;
        if (aborted(signal)) {
          this.#active = null;
          return false;
        }
        return this.isCurrent(reference_, binding, this.#now());
      }, registerWork);
    } catch {
      if (admitted && this.#active === active) this.#active = null;
      return false;
    }
  }
}
