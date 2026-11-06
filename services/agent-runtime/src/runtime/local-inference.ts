/**
 * W05-F candidate: bounded, read-only inference over the already verified
 * Termux loopback model. This is deliberately NOT a W07 executor, a new model
 * registry, a W08 provider write adapter, or an Android runtime integration.
 *
 * The caller owns provenance of the W05 route and the local model manifest.
 * This transport validates their projections but cannot independently prove
 * GGUF file integrity or authenticate another Android application on loopback.
 * Those remain explicit publication blockers.
 */

export const QWEN35_2B_Q4_K_M_SHA256 =
  'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223';
export const LOCAL_QWEN_CHAT_ENDPOINT = 'http://127.0.0.1:18080/v1/chat/completions';
/** Candidate identifier only: W05-E has not yet registered this strategy. */
export const LOCAL_QWEN_STRATEGY_ID = 'aurora.local.qwen35.2b';
export const LOCAL_QWEN_MODEL_ID =
  '/data/data/com.termux/files/home/.local/share/aurora-coding-lab-v1/models/Qwen3.5-2B-Q4_K_M.gguf';

const MAX_INPUT_BYTES = 8_192;
const MAX_OUTPUT_BYTES = 32_768;
const MAX_TOKENS = 256;
const MAX_REQUEST_MS = 30_000;
const MAX_MODEL_OBSERVATION_AGE_MS = 10_000;

/** Structural projection of an already selected W05-B MODEL route. */
export interface SelectedModelRouteProjection {
  readonly status: 'SELECTED';
  readonly family: 'MODEL';
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly selectedVia: 'PREFERRED' | 'FALLBACK';
  readonly currentAvailability: 'CURRENT_AVAILABLE' | 'CURRENT_DEGRADED';
  readonly evidence: Readonly<{
    strategyRegistryVersion: string;
    capabilityPlanStatus: 'READY' | 'BLOCKED';
    budgetState: 'WITHIN_BUDGET' | 'DEGRADED' | 'EXHAUSTED';
    budgetAction: 'CONTINUE_OPTIONAL' | 'DEGRADE_OPTIONAL' | 'STOP_OPTIONAL' | 'HOLD';
  }>;
  readonly tenant: Readonly<{ tenantId: string }>;
  readonly correlation: Readonly<{ correlationId: string }>;
  readonly authoritySemantics: 'INTELLIGENCE_ONLY_NO_AUTHORITY';
  readonly downstreamExecutionStillRequiresCurrentValidation: true;
  readonly authorizesExecution: false;
}

/** Supplied by a separately governed runtime manifest verifier, never by the LLM. */
export interface LocalModelManifestProjection {
  readonly source: 'LOCAL_RUNTIME_MANIFEST_PROJECTION';
  readonly modelId: string;
  readonly modelSha256: string;
  readonly observedAtEpochMs: number;
  readonly maxAgeMs: number;
  readonly authorizesExecution: false;
}

export interface LocalInferenceRequest {
  readonly route: SelectedModelRouteProjection;
  readonly tenantId: string;
  readonly correlationId: string;
  readonly manifest: LocalModelManifestProjection;
  readonly prompt: string;
  readonly maxOutputTokens: number;
  readonly deadlineEpochMs: number;
  readonly signal?: AbortSignal;
}

export type LocalInferenceFailureCode =
  | 'INVALID_REQUEST'
  | 'INVALID_ROUTE'
  | 'UNVERIFIED_MODEL'
  | 'STALE_MODEL'
  | 'BUSY'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'REJECTED'
  | 'MALFORMED_RESPONSE';

interface NoAuthority {
  readonly authoritySemantics: 'INTELLIGENCE_ONLY_NO_AUTHORITY';
  readonly authorizesExecution: false;
  readonly canInvokeTools: false;
}

export type LocalInferenceResult =
  | (NoAuthority & {
      readonly status: 'GENERATED';
      readonly content: string;
      readonly strategyId: string;
      readonly modelSha256: typeof QWEN35_2B_Q4_K_M_SHA256;
    })
  | (NoAuthority & {
      readonly status: 'ABSTAINED';
      readonly code: LocalInferenceFailureCode;
    });

export interface LocalInferenceDependencies {
  readonly transport: typeof fetch;
  readonly now: () => number;
}

