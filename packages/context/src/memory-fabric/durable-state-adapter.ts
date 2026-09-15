import type { TenantContext } from '@aurora/contracts/context';

import { validateMemoryBoundaryCandidate } from '../memory-boundaries/model.js';
import { MEMORY_BOUNDARY_KINDS } from '../memory-boundaries/types.js';
import { createMemoryFabricSnapshot } from './fabric.js';
import {
  MEMORY_CONTENT_KINDS,
  MEMORY_LIFECYCLE_STATES,
  MEMORY_PRODUCER_KINDS,
} from './types.js';
import type { MemoryFabricSnapshot, MemoryProjectionRecord } from './types.js';

export type MemoryFabricJsonPrimitive = string | number | boolean | null;
export type MemoryFabricJsonValue =
  | MemoryFabricJsonPrimitive
  | readonly MemoryFabricJsonValue[]
  | { readonly [key: string]: MemoryFabricJsonValue };

export const MEMORY_FABRIC_DURABLE_NAMESPACE = 'aurora.w06.memory-fabric.v1' as const;
export const MEMORY_FABRIC_DURABLE_STATE_KEY = 'snapshot' as const;

export interface MemoryFabricDurableStateAddress {
  readonly tenantId: string;
  readonly namespace: string;
  readonly stateKey: string;
}

export interface MemoryFabricDurableStateRecord extends MemoryFabricDurableStateAddress {
  readonly revision: number;
  readonly payload: MemoryFabricJsonValue;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly authorizesExecution: false;
}

export type MemoryFabricDurableStateWriteResult =
  | {
      readonly status: 'APPLIED' | 'UNCHANGED';
      readonly record: MemoryFabricDurableStateRecord;
      readonly authorizesExecution: false;
      readonly retryAuthorized: false;
    }
  | {
      readonly status: 'CONFLICT';
      readonly currentRevision: number | null;
      readonly authorizesExecution: false;
      readonly retryAuthorized: false;
    };

/**
 * Consumer-owned port. W03's W03DurableStateStore satisfies this shape without
 * making W03 depend on W06 memory semantics.
 */
export interface MemoryFabricDurableStateStorePort {
  readonly load: (
    address: MemoryFabricDurableStateAddress,
  ) => Promise<MemoryFabricDurableStateRecord | null>;
  readonly compareAndSwap: (request: {
    readonly tenantId: string;
    readonly namespace: string;
    readonly stateKey: string;
    readonly expectedRevision: number;
    readonly payload: MemoryFabricJsonValue;
  }) => Promise<MemoryFabricDurableStateWriteResult>;
}

export interface DurableMemoryFabricLoadResult {
  readonly snapshot: MemoryFabricSnapshot;
  readonly durableRevision: number;
  readonly restored: boolean;
  readonly authorizesExecution: false;
  readonly retryAuthorized: false;
}

export type DurableMemoryFabricSaveResult =
  | {
      readonly status: 'APPLIED' | 'UNCHANGED';
      readonly snapshot: MemoryFabricSnapshot;
      readonly durableRevision: number;
      readonly authorizesExecution: false;
      readonly retryAuthorized: false;
    }
  | {
      readonly status: 'CONFLICT';
      readonly currentDurableRevision: number | null;
      readonly authorizesExecution: false;
      readonly retryAuthorized: false;
    };

