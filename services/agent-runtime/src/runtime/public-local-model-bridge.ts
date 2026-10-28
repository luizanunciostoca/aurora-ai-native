import type {
  LocalQwenInferenceClient,
  LocalInferenceRequest,
  LocalInferenceResult,
} from './local-inference';

/**
 * W05-F's private consumption seam for the W06-C PUBLIC model-prompt result.
 * This is deliberately structural and leaf-private: only W06-C may compile
 * context, W05-E/B may select a model route, and W14/host must authenticate
 * the endpoint/model. This shape check does not attest any of those origins.
 *
 * No raw MinimalContextPackage, source references, W07 authority, commands,
 * secrets or tool definitions are forwarded to local inference.
 */
export interface PublicLocalInferenceRequest extends Omit<LocalInferenceRequest, 'prompt'> {
  /** The untrusted-at-this-boundary result of W06-C prompt preparation. */
  readonly minimizedPublicPrompt: unknown;
}

const REQUIRED_W06_KEYS = [
  'status',
  'authorizesExecution',
  'canInvokeTools',
  'purpose',
  'prompt',
  'tenantId',
  'correlationId',
  'includedSourceReferences',
] as const;

const REQUIRED_KEY_SET = new Set<string>(REQUIRED_W06_KEYS);

const NO_AUTHORITY = {
  authoritySemantics: 'INTELLIGENCE_ONLY_NO_AUTHORITY',
  authorizesExecution: false,
  canInvokeTools: false,
} as const;

function refuseProjection(): LocalInferenceResult {
  return { ...NO_AUTHORITY, status: 'ABSTAINED', code: 'INVALID_REQUEST' };
}

/** Never read accessors or forward unknown properties from a model prompt. */
function validatePublicPrompt(
  projection: unknown,
  tenantId: string,
  correlationId: string,
): string | null {
  if (projection === null || typeof projection !== 'object' || Array.isArray(projection)) {
    return null;
  }

  try {
    if (Object.getPrototypeOf(projection) !== Object.prototype) return null;
    const keys = Reflect.ownKeys(projection);
    if (
      keys.length !== REQUIRED_W06_KEYS.length ||
      keys.some((key) => typeof key !== 'string' || !REQUIRED_KEY_SET.has(key))
    ) {
      return null;
    }
    const values: Record<string, unknown> = {};
    for (const key of REQUIRED_W06_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(projection, key);
      if (!descriptor || !('value' in descriptor)) return null;
      values[key] = descriptor.value;
    }
    if (
      values.status !== 'READY' ||
      values.purpose !== 'INFORMATION_ONLY' ||
      values.authorizesExecution !== false ||
      values.canInvokeTools !== false ||
      values.tenantId !== tenantId ||
      values.correlationId !== correlationId ||
      typeof values.prompt !== 'string' ||
      values.prompt.trim().length === 0 ||
      new TextEncoder().encode(values.prompt).byteLength > 8_192 ||
      !Array.isArray(values.includedSourceReferences) ||
      values.includedSourceReferences.length > 4
    ) {
      return null;
    }
    const prompt = values.prompt as string;
    const references = values.includedSourceReferences as unknown[];
    if (
      references.some(
        (reference) =>
          typeof reference !== 'string' ||
          reference.trim().length === 0 ||
          prompt.includes(reference),
      )
    ) {
      return null;
    }
    return prompt;
  } catch {
    // A proxy or hostile object is rejected; never invoke it as a source.
    return null;
  }
}

/**
 * The only intended W06-C-to-W05-F public-text handoff. No network call
 * occurs unless the supplied W06 result is a bounded READY projection.
 * The underlying W05-F client then independently checks W05 route/budget,
 * model-manifest integrity projection, cancellation and HTTP bounds.
 *
 * Production still requires an authenticated Aurora host and actual W06-C
 * invocation by a governed consumer; typed metadata is not cryptographic proof.
 */
export async function inferWithPublicLocalModelPrompt(
  client: LocalQwenInferenceClient,
  request: PublicLocalInferenceRequest,
): Promise<LocalInferenceResult> {
  const prompt = validatePublicPrompt(
    request?.minimizedPublicPrompt,
    request?.tenantId,
    request?.correlationId,
  );
  if (prompt === null) return refuseProjection();

  return client.infer({
    route: request.route,
    tenantId: request.tenantId,
    correlationId: request.correlationId,
    manifest: request.manifest,
    prompt,
    maxOutputTokens: request.maxOutputTokens,
    deadlineEpochMs: request.deadlineEpochMs,
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  });
}
