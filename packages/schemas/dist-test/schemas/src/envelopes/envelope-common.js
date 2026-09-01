'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.asRecord = asRecord;
exports.assertExactKeys = assertExactKeys;
exports.requireOwn = requireOwn;
exports.optionalOwn = optionalOwn;
exports.parseFixedLiteral = parseFixedLiteral;
exports.parseNamespacedType = parseNamespacedType;
exports.parseRfc3339Timestamp = parseRfc3339Timestamp;
exports.parseEnvelopeSource = parseEnvelopeSource;
exports.parseOptionalSubject = parseOptionalSubject;
exports.normalizeJsonValue = normalizeJsonValue;
exports.parseEnvelopeMetadata = parseEnvelopeMetadata;
exports.stableStringify = stableStringify;
const TYPE_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;
const LABEL_KEY_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/;
const EXTENSION_KEY_PATTERN = /^x-[a-z][a-z0-9_.-]{0,125}$/;
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
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
function fail(path, message) {
  throw new TypeError(`${path}: ${message}`);
}
function asRecord(input, path) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    fail(path, 'expected object');
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(path, 'expected plain object');
  }
  return input;
}
function assertExactKeys(record, allowed, path) {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
}
function requireOwn(record, key, path) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    fail(`${path}.${key}`, 'required field is missing');
  }
  return record[key];
}
function optionalOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}
function parseFixedLiteral(input, literal, path) {
  if (input !== literal) {
    fail(path, `expected ${literal}`);
  }
  return literal;
}
function parseNamespacedType(input, path) {
  if (typeof input !== 'string' || input.length > 160 || !TYPE_PATTERN.test(input)) {
    fail(path, 'expected a namespaced type string such as domain.command-name');
  }
  return input;
}
function parseRfc3339Timestamp(input, path) {
  if (
    typeof input !== 'string' ||
    !RFC3339_PATTERN.test(input) ||
    !Number.isFinite(Date.parse(input))
  ) {
    fail(path, 'expected a valid RFC3339 timestamp');
  }
  return input;
}
function parseBoundedString(input, path, maxLength, pattern) {
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
function parseEnvelopeSource(input, path) {
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
function parseOptionalSubject(input, path) {
  return parseBoundedString(input, path, 512);
}
function normalizeJsonValue(input, path, depth = 0) {
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
  const normalized = {};
  for (const key of Object.keys(record).sort()) {
    normalized[key] = normalizeJsonValue(record[key], `${path}.${key}`, depth + 1);
  }
  return normalized;
}
function parseEnvelopeMetadata(input, path) {
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
function parseLabels(input, path) {
  const record = asRecord(input, path);
  const keys = Object.keys(record);
  if (keys.length > 32) {
    fail(path, 'at most 32 labels are allowed');
  }
  const labels = {};
  for (const key of keys.sort()) {
    if (!LABEL_KEY_PATTERN.test(key)) {
      fail(`${path}.${key}`, 'invalid label key');
    }
    labels[key] = parseBoundedString(record[key], `${path}.${key}`, 256);
  }
  return labels;
}
function parseExtensions(input, path) {
  const record = asRecord(input, path);
  const keys = Object.keys(record);
  if (keys.length > 32) {
    fail(path, 'at most 32 extensions are allowed');
  }
  const extensions = {};
  for (const key of keys.sort()) {
    if (!EXTENSION_KEY_PATTERN.test(key)) {
      fail(`${path}.${key}`, 'extension keys must use the x-* namespace');
    }
    if (RESERVED_METADATA_EXTENSIONS.has(key)) {
      fail(`${path}.${key}`, 'reserved envelope semantics cannot be overridden in metadata');
    }
    extensions[key] = normalizeJsonValue(record[key], `${path}.${key}`);
  }
  return extensions;
}
function stableStringify(input) {
  return JSON.stringify(input);
}
