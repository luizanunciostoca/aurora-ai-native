import type { AuthenticatedGatewayBootstrapPrincipal } from '../gateway-auth/gateway-bootstrap.js';
import {
  startW15JLocalPhysicalHostRunner,
  type W15JLocalPhysicalHostRunnerHandle,
} from './local-physical-host-runner.js';
import type { W15JLocalPhysicalHostDependencies } from './local-physical-host.js';
import type { W15JPhysicalExecutionStateSeed } from './w03-physical-execution-state-stage.js';

const PROVIDER_FACTORY_EXPORT = 'createW15JLocalPhysicalHostOperatorInput';
const PROVIDER_INPUT_KEYS = new Set(['databaseUrl', 'dependencies', 'principal']);
const PROVIDER_INPUT_WITH_SEED_KEYS = new Set([
  'databaseUrl',
  'dependencies',
  'principal',
  'executionStateSeed',
]);
const DEPENDENCY_KEYS = new Set([
  'receiptEvidenceIngress',
  'createVoiceIntake',
  'createContainmentLifecycle',
  'createAttemptLifecycle',
]);
const PRINCIPAL_KEYS = new Set([
  'tenantId',
  'actor',
  'correlationId',
  'deviceId',
  'deviceSessionId',
  'authenticatedAtMs',
  'authenticationExpiresAtMs',
  'authenticationReference',
  'authorizesExecution',
  'canGrantPermission',
]);
const ACTOR_KEYS = new Set(['kind', 'identityId']);
const ACTOR_KINDS = new Set(['HUMAN', 'AGENT', 'SERVICE', 'SYSTEM']);
const SAFE_TOKEN = /^[A-Za-z0-9._:/+-]+$/u;
const DEVICE_ID = /^dvc_[0-9A-HJKMNP-TV-Z]{26}$/u;

export type W15JLocalPhysicalHostOperatorErrorCode =
  | 'PROVIDER_MODULE_INVALID'
  | 'PROVIDER_FACTORY_FAILED'
  | 'PROVIDER_INPUT_INVALID'
  | 'HOST_START_FAILED';

export class W15JLocalPhysicalHostOperatorError extends Error {
  readonly code: W15JLocalPhysicalHostOperatorErrorCode;

  constructor(code: W15JLocalPhysicalHostOperatorErrorCode) {
    super(`W15-J LOCAL operator rejected: ${code}.`);
    this.name = 'W15JLocalPhysicalHostOperatorError';
    this.code = code;
  }
}

export interface W15JLocalPhysicalHostOperatorProviderInput {
  /** Loaded by the trusted provider; never accepted on argv or from Android. */
  readonly databaseUrl: string;
  /** W07/W14 owner-backed composition. Evaluation-only `voiceIntake` is not accepted here. */
  readonly dependencies: W15JLocalPhysicalHostDependencies;
  /** Already-authenticated server-side W14 principal; never accepted from Android. */
  readonly principal: AuthenticatedGatewayBootstrapPrincipal;
  /** Optional DP5 fixture; the runner writes it only through W03's existing physical stager. */
  readonly executionStateSeed?: W15JPhysicalExecutionStateSeed;
}

export interface W15JLocalPhysicalHostOperatorProviderModule {
  readonly createW15JLocalPhysicalHostOperatorInput: () =>
    | W15JLocalPhysicalHostOperatorProviderInput
    | Promise<W15JLocalPhysicalHostOperatorProviderInput>;
}

export interface W15JLocalPhysicalHostOperatorRuntime {
  readonly now?: () => number;
  readonly startRunner?: typeof startW15JLocalPhysicalHostRunner;
}

export type W15JLocalPhysicalHostOperatorHandle = W15JLocalPhysicalHostRunnerHandle;

function plainDataRecord(value: unknown): value is Record<string, unknown> {
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

function hasExactKeys(value: Readonly<Record<string, unknown>>, expected: ReadonlySet<string>) {
  try {
    const keys = Object.keys(value);
    return keys.length === expected.size && keys.every((key) => expected.has(key));
  } catch {
    return false;
  }
}

function providerKeysValid(value: Readonly<Record<string, unknown>>): boolean {
  return (
    hasExactKeys(value, PROVIDER_INPUT_KEYS) || hasExactKeys(value, PROVIDER_INPUT_WITH_SEED_KEYS)
  );
}

function boundedToken(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    SAFE_TOKEN.test(value)
  );
}

