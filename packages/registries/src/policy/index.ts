import type { PolicyReference } from '@aurora/contracts/policy';

export interface PolicySnapshotLike {
  readonly policy: PolicyReference;
}

export interface PolicySnapshotRegistry<TSnapshot extends PolicySnapshotLike = PolicySnapshotLike> {
  get(reference: PolicyReference): TSnapshot | undefined;
}

function keyOf(reference: PolicyReference): string {
  return `${reference.reference}\u0000${reference.version}`;
}

/**
 * W02-D test/runtime adapter only. Exact policy reference + version lookup has
 * no fallback to latest, nearest, or default versions. Persistence belongs to W03.
 *
 * The adapter is intentionally structural/generic so W02-D does not require
 * publishing the new policy-engine contract subpath before coordinator-owned PB2.
 */
export class InMemoryPolicySnapshotRegistry<TSnapshot extends PolicySnapshotLike>
  implements PolicySnapshotRegistry<TSnapshot>
{
  readonly #snapshots: ReadonlyMap<string, TSnapshot>;

  constructor(snapshots: readonly TSnapshot[]) {
    const entries = new Map<string, TSnapshot>();
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

  get(reference: PolicyReference): TSnapshot | undefined {
    return this.#snapshots.get(keyOf(reference));
  }
}