const NO_AUTHORITY = {
  authoritySemantics: 'INTELLIGENCE_ONLY_NO_AUTHORITY',
  authorizesExecution: false,
  canInvokeTools: false,
} as const;

function abstain(code: LocalInferenceFailureCode): LocalInferenceResult {
  return { ...NO_AUTHORITY, status: 'ABSTAINED', code };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Read data properties once; never evaluate an ingress accessor or retain its envelope. */
function ownDataSnapshot(
  value: unknown,
  allowedKeys: readonly string[],
  exact = true,
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  // Canonical W05 route/context records have additional evidence. Consume only
  // this projection's fields; neither enumerate nor read the unused metadata.
  const keys = exact ? Reflect.ownKeys(value) : allowedKeys;
  if (exact && keys.length > allowedKeys.length) return null;
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== 'string' || !allowedKeys.includes(key)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor && !exact) continue;
    if (!descriptor || !('value' in descriptor)) return null;
    result[key] = descriptor.value as unknown;
  }
  return result;
}

const signalAbortedGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')?.get;

/** Use the native brand check/getter, not a caller-provided `aborted` accessor. */
function signalAborted(signal: AbortSignal): boolean {
  if (!signalAbortedGetter) throw new Error('AbortSignal is unavailable');
  return signalAbortedGetter.call(signal) === true;
}

function snapshotRequest(value: unknown): LocalInferenceRequest | null {
  try {
    const request = ownDataSnapshot(value, [
      'route',
      'tenantId',
      'correlationId',
      'manifest',
      'prompt',
      'maxOutputTokens',
      'deadlineEpochMs',
      'signal',
    ]);
    if (!request) return null;
    const route = ownDataSnapshot(
      request.route,
      [
        'status',
        'family',
        'strategyId',
        'strategyVersion',
        'selectedVia',
        'currentAvailability',
        'evidence',
        'tenant',
        'correlation',
        'authoritySemantics',
        'downstreamExecutionStillRequiresCurrentValidation',
        'authorizesExecution',
      ],
      false,
    );
    if (!route) return null;
    const evidence = ownDataSnapshot(
      route.evidence,
      ['strategyRegistryVersion', 'capabilityPlanStatus', 'budgetState', 'budgetAction'],
      false,
    );
    const tenant = ownDataSnapshot(route.tenant, ['tenantId'], false);
    const correlation = ownDataSnapshot(route.correlation, ['correlationId'], false);
    const manifest = ownDataSnapshot(request.manifest, [
      'source',
      'modelId',
      'modelSha256',
      'observedAtEpochMs',
      'maxAgeMs',
      'authorizesExecution',
    ]);
    if (!evidence || !tenant || !correlation || !manifest) return null;
    if (request.signal !== undefined) signalAborted(request.signal as AbortSignal);
    return {
      ...request,
      route: { ...route, evidence, tenant, correlation },
      manifest,
    } as unknown as LocalInferenceRequest;
  } catch {
    // Hostile proxies or malformed native signals are data rejection, not exceptions.
    return null;
  }
}

function validRoute(request: LocalInferenceRequest): boolean {
  const route = request.route;
  return (
    route?.status === 'SELECTED' &&
    route.family === 'MODEL' &&
    route.strategyId === LOCAL_QWEN_STRATEGY_ID &&
    nonEmpty(route.strategyVersion) &&
    (route.selectedVia === 'PREFERRED' || route.selectedVia === 'FALLBACK') &&
    (route.currentAvailability === 'CURRENT_AVAILABLE' ||
      route.currentAvailability === 'CURRENT_DEGRADED') &&
    nonEmpty(route.evidence?.strategyRegistryVersion) &&
    route.evidence.capabilityPlanStatus === 'READY' &&
    route.evidence.budgetState === 'WITHIN_BUDGET' &&
    route.evidence.budgetAction === 'CONTINUE_OPTIONAL' &&
    route.tenant?.tenantId === request.tenantId &&
    route.correlation?.correlationId === request.correlationId &&
    nonEmpty(request.tenantId) &&
    nonEmpty(request.correlationId) &&
    route.authoritySemantics === 'INTELLIGENCE_ONLY_NO_AUTHORITY' &&
    route.downstreamExecutionStillRequiresCurrentValidation === true &&
    route.authorizesExecution === false
  );
}

