import type { ConsentRecord, ConsentRecordReference } from '@aurora/contracts/consent';

export interface ConsentRegistrySnapshot {
  readonly version: string;
  readonly records: readonly ConsentRecord[];
}

export function resolveConsentReference(
  snapshot: ConsentRegistrySnapshot,
  reference: ConsentRecordReference,
): ConsentRecord | undefined {
  return snapshot.records.find(
    (record) =>
      record.reference.reference === reference.reference &&
      record.reference.version === reference.version,
  );
}
