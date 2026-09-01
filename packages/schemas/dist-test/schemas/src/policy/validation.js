'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.asRecord = asRecord;
exports.assertKnownKeys = assertKnownKeys;
exports.requireNonEmptyString = requireNonEmptyString;
exports.optionalNonEmptyString = optionalNonEmptyString;
exports.requireSubject = requireSubject;
exports.requireScope = requireScope;
exports.requirePolicyReference = requirePolicyReference;
exports.optionalConstraints = optionalConstraints;
exports.compareRfc3339 = compareRfc3339;
exports.parseJsonObject = parseJsonObject;
const SENSITIVE_KEY_MARKERS = [
  'apikey',
  'accesstoken',
  'bearertoken',
  'credential',
  'password',
  'privatekey',
  'providertoken',
  'refreshtoken',
  'secret',
];
function asRecord(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}
function assertKnownKeys(value, allowed, label) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new TypeError(`${label} contains unsupported field: ${key}`);
    }
  }
}
function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}
function optionalNonEmptyString(value, label) {
  if (value === undefined) {
    return undefined;
  }
  return requireNonEmptyString(value, label);
}
function requireSubject(value) {
  const subject = asRecord(value, 'subject');
  assertKnownKeys(subject, ['reference'], 'subject');
  return { reference: requireNonEmptyString(subject.reference, 'subject.reference') };
}
function requireScope(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('scope must be a non-empty array');
  }
  const scopes = value.map((entry, index) => requireNonEmptyString(entry, `scope[${index}]`));
  if (new Set(scopes).size !== scopes.length) {
    throw new TypeError('scope must not contain duplicate entries');
  }
  return scopes;
}
function requirePolicyReference(value, versionValidator) {
  const policy = asRecord(value, 'policy');
  assertKnownKeys(policy, ['reference', 'version'], 'policy');
  return {
    reference: requireNonEmptyString(policy.reference, 'policy.reference'),
    version: versionValidator.parse(policy.version),
  };
}
function optionalConstraints(value) {
  if (value === undefined) {
    return undefined;
  }
  const constraints = asRecord(value, 'constraints');
  assertJsonCompatibleAndSecretFree(constraints, 'constraints', new WeakSet());
  return constraints;
}
function assertJsonCompatibleAndSecretFree(value, path, seen) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} contains a non-finite number`);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError(`${path} must be acyclic JSON data`);
    }
    seen.add(value);
    value.forEach((entry, index) =>
      assertJsonCompatibleAndSecretFree(entry, `${path}[${index}]`, seen),
    );
    seen.delete(value);
    return;
  }
  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) {
      throw new TypeError(`${path} must be acyclic JSON data`);
    }
    seen.add(value);
    for (const [key, entry] of Object.entries(value)) {
      const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (SENSITIVE_KEY_MARKERS.some((marker) => normalizedKey.includes(marker))) {
        throw new TypeError(`${path} may not contain credential or secret material`);
      }
      assertJsonCompatibleAndSecretFree(entry, `${path}.${key}`, seen);
    }
    seen.delete(value);
    return;
  }
  throw new TypeError(`${path} must contain only JSON-compatible values`);
}
function compareRfc3339(left, right) {
  return Date.parse(left) - Date.parse(right);
}
function parseJsonObject(serialized, label) {
  try {
    return JSON.parse(serialized);
  } catch {
    throw new TypeError(`${label} must be valid JSON`);
  }
}
