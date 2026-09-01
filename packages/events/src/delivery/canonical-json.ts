import type { JsonValue } from '@aurora/contracts/envelopes';

export function canonicalizeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeJson(entry));
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Readonly<Record<string, JsonValue>>;
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (entry !== undefined) result[key] = canonicalizeJson(entry);
    }
    return result;
  }
  return value;
}

export function canonicalJsonString(value: JsonValue): string {
  return JSON.stringify(canonicalizeJson(value));
}

export function assertCanonicalPayloadHash(hash: string): string {
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error('canonical payload hash must be a lowercase SHA-256 hex string');
  }
  return hash;
}
