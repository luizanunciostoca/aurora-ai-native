import type { PolicySnapshot } from '@aurora/contracts/policy-engine';
import type { PolicyReference } from '@aurora/contracts/policy';

export interface PolicySnapshotRegistry {
  get(reference: PolicyReference): PolicySnapshot | undefined;
}

function keyOf(reference: PolicyReference): string {
  return `${reference.reference}\u0000${reference.version}`;
}

/**
 * W02-D in-memory runtime adapter. Exact policy reference + version lookup has
 * no fallback to latest, nearest, or default versions. Persistence belongs to W03.
 * PB2 publishes the canonical PolicySnapshot contract consumed here.
 */
export class InMemoryPolicySnapshotRegistry implements PolicySnapshotRegistry {
  readonly #snapshots: ReadonlyMap<string, PolicySnapshot>;

  constructor(snapshots: readonly PolicySnapshot[]) {
    const entries = new Map<string, PolicySnapshot>();
    for (const snapshot of snapshots) {
      const key = keyOf(snapshot.policy);
      if (entries.has(key)) {
        throw new Error(
          `duplicate policy snapshot: ${snapshot.policy.reference}@${snapshot.policy.version}`,
        );
      }
      entries.set(key, snapshot);
    }
    this.#snapshots = entries;
  }

  get(reference: PolicyReference): PolicySnapshot | undefined {
    return this.#snapshots.get(keyOf(reference));
  }
}
