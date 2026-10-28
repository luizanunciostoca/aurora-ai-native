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
async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('response is not JSON');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('missing response body');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_OUTPUT_BYTES) throw new Error('response exceeds bound');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown;
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

  async infer(request: LocalInferenceRequest): Promise<LocalInferenceResult> {
    if (!validRoute(request)) return abstain('INVALID_ROUTE');
    const now = this.dependencies.now();
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
    if (request.signal?.aborted) return abstain('CANCELLED');
    if (request.deadlineEpochMs <= now) return abstain('TIMEOUT');
    if (this.inFlight) return abstain('BUSY');

    this.inFlight = true;
    const controller = new AbortController();
    const onCancel = () => controller.abort();
    request.signal?.addEventListener('abort', onCancel, { once: true });
    if (request.signal?.aborted) controller.abort();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(request.deadlineEpochMs - now, MAX_REQUEST_MS),
    );

    try {
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
      if (!response.ok) {
        return abstain(response.status >= 500 ? 'UNAVAILABLE' : 'REJECTED');
      }
      let candidate: string | null;
      try {
        candidate = extractCandidate(await readBoundedJson(response));
      } catch {
        if (request.signal?.aborted) return abstain('CANCELLED');
        if (controller.signal.aborted) return abstain('TIMEOUT');
        return abstain('MALFORMED_RESPONSE');
      }
      if (!candidate) return abstain('MALFORMED_RESPONSE');
      return {
        ...NO_AUTHORITY,
        status: 'GENERATED',
        content: candidate,
        strategyId: request.route.strategyId,
        modelSha256: QWEN35_2B_Q4_K_M_SHA256,
      };
    } catch {
      if (request.signal?.aborted) return abstain('CANCELLED');
      if (controller.signal.aborted) return abstain('TIMEOUT');
      return abstain('UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener('abort', onCancel);
      this.inFlight = false;
    }
  }
}
