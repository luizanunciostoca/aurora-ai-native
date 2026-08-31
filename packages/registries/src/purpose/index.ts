import type { PurposeContext } from '@aurora/contracts/purpose';

export interface PurposeRegistrySnapshot {
  readonly version: string;
  readonly purposes: readonly PurposeContext[];
}

export function resolvePurpose(snapshot: PurposeRegistrySnapshot, purposeId: string): PurposeContext | undefined {
  return snapshot.purposes.find((purpose) => purpose.purposeId === purposeId);
}
