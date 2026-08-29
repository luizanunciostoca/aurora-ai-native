import type { CausationId, CorrelationId } from '../ids/types.js';

export interface CausationRef {
  readonly causationId: CausationId;
}

export interface CorrelationContext {
  readonly correlationId: CorrelationId;
  readonly causation?: CausationRef;
}
