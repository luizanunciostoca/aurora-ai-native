import type { EnvelopeMetadata, EnvelopeSource, JsonValue } from '@aurora/contracts/envelopes';

const TYPE_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;
const LABEL_KEY_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/;
const EXTENSION_KEY_PATTERN = /^x-[a-z][a-z0-9_.-]{0,125}$/;
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const RESERVED_METADATA_EXTENSIONS = new Set([
  'x-authorization',
  'x-authority',
  'x-policy-token',
  'x-owner-decision',
  'x-tenant',
  'x-tenant-id',
  'x-correlation',
  'x-correlation-id',
  'x-causation',
  'x-causation-id',
  'x-schema-version',
  'x-deadline',
  'x-data-classification',
]);

function fail(path: string, message: string): never {
  throw new TypeError(`${path}: ${message}`);
}

export function asRecord(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    fail(path, 'expected object');
  }

  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(path, 'expected plain object');
  }

  return input as Record<string, unknown>;
}

export function assertExactKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
}

export function requireOwn(record: Record<string, unknown>, key: string, path: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    fail(`${path}.${key}`, 'required field is missing');
  }

  return record[key];
}

export function optionalOwn(record: Record<string, unknown>, key: string): unknown | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

export function parseFixedLiteral<const T extends string>(
  input: unknown,
  literal: T,
  path: string,
): T {
  if (input !== literal) {
    fail(path, `expected ${literal}`);
  }

  return literal;
}

export function parseNamespacedType(input: unknown, path: string): string {
  if (typeof input !== 'string' || input.length > 160 || !TYPE_PATTERN.test(input)) {
    fail(path, 'expected a namespaced type string such as domain.command-name');
  }

  return input;
}

export function parseRfc3339Timestamp(input: unknown, path: string): string {
  if (
    typeof input !== 'string' ||
    !RFC3339_PATTERN.test(input) ||
    !Number.isFinite(Date.parse(input))
  ) {
    fail(path, 'expected a valid RFC3339 timestamp');
  }

  return input;
}

function parseBoundedString(
  input: unknown,
  path: string,
  maxLength: number,
  pattern?: RegExp,
): string {
  if (
    typeof input !== 'string' ||
    input.length === 0 ||
    input.length > maxLength ||
    (pattern !== undefined && !pattern.test(input))
  ) {
    fail(path, 'invalid string value');
  }

  return input;
}

export function parseEnvelopeSource(input: unknown, path: string): EnvelopeSource {
  const record = asRecord(input, path);
  assertExactKeys(record, new Set(['service', 'component', 'instance']), path);

  const service = parseBoundedString(
    requireOwn(record, 'service', path),
    `${path}.service`,
    128,
    /^[a-z][a-z0-9.-]*$/,
  );
  const componentInput = optionalOwn(record, 'component');
  const instanceInput = optionalOwn(record, 'instance');

  return {
    service,
    ...(componentInput === undefined
      ? {}
      : { component: parseBoundedString(componentInput, `${path}.component`, 128) }),
    ...(instanceInput === undefined
      ? {}
      : { instance: parseBoundedString(instanceInput, `${path}.instance`, 256) }),
  };
}

export function parseOptionalSubject(input: unknown, path: string): string {
  return parseBoundedString(input, path, 512);
}

export function normalizeJsonValue(input: unknown, path: string, depth = 0): JsonValue {
  if (depth > 64) {
    fail(path, 'JSON nesting exceeds 64 levels');
  }

  if (input === null || typeof input === 'string' || typeof input === 'boolean') {
    return input;
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      fail(path, 'JSON numbers must be finite');
    }
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((value, index) => normalizeJsonValue(value, `${path}[${index}]`, depth + 1));
  }

  const record = asRecord(input, path);
  const normalized: Record<string, JsonValue> = {};
  for (const key of Object.keys(record).sort()) {
    normalized[key] = normalizeJsonValue(record[key], `${path}.${key}`, depth + 1);
  }
  return normalized;
}

export function parseEnvelopeMetadata(input: unknown, path: string): EnvelopeMetadata {
  const record = asRecord(input, path);
  assertExactKeys(record, new Set(['labels', 'extensions']), path);

  const labelsInput = optionalOwn(record, 'labels');
  const extensionsInput = optionalOwn(record, 'extensions');

  const labels = labelsInput === undefined ? undefined : parseLabels(labelsInput, `${path}.labels`);
  const extensions =
    extensionsInput === undefined
      ? undefined
      : parseExtensions(extensionsInput, `${path}.extensions`);

  return {
    ...(labels === undefined ? {} : { labels }),
    ...(extensions === undefined ? {} : { extensions }),
  };
}

function parseLabels(input: unknown, path: string): Readonly<Record<string, string>> {
  const record = asRecord(input, path);
  const keys = Object.keys(record);
  if (keys.length > 32) {
    fail(path, 'at most 32 labels are allowed');
  }

  const labels: Record<string, string> = {};
  for (const key of keys.sort()) {
    if (!LABEL_KEY_PATTERN.test(key)) {
      fail(`${path}.${key}`, 'invalid label key');
    }
    labels[key] = parseBoundedString(record[key], `${path}.${key}`, 256);
  }
  return labels;
}

function parseExtensions(input: unknown, path: string): Readonly<Record<`x-${string}`, JsonValue>> {
  const record = asRecord(input, path);
  const keys = Object.keys(record);
  if (keys.length > 32) {
    fail(path, 'at most 32 extensions are allowed');
  }

  const extensions: Record<string, JsonValue> = {};
  for (const key of keys.sort()) {
    if (!EXTENSION_KEY_PATTERN.test(key)) {
      fail(`${path}.${key}`, 'extension keys must use the x-* namespace');
    }
    if (RESERVED_METADATA_EXTENSIONS.has(key)) {
      fail(`${path}.${key}`, 'reserved envelope semantics cannot be overridden in metadata');
    }
    extensions[key] = normalizeJsonValue(record[key], `${path}.${key}`);
  }
  return extensions as Readonly<Record<`x-${string}`, JsonValue>>;
}

export function stableStringify(input: JsonValue): string {
  return JSON.stringify(input);
}