function manifestState(
  manifest: LocalModelManifestProjection,
  nowEpochMs: number,
): 'CURRENT' | 'INVALID' | 'STALE' {
  if (
    manifest?.source !== 'LOCAL_RUNTIME_MANIFEST_PROJECTION' ||
    manifest.authorizesExecution !== false ||
    !nonEmpty(manifest.modelId) ||
    manifest.modelId !== LOCAL_QWEN_MODEL_ID ||
    manifest.modelSha256 !== QWEN35_2B_Q4_K_M_SHA256 ||
    !Number.isSafeInteger(manifest.observedAtEpochMs) ||
    !Number.isSafeInteger(manifest.maxAgeMs) ||
    manifest.maxAgeMs < 0 ||
    manifest.maxAgeMs > MAX_MODEL_OBSERVATION_AGE_MS
  ) {
    return 'INVALID';
  }
  if (
    nowEpochMs < manifest.observedAtEpochMs ||
    nowEpochMs - manifest.observedAtEpochMs > manifest.maxAgeMs
  ) {
    return 'STALE';
  }
  return 'CURRENT';
}

/** Never buffer an unbounded HTTP response, including on an error path. */
async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('missing response body');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let cancellation: Promise<void> | undefined;
  const cancelReader = (): Promise<void> => {
    cancellation ??= Promise.resolve()
      .then(() => reader.cancel())
      .then(
        () => undefined,
        () => undefined,
      );
    return cancellation;
  };
  const onAbort = () => {
    void cancelReader();
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      throw new Error('response is not JSON');
    }
    for (;;) {
      if (signal.aborted) throw new Error('response cancelled');
      const { done, value } = await reader.read();
      if (signal.aborted) throw new Error('response cancelled');
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_OUTPUT_BYTES) throw new Error('response exceeds bound');
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    // This may never settle. The caller has a separate bound, while single-flight
    // remains held until the underlying read AND cleanup actually settle.
    await cancelReader();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown;
}

async function discardResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Never surface response/transport details or credentials in a failure result.
  }
}

function extractCandidate(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length !== 1) return null;
  const choice = choices[0] as { finish_reason?: unknown; message?: unknown } | undefined;
  if (choice?.finish_reason !== 'stop' || !choice.message || typeof choice.message !== 'object') {
    return null;
  }
  const message = choice.message as Record<string, unknown>;
  if (
    message.role !== 'assistant' ||
    'tool_calls' in message ||
    'function_call' in message ||
    !nonEmpty(message.content)
  ) {
    return null;
  }
  const content = message.content as string;
  return new TextEncoder().encode(content).byteLength <= MAX_OUTPUT_BYTES ? content : null;
}

/**
 * An isolated *information-only* transport. No URL override, credentials,
 * redirect, tool definition, shell call, disk write, or automatic server start.
 */
export class LocalQwenInferenceClient {
  private readonly dependencies: LocalInferenceDependencies;
  private inFlight = false;

  constructor(dependencies: Partial<LocalInferenceDependencies> = {}) {
    this.dependencies = {
      transport: dependencies.transport ?? fetch,
      now: dependencies.now ?? Date.now,
    };
  }

