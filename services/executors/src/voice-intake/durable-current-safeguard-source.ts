import type { ActionIntent } from '@aurora/contracts/actions';

import {
  resolveCurrentAttemptQuota,
  type ExecutionAttemptQuotaSource,
} from '../safeguards/index.js';
import type {
  CurrentVoiceSafeguardState,
  CurrentVoiceSafeguardStateSource,
} from './owner-backed-execution-state-source.js';

const EXECUTION_REF = /^[A-Za-z0-9._:/+-]{1,256}$/u;

export interface DurableCurrentVoiceSafeguardSourceConfig {
  readonly durableState: ExecutionAttemptQuotaSource;
  /** Explicit freshness bound; no permissive default is allowed. */
  readonly maxAgeMs: number;
}

/**
 * W07 voice adapter over the W03-owned durable execution-attempt/quota source.
 *
 * `executionRef` is supplied by the already-preissued server-side execution identity selected by
 * W07, never by Android or STT. Missing/stale/malformed state returns null so the safeguard gate
 * remains closed. This adapter resolves state only and never authorizes execution or retry.
 */
export class DurableCurrentVoiceSafeguardStateSource implements CurrentVoiceSafeguardStateSource {
  readonly #durableState: ExecutionAttemptQuotaSource;
  readonly #maxAgeMs: number;

  constructor(config: DurableCurrentVoiceSafeguardSourceConfig) {
    if (!Number.isSafeInteger(config.maxAgeMs) || config.maxAgeMs < 1) {
      throw new Error('Attempt/quota freshness bound is invalid.');
    }
    this.#durableState = config.durableState;
    this.#maxAgeMs = config.maxAgeMs;
  }

  resolve(request: {
    readonly actionIntent: ActionIntent;
    readonly tenantId: string;
    readonly executionRef: string;
    readonly evaluatedAt: string;
  }): CurrentVoiceSafeguardState | null {
    if (
      request.actionIntent.tenant.tenantId !== request.tenantId ||
      !EXECUTION_REF.test(request.executionRef)
    ) {
      return null;
    }
    const resolved = resolveCurrentAttemptQuota({
      source: this.#durableState,
      lookup: {
        tenantId: request.actionIntent.tenant.tenantId,
        actionIntentId: request.actionIntent.actionIntentId,
        executionRef: request.executionRef,
      },
      now: request.evaluatedAt,
      maxAgeMs: this.#maxAgeMs,
    });
    if (resolved.status !== 'RESOLVED') return null;
    return {
      attemptNumber: resolved.attemptNumber,
      maxAttempts: resolved.maxAttempts,
      ...(resolved.quota === undefined ? {} : { quota: resolved.quota }),
      authorizesExecution: false,
    };
  }
}
