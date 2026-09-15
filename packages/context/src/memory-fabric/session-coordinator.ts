import type { DataClassification, TenantContext } from '@aurora/contracts/context';

import type { MemoryBoundaryKind } from '../memory-boundaries/types.js';
import type { ContextSourceAdapter } from '../sources/types.js';
import type { DurableMemoryFabricRepository } from './durable-state-adapter.js';
import { stageMemoryProposal } from './fabric.js';
import { createMemoryFabricSourceAdapter } from './source-adapter.js';
import type {
  MemoryFabricSnapshot,
  MemoryStageResult,
  MemoryWriteProposal,
} from './types.js';

export const MEMORY_FABRIC_SESSION_STATES = ['OPEN', 'CONFLICTED', 'CLOSED'] as const;
export type MemoryFabricSessionState = (typeof MEMORY_FABRIC_SESSION_STATES)[number];

export interface MemoryFabricSessionStatus {
  readonly kind: 'MemoryFabricSessionStatus';
  readonly tenant: TenantContext;
  readonly state: MemoryFabricSessionState;
  readonly durableRevision: number;
  readonly memoryRevision: number;
  readonly checkpointedMemoryRevision: number;
  readonly restored: boolean;
  readonly dirty: boolean;
  readonly authorizesExecution: false;
  readonly retryAuthorized: false;
}

export type MemoryFabricCheckpointResult =
  | {
      readonly kind: 'MEMORY_FABRIC_CHECKPOINT_RESULT';
      readonly status: 'NO_CHANGES' | 'APPLIED' | 'UNCHANGED';
      readonly durableRevision: number;
      readonly memoryRevision: number;
      readonly authorizesExecution: false;
      readonly retryAuthorized: false;
    }
  | {
      readonly kind: 'MEMORY_FABRIC_CHECKPOINT_RESULT';
      readonly status: 'CONFLICT';
      readonly currentDurableRevision: number | null;
      readonly memoryRevision: number;
      readonly authorizesExecution: false;
      readonly retryAuthorized: false;
    };

export interface MemoryFabricSession {
  readonly status: () => MemoryFabricSessionStatus;
  readonly snapshot: () => MemoryFabricSnapshot;
  readonly sourceAdapter: (
    boundary: MemoryBoundaryKind,
    maxItemsPerRead?: number,
  ) => ContextSourceAdapter;
  readonly stage: (
    proposal: MemoryWriteProposal,
    maxDataClassification: DataClassification,
  ) => MemoryStageResult;
  readonly checkpoint: () => Promise<MemoryFabricCheckpointResult>;
  readonly close: () => MemoryFabricSessionStatus;
}

export interface OpenMemoryFabricSessionRequest {
  readonly tenant: TenantContext;
  readonly repository: DurableMemoryFabricRepository;
}

function assertTenantBound(snapshot: MemoryFabricSnapshot, tenant: TenantContext): void {
  if (!tenant?.tenantId || snapshot.tenant?.tenantId !== tenant.tenantId) {
    throw new Error('MEMORY_FABRIC_SESSION_TENANT_MISMATCH');
  }
  if (snapshot.authorizesExecution !== false) {
    throw new Error('MEMORY_FABRIC_SESSION_AUTHORITY_INVALID');
  }
}

/**
 * Opens one bounded W06 memory session on top of the accepted durable repository.
 * The session may stage proposals and expose read-only context adapters, but it
 * intentionally exposes no lifecycle-promotion API and never grants authority.
 */
export async function openMemoryFabricSession(
  request: OpenMemoryFabricSessionRequest,
): Promise<MemoryFabricSession> {
  const loaded = await request.repository.load(request.tenant);
  assertTenantBound(loaded.snapshot, request.tenant);
  if (loaded.authorizesExecution !== false || loaded.retryAuthorized !== false) {
    throw new Error('MEMORY_FABRIC_SESSION_DURABLE_RESULT_INVALID');
  }
  if (!Number.isSafeInteger(loaded.durableRevision) || loaded.durableRevision < 0) {
    throw new Error('MEMORY_FABRIC_SESSION_DURABLE_REVISION_INVALID');
  }

  let currentSnapshot = loaded.snapshot;
  let durableRevision = loaded.durableRevision;
  let checkpointedMemoryRevision = currentSnapshot.revision;
  let state: MemoryFabricSessionState = 'OPEN';

  const assertOpen = (): void => {
    if (state === 'CONFLICTED') throw new Error('MEMORY_FABRIC_SESSION_CONFLICTED');
    if (state === 'CLOSED') throw new Error('MEMORY_FABRIC_SESSION_CLOSED');
  };

  const status = (): MemoryFabricSessionStatus => ({
    kind: 'MemoryFabricSessionStatus',
    tenant: request.tenant,
    state,
    durableRevision,
    memoryRevision: currentSnapshot.revision,
    checkpointedMemoryRevision,
    restored: loaded.restored,
    dirty: currentSnapshot.revision !== checkpointedMemoryRevision,
    authorizesExecution: false,
    retryAuthorized: false,
  });

  return {
    status,

    snapshot: (): MemoryFabricSnapshot => {
      assertOpen();
      return currentSnapshot;
    },

    sourceAdapter: (
      boundary: MemoryBoundaryKind,
      maxItemsPerRead?: number,
    ): ContextSourceAdapter => {
      assertOpen();
      return createMemoryFabricSourceAdapter({
        boundary,
        snapshotProvider: () => {
          assertOpen();
          return currentSnapshot;
        },
        ...(maxItemsPerRead === undefined ? {} : { maxItemsPerRead }),
      });
    },

    stage: (
      proposal: MemoryWriteProposal,
      maxDataClassification: DataClassification,
    ): MemoryStageResult => {
      assertOpen();
      const result = stageMemoryProposal({
        snapshot: currentSnapshot,
        proposal,
        maxDataClassification,
      });
      if (result.status === 'STAGED') currentSnapshot = result.snapshot;
      return result;
    },

    checkpoint: async (): Promise<MemoryFabricCheckpointResult> => {
      assertOpen();
      if (currentSnapshot.revision === checkpointedMemoryRevision) {
        return {
          kind: 'MEMORY_FABRIC_CHECKPOINT_RESULT',
          status: 'NO_CHANGES',
          durableRevision,
          memoryRevision: currentSnapshot.revision,
          authorizesExecution: false,
          retryAuthorized: false,
        };
      }

      const checkpointRevision = currentSnapshot.revision;
      const result = await request.repository.save(currentSnapshot, durableRevision);
      if (result.authorizesExecution !== false || result.retryAuthorized !== false) {
        throw new Error('MEMORY_FABRIC_SESSION_DURABLE_RESULT_INVALID');
      }
      if (result.status === 'CONFLICT') {
        state = 'CONFLICTED';
        return {
          kind: 'MEMORY_FABRIC_CHECKPOINT_RESULT',
          status: 'CONFLICT',
          currentDurableRevision: result.currentDurableRevision,
          memoryRevision: currentSnapshot.revision,
          authorizesExecution: false,
          retryAuthorized: false,
        };
      }

      durableRevision = result.durableRevision;
      checkpointedMemoryRevision = checkpointRevision;
      return {
        kind: 'MEMORY_FABRIC_CHECKPOINT_RESULT',
        status: result.status,
        durableRevision,
        memoryRevision: currentSnapshot.revision,
        authorizesExecution: false,
        retryAuthorized: false,
      };
    },

    close: (): MemoryFabricSessionStatus => {
      if (state === 'CLOSED') return status();
      state = 'CLOSED';
      return status();
    },
  };
}
