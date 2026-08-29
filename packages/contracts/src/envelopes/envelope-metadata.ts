import type { JsonValue } from './json-value.js';

export interface EnvelopeMetadata {
  readonly labels?: Readonly<Record<string, string>>;
  readonly extensions?: Readonly<Record<`x-${string}`, JsonValue>>;
}
