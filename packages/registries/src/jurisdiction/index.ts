import type { JurisdictionRestriction } from '@aurora/contracts/jurisdiction';

export interface JurisdictionRegistrySnapshot {
  readonly version: string;
  readonly restrictions: readonly JurisdictionRestriction[];
}

export function resolveJurisdictionRestriction(
  snapshot: JurisdictionRegistrySnapshot,
  jurisdiction: string,
  purposeId: string,
): JurisdictionRestriction | undefined {
  return snapshot.restrictions.find(
    (restriction) =>
      restriction.jurisdiction === jurisdiction &&
      (restriction.purposeIds === undefined || restriction.purposeIds.includes(purposeId)),
  );
}
