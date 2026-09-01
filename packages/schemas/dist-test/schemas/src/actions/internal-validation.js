'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.fail = fail;
exports.asRecord = asRecord;
exports.exactKeys = exactKeys;
exports.nonEmptyString = nonEmptyString;
exports.optionalNonEmptyString = optionalNonEmptyString;
exports.timestamp = timestamp;
exports.jsonObject = jsonObject;
exports.restrictedMetadata = restrictedMetadata;
exports.externalReference = externalReference;
exports.optional = optional;
function fail(path, message) {
  throw new TypeError(`${path}: ${message}`);
}
function asRecord(input, path) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return fail(path, 'expected object');
  }
  return input;
}
function exactKeys(record, allowed, required, path) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) fail(`${path}.${key}`, 'unknown field');
  }
  for (const key of required) {
    if (!(key in record)) fail(`${path}.${key}`, 'missing required field');
  }
}
function nonEmptyString(input, path, max = 512) {
  if (typeof input !== 'string') return fail(path, 'expected string');
  const value = input.trim();
  if (value.length === 0) return fail(path, 'must not be empty');
  if (value.length > max) return fail(path, `exceeds ${max} characters`);
  return value;
}
function optionalNonEmptyString(input, path, max = 512) {
  return input === undefined ? undefined : nonEmptyString(input, path, max);
}
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
function timestamp(input, path) {
  const value = nonEmptyString(input, path, 64);
  if (!RFC3339.test(value) || Number.isNaN(Date.parse(value))) {
    return fail(path, 'expected valid RFC3339 timestamp');
  }
  return value;
}
function jsonValue(input, path, depth) {
  if (depth > 8) return fail(path, 'JSON nesting exceeds depth 8');
  if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return fail(path, 'number must be finite');
    return input;
  }
  if (Array.isArray(input))
    return input.map((value, index) => jsonValue(value, `${path}[${index}]`, depth + 1));
  if (typeof input === 'object') {
    const source = input;
    const output = {};
    for (const [key, value] of Object.entries(source)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key))
        fail(`${path}.${key}`, 'forbidden key');
      output[key] = jsonValue(value, `${path}.${key}`, depth + 1);
    }
    return output;
  }
  return fail(path, 'expected JSON-compatible value');
}
function jsonObject(input, path) {
  const record = asRecord(input, path);
  return jsonValue(record, path, 0);
}
function restrictedMetadata(input, path) {
  const record = asRecord(input, path);
  const entries = Object.entries(record);
  if (entries.length > 32) fail(path, 'maximum 32 metadata keys');
  const output = {};
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
function externalReference(input, path) {
  const record = asRecord(input, path);
  exactKeys(record, ['system', 'reference'], ['system', 'reference'], path);
  return {
    system: nonEmptyString(record.system, `${path}.system`, 128),
    reference: nonEmptyString(record.reference, `${path}.reference`, 1024),
  };
}
function optional(input, parser) {
  return input === undefined ? undefined : parser(input);
}
