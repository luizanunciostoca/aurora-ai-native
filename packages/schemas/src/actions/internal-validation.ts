import type {
  JsonObject,
  JsonPrimitive,
  JsonValue,
  RestrictedMetadata,
} from '../../../contracts/src/actions';
import type { Rfc3339Timestamp } from '../../../contracts/src/context';

export type DependencyParser<T> = (input: unknown) => T;

export function fail(path: string, message: string): never {
  throw new TypeError(`${path}: ${message}`);
}

export function asRecord(input: unknown, path: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return fail(path, 'expected object');
  }
  return input as Record<string, unknown>;
}

export function exactKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) fail(`${path}.${key}`, 'unknown field');
  }
  for (const key of required) {
    if (!(key in record)) fail(`${path}.${key}`, 'missing required field');
  }
}

export function nonEmptyString(input: unknown, path: string, max = 512): string {
  if (typeof input !== 'string') return fail(path, 'expected string');
  const value = input.trim();
  if (value.length === 0) return fail(path, 'must not be empty');
  if (value.length > max) return fail(path, `exceeds ${max} characters`);
  return value;
}

export function optionalNonEmptyString(
  input: unknown,
  path: string,
  max = 512,
): string | undefined {
  return input === undefined ? undefined : nonEmptyString(input, path, max);
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function timestamp(input: unknown, path: string): Rfc3339Timestamp {
  const value = nonEmptyString(input, path, 64);
  if (!RFC3339.test(value) || Number.isNaN(Date.parse(value))) {
    return fail(path, 'expected valid RFC3339 timestamp');
  }
  return value as Rfc3339Timestamp;
}

function jsonValue(input: unknown, path: string, depth: number): JsonValue {
  if (depth > 8) return fail(path, 'JSON nesting exceeds depth 8');
  if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return fail(path, 'number must be finite');
    return input;
  }
  if (Array.isArray(input))
    return input.map((value, index) => jsonValue(value, `${path}[${index}]`, depth + 1));
  if (typeof input === 'object') {
    const source = input as Record<string, unknown>;
    const output: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(source)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key))
        fail(`${path}.${key}`, 'forbidden key');
      output[key] = jsonValue(value, `${path}.${key}`, depth + 1);
    }
    return output;
  }
  return fail(path, 'expected JSON-compatible value');
}

export function jsonObject(input: unknown, path: string): JsonObject {
  const record = asRecord(input, path);
  return jsonValue(record, path, 0) as JsonObject;
}

export function restrictedMetadata(input: unknown, path: string): RestrictedMetadata {
  const record = asRecord(input, path);
  const entries = Object.entries(record);
  if (entries.length > 32) fail(path, 'maximum 32 metadata keys');
  const output: Record<string, JsonPrimitive | readonly JsonPrimitive[]> = {};
  for (const [key, raw] of entries) {
    if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(key)) fail(`${path}.${key}`, 'invalid metadata key');
    const values = Array.isArray(raw) ? raw : [raw];
    if (values.length > 32) fail(`${path}.${key}`, 'maximum 32 array values');
    const parsed = values.map((value, index) => {
      if (value === null || typeof value === 'boolean') return value;
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.length <= 2048) return value;
      return fail(`${path}.${key}[${index}]`, 'metadata values must be bounded primitives');
    });
    if (Array.isArray(raw)) {
      output[key] = parsed;
    } else {
      const first = parsed[0];
      if (first === undefined) fail(`${path}.${key}`, 'metadata value is required');
      output[key] = first;
    }
  }
  return output;
}

export function externalReference(input: unknown, path: string) {
  const record = asRecord(input, path);
  exactKeys(record, ['system', 'reference'], ['system', 'reference'], path);
  return {
    system: nonEmptyString(record.system, `${path}.system`, 128),
    reference: nonEmptyString(record.reference, `${path}.reference`, 1024),
  } as const;
}

export function optional<T>(input: unknown, parser: DependencyParser<T>): T | undefined {
  return input === undefined ? undefined : parser(input);
}
