'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createRuntimeSchema = createRuntimeSchema;
exports.asRecord = asRecord;
exports.assertExactKeys = assertExactKeys;
exports.parseNonEmptyString = parseNonEmptyString;
function createRuntimeSchema(parser) {
  return {
    parse: parser,
    safeParse(value) {
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
function asRecord(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}
function assertExactKeys(record, allowedKeys, requiredKeys, label) {
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
function parseNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}
