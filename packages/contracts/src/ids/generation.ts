import type { InternalCanonicalId } from './types';

/**
 * Injection boundary for producer-owned ID creation.
 *
 * W01-F deliberately ships no concrete generator. The producer that creates
 * a new canonical object is responsible for obtaining its ID before publish
 * or persistence, using an implementation that emits the registered
 * `<prefix>_<ULID>` form.
 */
export interface CanonicalIdGenerator<TId extends InternalCanonicalId> {
  generate(): TId;
}

export type CanonicalIdGenerationResponsibility = 'PRODUCER';

export const CANONICAL_ID_GENERATION_RESPONSIBILITY: CanonicalIdGenerationResponsibility =
  'PRODUCER';
