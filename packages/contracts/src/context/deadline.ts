declare const RFC3339_TIMESTAMP_BRAND: unique symbol;

export type Rfc3339Timestamp = string & {
  readonly [RFC3339_TIMESTAMP_BRAND]: 'Rfc3339Timestamp';
};

export interface Deadline {
  readonly deadlineAt: Rfc3339Timestamp;
}

export interface Expiry {
  readonly expiresAt: Rfc3339Timestamp;
}