  async infer(input: LocalInferenceRequest): Promise<LocalInferenceResult> {
    const request = snapshotRequest(input);
    if (!request) return abstain('INVALID_REQUEST');
    if (!validRoute(request)) return abstain('INVALID_ROUTE');
    let now: number;
    let alreadyCancelled: boolean;
    try {
      now = this.dependencies.now();
      alreadyCancelled = request.signal ? signalAborted(request.signal) : false;
    } catch {
      return abstain('INVALID_REQUEST');
    }
    if (
      !Number.isSafeInteger(now) ||
      !nonEmpty(request.prompt) ||
      new TextEncoder().encode(request.prompt).byteLength > MAX_INPUT_BYTES ||
      !Number.isSafeInteger(request.maxOutputTokens) ||
      request.maxOutputTokens < 1 ||
      request.maxOutputTokens > MAX_TOKENS ||
      !Number.isSafeInteger(request.deadlineEpochMs)
    ) {
      return abstain('INVALID_REQUEST');
    }
    const modelState = manifestState(request.manifest, now);
    if (modelState === 'INVALID') return abstain('UNVERIFIED_MODEL');
    if (modelState === 'STALE') return abstain('STALE_MODEL');
    if (alreadyCancelled) return abstain('CANCELLED');
    if (request.deadlineEpochMs <= now) return abstain('TIMEOUT');
    if (this.inFlight) return abstain('BUSY');

    this.inFlight = true;
    const controller = new AbortController();
    const deadline = Math.min(request.deadlineEpochMs, now + MAX_REQUEST_MS);
    let stopCode: 'CANCELLED' | 'TIMEOUT' | undefined;
    let resolveStopped: (result: LocalInferenceResult) => void = () => undefined;
    const stopped = new Promise<LocalInferenceResult>((resolve) => {
      resolveStopped = resolve;
    });
    const stop = (code: 'CANCELLED' | 'TIMEOUT') => {
      stopCode ??= code;
      controller.abort();
      resolveStopped(abstain(stopCode));
    };
    const currentStop = (): 'CANCELLED' | 'TIMEOUT' | undefined => {
      if (stopCode) return stopCode;
      try {
        if (request.signal && signalAborted(request.signal)) {
          stop('CANCELLED');
        } else {
          const observed = this.dependencies.now();
          if (!Number.isSafeInteger(observed) || observed >= deadline) stop('TIMEOUT');
        }
      } catch {
        // Losing the budget/cancellation observation cannot release a live body.
        stop('TIMEOUT');
      }
      return stopCode;
    };
    const onCancel = () => stop('CANCELLED');
    const detachCancellation = () => {
      if (request.signal) {
        try {
          EventTarget.prototype.removeEventListener.call(request.signal, 'abort', onCancel);
        } catch {
          // A revoked/hostile signal cannot replace the already bounded result.
        }
      }
    };
    try {
      if (request.signal) {
        EventTarget.prototype.addEventListener.call(request.signal, 'abort', onCancel, {
          once: true,
        });
        if (signalAborted(request.signal)) onCancel();
      }
    } catch {
      detachCancellation();
      this.inFlight = false;
      return abstain('INVALID_REQUEST');
    }
    const timeout = setTimeout(() => stop('TIMEOUT'), deadline - now);

    const operation = (async (): Promise<LocalInferenceResult> => {
      try {
        const beforeDispatch = currentStop();
        if (beforeDispatch) return abstain(beforeDispatch);
        const response = await this.dependencies.transport(LOCAL_QWEN_CHAT_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          redirect: 'error',
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
          body: JSON.stringify({
            model: request.manifest.modelId,
            messages: [
              {
                role: 'system',
                content:
                  'You provide untrusted suggestions only. Never claim permission, tool access, or execution.',
              },
              { role: 'user', content: request.prompt },
            ],
            max_tokens: request.maxOutputTokens,
            temperature: 0,
            stream: false,
            chat_template_kwargs: { enable_thinking: false },
          }),
        });
        const afterTransport = currentStop();
        if (afterTransport || !response.ok) {
          await discardResponse(response);
          return abstain(currentStop() ?? (response.status >= 500 ? 'UNAVAILABLE' : 'REJECTED'));
        }
        let candidate: string | null;
        try {
          candidate = extractCandidate(await readBoundedJson(response, controller.signal));
        } catch {
          return abstain(currentStop() ?? 'MALFORMED_RESPONSE');
        }
        const afterRead = currentStop();
        if (afterRead) return abstain(afterRead);
        if (!candidate) return abstain('MALFORMED_RESPONSE');
        return {
          ...NO_AUTHORITY,
          status: 'GENERATED',
          content: candidate,
          strategyId: request.route.strategyId,
          modelSha256: QWEN35_2B_Q4_K_M_SHA256,
        };
      } catch {
        return abstain(stopCode ?? 'UNAVAILABLE');
      }
    })();
    const settledOperation = operation.finally(() => {
      // An aborted caller is not proof that an uncooperative transport/read has
      // stopped. Retain BUSY until the actual operation and cleanup settle.
      this.inFlight = false;
    });
    try {
      const result = await Promise.race([settledOperation, stopped]);
      const beforeReturn = currentStop();
      return beforeReturn ? abstain(beforeReturn) : result;
    } finally {
      clearTimeout(timeout);
      detachCancellation();
    }
  }
}
