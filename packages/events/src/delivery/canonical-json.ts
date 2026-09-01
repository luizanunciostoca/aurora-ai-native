function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeJsonValue(entry));
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Readonly<Record<string, unknown>>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (entry !== undefined) result[key] = canonicalizeJsonValue(entry);
    }
    return result;
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  throw new Error('value is not JSON-serializable');
}

export function canonicalizeJson(value: unknown): unknown {
  return canonicalizeJsonValue(value);
}

export function canonicalJsonString(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value));
}

export function assertCanonicalPayloadHash(hash: string): string {
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error('canonical payload hash must be a lowercase SHA-256 hex string');
  }
  return hash;
}
