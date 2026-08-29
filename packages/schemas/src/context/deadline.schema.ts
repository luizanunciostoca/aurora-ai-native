import type {
  Deadline,
  Expiry,
  Rfc3339Timestamp,
} from '../../../contracts/src/context/deadline';
import { asRecord, assertExactKeys, createRuntimeSchema } from './internal';

const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] ?? 0;
}

function parseRfc3339Timestamp(value: unknown): Rfc3339Timestamp {
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

  return value as Rfc3339Timestamp;
}

export const Rfc3339TimestampSchema = createRuntimeSchema<Rfc3339Timestamp>(parseRfc3339Timestamp);

export const DeadlineSchema = createRuntimeSchema<Deadline>((value: unknown) => {
  const record = asRecord(value, 'Deadline');
  assertExactKeys(record, ['deadlineAt'], ['deadlineAt'], 'Deadline');
  return { deadlineAt: Rfc3339TimestampSchema.parse(record.deadlineAt) };
});

export const ExpirySchema = createRuntimeSchema<Expiry>((value: unknown) => {
  const record = asRecord(value, 'Expiry');
  assertExactKeys(record, ['expiresAt'], ['expiresAt'], 'Expiry');
  return { expiresAt: Rfc3339TimestampSchema.parse(record.expiresAt) };
});