function validPrincipal(
  value: unknown,
  nowMs: number,
): value is AuthenticatedGatewayBootstrapPrincipal {
  if (
    !plainDataRecord(value) ||
    !hasExactKeys(value, PRINCIPAL_KEYS) ||
    !plainDataRecord(value.actor) ||
    !hasExactKeys(value.actor, ACTOR_KEYS)
  ) {
    return false;
  }

  return (
    boundedToken(value.tenantId, 128) &&
    typeof value.actor.kind === 'string' &&
    ACTOR_KINDS.has(value.actor.kind) &&
    boundedToken(value.actor.identityId, 128) &&
    boundedToken(value.correlationId, 128) &&
    typeof value.deviceId === 'string' &&
    DEVICE_ID.test(value.deviceId) &&
    boundedToken(value.deviceSessionId, 128) &&
    Number.isSafeInteger(value.authenticatedAtMs) &&
    Number.isSafeInteger(value.authenticationExpiresAtMs) &&
    typeof value.authenticatedAtMs === 'number' &&
    typeof value.authenticationExpiresAtMs === 'number' &&
    value.authenticatedAtMs >= 0 &&
    value.authenticatedAtMs <= nowMs &&
    value.authenticationExpiresAtMs > nowMs &&
    value.authenticationExpiresAtMs > value.authenticatedAtMs &&
    boundedToken(value.authenticationReference, 256) &&
    value.authorizesExecution === false &&
    value.canGrantPermission === false
  );
}

function validDependencies(value: unknown): value is W15JLocalPhysicalHostDependencies {
  if (!plainDataRecord(value) || !hasExactKeys(value, DEPENDENCY_KEYS)) return false;
  const receiptEvidenceIngress = value.receiptEvidenceIngress;
  return (
    receiptEvidenceIngress !== null &&
    typeof receiptEvidenceIngress === 'object' &&
    typeof (receiptEvidenceIngress as { observe?: unknown }).observe === 'function' &&
    typeof value.createVoiceIntake === 'function' &&
    typeof value.createContainmentLifecycle === 'function' &&
    typeof value.createAttemptLifecycle === 'function'
  );
}

function validDatabaseUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:';
  } catch {
    return false;
  }
}

function validExecutionStateSeed(value: unknown): value is W15JPhysicalExecutionStateSeed {
  if (!plainDataRecord(value)) return false;
  // Full canonical validation remains owned by W03PostgresPhysicalExecutionStateStager.
  // The operator only rejects active objects/getters and explicit authority-bearing input early.
  return value.authorizesExecution === false;
}

function validateProviderInput(
  value: unknown,
  nowMs: number,
): W15JLocalPhysicalHostOperatorProviderInput {
  try {
    if (
      Number.isSafeInteger(nowMs) &&
      nowMs >= 0 &&
      plainDataRecord(value) &&
      providerKeysValid(value) &&
      validDatabaseUrl(value.databaseUrl) &&
      validDependencies(value.dependencies) &&
      validPrincipal(value.principal, nowMs) &&
      (value.executionStateSeed === undefined || validExecutionStateSeed(value.executionStateSeed))
    ) {
      return value as unknown as W15JLocalPhysicalHostOperatorProviderInput;
    }
  } catch {
    // A provider proxy/getter failure is a malformed provider input, never an escaped exception.
  }
  throw new W15JLocalPhysicalHostOperatorError('PROVIDER_INPUT_INVALID');
}

/**
 * Validates a trusted external provider and starts the existing W15-J runner on its fixed LOCAL
 * ports. The provider is the only ingress for database configuration, owner-backed dependencies,
 * the already-authenticated server-side principal and an optional W03-validated DP5 fixture. No
 * Android or argv field can supply them.
 *
 * Successful startup is software readiness only. The runner announcement remains allowlisted and
 * `physicalEvidenceStatus` remains `NOT_RUN` until the real DP5 procedure supplies evidence.
 */
export async function startW15JLocalPhysicalHostOperator(
  providerModule: unknown,
  runtime: W15JLocalPhysicalHostOperatorRuntime = {},
): Promise<W15JLocalPhysicalHostOperatorHandle> {
  if (
    providerModule === null ||
    (typeof providerModule !== 'object' && typeof providerModule !== 'function')
  ) {
    throw new W15JLocalPhysicalHostOperatorError('PROVIDER_MODULE_INVALID');
  }

  let factory: unknown;
  try {
    factory = (providerModule as Record<string, unknown>)[PROVIDER_FACTORY_EXPORT];
  } catch {
    throw new W15JLocalPhysicalHostOperatorError('PROVIDER_MODULE_INVALID');
  }
  if (typeof factory !== 'function') {
    throw new W15JLocalPhysicalHostOperatorError('PROVIDER_MODULE_INVALID');
  }

  let provided: unknown;
  try {
    provided = await factory();
  } catch {
    throw new W15JLocalPhysicalHostOperatorError('PROVIDER_FACTORY_FAILED');
  }

  const now = runtime.now ?? Date.now;
  let nowMs: number;
  try {
    nowMs = now();
  } catch {
    throw new W15JLocalPhysicalHostOperatorError('PROVIDER_INPUT_INVALID');
  }
  const input = validateProviderInput(provided, nowMs);
  const startRunner = runtime.startRunner ?? startW15JLocalPhysicalHostRunner;

  try {
    return await startRunner({
      host: {
        databaseUrl: input.databaseUrl,
        gatewayPort: 8080,
        bootstrapPort: 8081,
      },
      dependencies: input.dependencies,
      principal: input.principal,
      ...(input.executionStateSeed === undefined
        ? {}
        : { executionStateSeed: input.executionStateSeed }),
    });
  } catch {
    throw new W15JLocalPhysicalHostOperatorError('HOST_START_FAILED');
  }
}
