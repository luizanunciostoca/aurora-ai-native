'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ExpirySchema = exports.DeadlineSchema = exports.Rfc3339TimestampSchema = void 0;
const internal_1 = require('./internal');
const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/;
function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
function daysInMonth(year, month) {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] ?? 0;
}
function parseRfc3339Timestamp(value) {
  if (typeof value !== 'string') {
    throw new TypeError('RFC3339 timestamp must be a string');
  }
  const match = RFC3339_PATTERN.exec(value);
  if (match === null) {
    throw new TypeError('RFC3339 timestamp format is invalid');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const zoneHour = match[8] === 'Z' ? 0 : Number(match[9]);
  const zoneMinute = match[8] === 'Z' ? 0 : Number(match[10]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    zoneHour > 23 ||
    zoneMinute > 59
  ) {
    throw new TypeError('RFC3339 timestamp value is invalid');
  }
  if (!Number.isFinite(Date.parse(value))) {
    throw new TypeError('RFC3339 timestamp is not parseable');
  }
  return value;
}
exports.Rfc3339TimestampSchema = (0, internal_1.createRuntimeSchema)(parseRfc3339Timestamp);
exports.DeadlineSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'Deadline');
  (0, internal_1.assertExactKeys)(record, ['deadlineAt'], ['deadlineAt'], 'Deadline');
  return { deadlineAt: exports.Rfc3339TimestampSchema.parse(record.deadlineAt) };
});
exports.ExpirySchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'Expiry');
  (0, internal_1.assertExactKeys)(record, ['expiresAt'], ['expiresAt'], 'Expiry');
  return { expiresAt: exports.Rfc3339TimestampSchema.parse(record.expiresAt) };
});