export interface DurableMemoryFabricRepository {
  readonly load: (tenant: TenantContext) => Promise<DurableMemoryFabricLoadResult>;
  readonly save: (
    snapshot: MemoryFabricSnapshot,
    expectedDurableRevision: number,
  ) => Promise<DurableMemoryFabricSaveResult>;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isMemoryFabricJsonValue(
  value: unknown,
  seen: Set<object> = new Set(),
): value is MemoryFabricJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.every((item) => isMemoryFabricJsonValue(item, seen));
    }
    if (!plainObject(value)) return false;
    return Object.values(value).every((item) => isMemoryFabricJsonValue(item, seen));
  } finally {
    seen.delete(value);
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function recordValid(
  value: unknown,
  tenant: TenantContext,
  allowTransientWorking: boolean,
): value is MemoryProjectionRecord {
  if (!plainObject(value)) return false;
  if (value.kind !== 'MemoryProjectionRecord') return false;
  if (!nonEmpty(value.projectionReference) || !nonEmpty(value.memoryKey)) return false;
  if (!MEMORY_BOUNDARY_KINDS.includes(value.boundary as (typeof MEMORY_BOUNDARY_KINDS)[number])) {
    return false;
  }
  if (!MEMORY_LIFECYCLE_STATES.includes(value.lifecycle as (typeof MEMORY_LIFECYCLE_STATES)[number])) {
    return false;
  }
  if (!Number.isSafeInteger(value.lifecycleRevision) || Number(value.lifecycleRevision) < 0) {
    return false;
  }
  if (value.authorizesExecution !== false) return false;
  if (!plainObject(value.tenant) || value.tenant.tenantId !== tenant.tenantId) return false;

  if (!allowTransientWorking && (value.boundary === 'WORKING' || value.lifecycle === 'TRANSIENT')) {
    return false;
  }
  if (value.lifecycle === 'TRANSIENT' && value.boundary !== 'WORKING') return false;

  if (!plainObject(value.producer)) return false;
  if (!MEMORY_PRODUCER_KINDS.includes(value.producer.kind as (typeof MEMORY_PRODUCER_KINDS)[number])) {
    return false;
  }
  if (!nonEmpty(value.producer.producerReference)) return false;
  if (value.producer.providerReference !== undefined && !nonEmpty(value.producer.providerReference)) {
    return false;
  }
  if (value.producer.modelReference !== undefined && !nonEmpty(value.producer.modelReference)) {
    return false;
  }

  if (!plainObject(value.content)) return false;
  if (!MEMORY_CONTENT_KINDS.includes(value.content.kind as (typeof MEMORY_CONTENT_KINDS)[number])) {
    return false;
  }
  if (!nonEmpty(value.content.digest) || !isMemoryFabricJsonValue(value.content.payload)) return false;

  if (
    !Array.isArray(value.conflictsWithProjectionReferences) ||
    !value.conflictsWithProjectionReferences.every(nonEmpty)
  ) {
    return false;
  }

  const boundaryValidation = validateMemoryBoundaryCandidate({
    tenant,
    maxDataClassification: 'RESTRICTED',
    candidate: {
      boundary: value.boundary as MemoryProjectionRecord['boundary'],
      tenant: value.tenant as MemoryProjectionRecord['tenant'],
      ...(value.subject === undefined
        ? {}
        : { subject: value.subject as MemoryProjectionRecord['subject'] }),
      classification: value.classification as MemoryProjectionRecord['classification'],
      sourceOwner: value.sourceOwner as MemoryProjectionRecord['sourceOwner'],
      sourceReference: value.sourceReference as string,
      provenanceReference: value.provenanceReference as string,
      observedAt: value.observedAt as MemoryProjectionRecord['observedAt'],
      ...(value.retentionPolicyReference === undefined
        ? {}
        : { retentionPolicyReference: value.retentionPolicyReference as string }),
      conflictState: value.conflictState as MemoryProjectionRecord['conflictState'],
    },
  });
  if (!boundaryValidation.valid) return false;

  const optionalReferences = [
    value.sourceRevision,
    value.sourceCommitReference,
    value.sourceCommitRevision,
    value.validationReference,
    value.promotionReference,
    value.supersededByProjectionReference,
    value.supersedeReference,
    value.revocationReference,
  ];
  if (optionalReferences.some((reference) => reference !== undefined && !nonEmpty(reference))) {
    return false;
  }

  if (value.subject !== undefined && !plainObject(value.subject)) return false;
  return true;
}

export function decodeDurableMemoryFabricSnapshot(
  payload: unknown,
  tenant: TenantContext,
): MemoryFabricSnapshot {
  if (!isMemoryFabricJsonValue(payload) || !plainObject(payload)) {
    throw new Error('MEMORY_FABRIC_DURABLE_PAYLOAD_INVALID');
  }
  if (payload.kind !== 'MemoryFabricSnapshot' || payload.authorizesExecution !== false) {
    throw new Error('MEMORY_FABRIC_DURABLE_PAYLOAD_INVALID');
  }
  if (!plainObject(payload.tenant) || payload.tenant.tenantId !== tenant.tenantId) {
    throw new Error('MEMORY_FABRIC_DURABLE_TENANT_MISMATCH');
  }
  if (!Number.isSafeInteger(payload.revision) || Number(payload.revision) < 0) {
    throw new Error('MEMORY_FABRIC_DURABLE_PAYLOAD_INVALID');
  }
  if (!Array.isArray(payload.records)) throw new Error('MEMORY_FABRIC_DURABLE_PAYLOAD_INVALID');
  if (!payload.records.every((record) => recordValid(record, tenant, false))) {
    throw new Error('MEMORY_FABRIC_DURABLE_PAYLOAD_INVALID');
  }

  return cloneJson(payload) as unknown as MemoryFabricSnapshot;
}

export function encodeDurableMemoryFabricSnapshot(snapshot: MemoryFabricSnapshot): MemoryFabricJsonValue {
  if (
    snapshot.kind !== 'MemoryFabricSnapshot' ||
    snapshot.authorizesExecution !== false ||
    !snapshot.tenant?.tenantId ||
    !Number.isSafeInteger(snapshot.revision) ||
    snapshot.revision < 0 ||
    !Array.isArray(snapshot.records) ||
    !snapshot.records.every((record) => recordValid(record, snapshot.tenant, true))
  ) {
    throw new Error('MEMORY_FABRIC_SNAPSHOT_INVALID');
  }

  const durableSnapshot: MemoryFabricSnapshot = {
    ...snapshot,
    records: snapshot.records.filter(
      (record) => record.boundary !== 'WORKING' && record.lifecycle !== 'TRANSIENT',
    ),
    authorizesExecution: false,
  };
  if (!isMemoryFabricJsonValue(durableSnapshot)) {
    throw new Error('MEMORY_FABRIC_DURABLE_JSON_UNSAFE');
  }
  return cloneJson(durableSnapshot) as unknown as MemoryFabricJsonValue;
}

function addressFor(tenant: TenantContext): MemoryFabricDurableStateAddress {
  if (!tenant?.tenantId) throw new Error('MEMORY_FABRIC_DURABLE_TENANT_INVALID');
  return {
    tenantId: tenant.tenantId,
    namespace: MEMORY_FABRIC_DURABLE_NAMESPACE,
    stateKey: MEMORY_FABRIC_DURABLE_STATE_KEY,
  };
}

/**
 * Persists only durable Memory Fabric states through a W03-owned store port.
 * TRANSIENT/WORKING memory is intentionally omitted and CAS conflicts are
 * surfaced to the caller without automatic retry.
 */
export function createDurableMemoryFabricRepository(
  store: MemoryFabricDurableStateStorePort,
): DurableMemoryFabricRepository {
  return {
    load: async (tenant: TenantContext): Promise<DurableMemoryFabricLoadResult> => {
      const address = addressFor(tenant);
      const record = await store.load(address);
      if (!record) {
        return {
          snapshot: createMemoryFabricSnapshot(tenant),
          durableRevision: 0,
          restored: false,
          authorizesExecution: false,
          retryAuthorized: false,
        };
      }
      if (
        record.tenantId !== address.tenantId ||
        record.namespace !== address.namespace ||
        record.stateKey !== address.stateKey ||
        record.authorizesExecution !== false ||
        !Number.isSafeInteger(record.revision) ||
        record.revision <= 0
      ) {
        throw new Error('MEMORY_FABRIC_DURABLE_RECORD_INVALID');
      }
      return {
        snapshot: decodeDurableMemoryFabricSnapshot(record.payload, tenant),
        durableRevision: record.revision,
        restored: true,
        authorizesExecution: false,
        retryAuthorized: false,
      };
    },

    save: async (
      snapshot: MemoryFabricSnapshot,
      expectedDurableRevision: number,
    ): Promise<DurableMemoryFabricSaveResult> => {
      if (!Number.isSafeInteger(expectedDurableRevision) || expectedDurableRevision < 0) {
        throw new Error('MEMORY_FABRIC_DURABLE_EXPECTED_REVISION_INVALID');
      }
      const payload = encodeDurableMemoryFabricSnapshot(snapshot);
      const address = addressFor(snapshot.tenant);
      const result = await store.compareAndSwap({
        ...address,
        expectedRevision: expectedDurableRevision,
        payload,
      });
      if (result.status === 'CONFLICT') {
        return {
          status: 'CONFLICT',
          currentDurableRevision: result.currentRevision,
          authorizesExecution: false,
          retryAuthorized: false,
        };
      }

      const restored = decodeDurableMemoryFabricSnapshot(result.record.payload, snapshot.tenant);
      return {
        status: result.status,
        snapshot: restored,
        durableRevision: result.record.revision,
        authorizesExecution: false,
        retryAuthorized: false,
      };
    },
  };
}
