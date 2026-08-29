export type SafeParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: Error };

interface RuntimeSchema<T> {
  readonly parse: (value: unknown) => T;
  readonly safeParse: (value: unknown) => SafeParseResult<T>;
}

export function createRuntimeSchema<T>(parser: (value: unknown) => T): RuntimeSchema<T> {
  return {
    parse: parser,
    safeParse(value: unknown): SafeParseResult<T> {
      try {
        return { success: true, data: parser(value) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },
  };
}

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function assertExactKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  label: string,
): void {
  const allowed = new Set(allowedKeys);

  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new TypeError(`${label} contains unsupported field: ${key}`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in record)) {
      throw new TypeError(`${label} is missing required field: ${key}`);
    }
  }
}

export function parseNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}
