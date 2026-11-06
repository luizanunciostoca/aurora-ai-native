import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';

import {
  resolveDurableContainmentState,
  type ActionIntentContainmentKeySource,
  type DurableContainmentStateSource,
} from '../failure-containment/durable-containment-state.js';
import type { FailureContainmentSnapshot } from '../failure-containment/types.js';
import type { CurrentVoiceContainmentStateSource } from './owner-backed-execution-state-source.js';

export interface DurableCurrentVoiceContainmentSourceConfig {
  readonly circuitKeys: ActionIntentContainmentKeySource;
  readonly durableState: DurableContainmentStateSource;
}

/**
 * W07 voice composition adapter over the durable current containment owner.
 *
 * The circuit key is resolved only from server-owned ActionIntent context. Missing key/state,
 * source outage, tenant drift or malformed durable state returns `null`, which keeps dispatch
 * fail-closed. This adapter cannot manufacture a healthy/default snapshot.
 */
export class DurableCurrentVoiceContainmentStateSource implements CurrentVoiceContainmentStateSource {
  readonly #circuitKeys: ActionIntentContainmentKeySource;
  readonly #durableState: DurableContainmentStateSource;

  constructor(config: DurableCurrentVoiceContainmentSourceConfig) {
    this.#circuitKeys = config.circuitKeys;
    this.#durableState = config.durableState;
  }

  resolve(request: {
    readonly actionIntent: ActionIntent;
    readonly tenantId: string;
    readonly evaluatedAt: string;
  }): FailureContainmentSnapshot | null {
    if (request.actionIntent.tenant.tenantId !== request.tenantId) return null;

    let circuitKey: string | null;
    try {
      circuitKey = this.#circuitKeys.resolveCircuitKey({
        actionIntent: request.actionIntent,
        tenantId: request.tenantId as TenantId,
      });
    } catch {
      return null;
    }
    if (circuitKey === null) return null;

    const resolved = resolveDurableContainmentState(
      {
        tenantId: request.tenantId as TenantId,
        circuitKey,
        evaluatedAt: request.evaluatedAt as Rfc3339Timestamp,
      },
      this.#durableState,
    );
    return resolved.status === 'RESOLVED' ? resolved.record.snapshot : null;
  }
}
