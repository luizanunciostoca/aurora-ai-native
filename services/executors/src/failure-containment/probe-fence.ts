import {
  acquireLeaseStatement,
  circuitProbeLeaseKey,
  heartbeatLeaseStatement,
  releaseLeaseStatement,
  type SqlStatement,
} from '@aurora/workflow';

import type { Rfc3339Timestamp } from '@aurora/contracts/context';

import type {
  AcquireProbeFenceRequest,
  AcquireProbeFenceResult,
  HalfOpenProbeFencePort,
  HeartbeatProbeFenceRequest,
  HeartbeatProbeFenceResult,
  ProbeFenceAcquireReason,
  ProbeFenceHeartbeatReason,
  ProbeFenceReleaseReason,
  ReleaseProbeFenceRequest,
  ReleaseProbeFenceResult,
  W03HalfOpenProbeFenceAdapterOptions,
  W03LeaseExecutor,
  W03LeaseRow,
} from './types.js';

const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const TENANT_ID_PATTERN = /^ten_[0-9A-HJKMNP-TV-Z]{26}$/;
const ACTION_INTENT_ID_PATTERN = /^ain_[0-9A-HJKMNP-TV-Z]{26}$/;

function isValidRfc3339(value: string): boolean {
  if (typeof value !== 'string' || !RFC3339_PATTERN.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function isValidTenantId(value: string): boolean {
  return typeof value === 'string' && TENANT_ID_PATTERN.test(value);
}

function isValidActionIntentId(value: string): boolean {
  return typeof value === 'string' && ACTION_INTENT_ID_PATTERN.test(value);
}

function isValidTargetScope(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidTtl(value: number | undefined): boolean {
  if (value === undefined) return true;
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function uniqueSorted<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort() as readonly T[];
}

export function createInMemoryW03LeaseExecutor(): W03LeaseExecutor {
  const leases = new Map<string, W03LeaseRow>();

  function leaseMapKey(tenantId: string, key: string): string {
    return `${tenantId}:${key}`;
  }

  return {
    query(statement: SqlStatement): readonly W03LeaseRow[] {
      const text = statement.text;
      const values = statement.values;

      if (text.includes('SELECT * FROM w03_lease')) {
        const [tenantId, key] = values as [string, string];
        const storeKey = leaseMapKey(tenantId, key);
        const existing = leases.get(storeKey);
        return existing ? [existing] : [];
      }

      if (text.includes('INSERT INTO w03_lease')) {
        const [tenantId, key, ownerToken, subjectType, subjectId, now, expiresAt] = values as [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ];
        const storeKey = leaseMapKey(tenantId, key);
        const existing = leases.get(storeKey);

        const nowMs = Date.parse(now);
        const activeUnexpired =
          existing !== undefined &&
          existing.status === 'active' &&
          Date.parse(existing.expires_at) > nowMs;

        if (activeUnexpired) {
          return [];
        }

        const newRow: W03LeaseRow = {
          tenant_id: tenantId,
          lease_key: key,
          owner_token: ownerToken,
          subject_type: subjectType,
          subject_id: subjectId,
          status: 'active',
          acquired_at: now,
          expires_at: expiresAt,
          heartbeat_at: now,
        };
        leases.set(storeKey, newRow);
        return [newRow];
      }

      if (text.includes('UPDATE w03_lease') && text.includes('expires_at = $5::timestamptz')) {
        const [tenantId, key, ownerToken, now, expiresAt] = values as [
          string,
          string,
          string,
          string,
          string,
        ];
        const storeKey = leaseMapKey(tenantId, key);
        const existing = leases.get(storeKey);

        const nowMs = Date.parse(now);
        const validHeartbeat =
          existing !== undefined &&
          existing.status === 'active' &&
          existing.owner_token === ownerToken &&
          Date.parse(existing.expires_at) > nowMs;

        if (!validHeartbeat) {
          return [];
        }

        const updatedRow: W03LeaseRow = {
          ...existing,
          heartbeat_at: now,
          expires_at: expiresAt,
        };
        leases.set(storeKey, updatedRow);
        return [updatedRow];
      }

      if (text.includes('UPDATE w03_lease') && text.includes("status = 'released'")) {
        const [tenantId, key, ownerToken, now] = values as [string, string, string, string];
        const storeKey = leaseMapKey(tenantId, key);
        const existing = leases.get(storeKey);

        const validRelease =
          existing !== undefined &&
          existing.status === 'active' &&
          existing.owner_token === ownerToken;

        if (!validRelease) {
          return [];
        }

        const releasedRow: W03LeaseRow = {
          ...existing,
          status: 'released',
          heartbeat_at: now,
        };
        leases.set(storeKey, releasedRow);
        return [releasedRow];
      }

      return [];
    },
  };
}

export function createW03HalfOpenProbeFenceAdapter(
  options: W03HalfOpenProbeFenceAdapterOptions = {},
): HalfOpenProbeFencePort {
  const executor = options.leaseExecutor ?? createInMemoryW03LeaseExecutor();
  const defaultTtlSeconds = options.defaultTtlSeconds ?? 30;

  return {
    async acquireProbeFence(request: AcquireProbeFenceRequest): Promise<AcquireProbeFenceResult> {
      const reasons: ProbeFenceAcquireReason[] = [];

      if (!isValidRfc3339(request.now)) reasons.push('INVALID_TIME');
      if (!isValidTenantId(request.tenantId)) reasons.push('INVALID_TENANT_ID');
      if (!isValidTargetScope(request.targetScope)) reasons.push('INVALID_TARGET_SCOPE');
      if (!isValidActionIntentId(request.probeActionIntentId)) {
        reasons.push('INVALID_PROBE_ACTION_INTENT_ID');
      }
      if (!isValidTtl(request.ttlSeconds)) reasons.push('INVALID_TTL');

      const leaseKey = isValidTargetScope(request.targetScope)
        ? circuitProbeLeaseKey(request.targetScope)
        : '';

      if (reasons.length > 0) {
        return {
          kind: 'ACQUIRE_PROBE_FENCE_RESULT',
          acquired: false,
          leaseKey,
          probeActionIntentId: request.probeActionIntentId,
          reasons: uniqueSorted(reasons),
          authorizesExecution: false,
        };
      }

      const ttlSeconds = request.ttlSeconds ?? defaultTtlSeconds;
      const nowMs = Date.parse(request.now);
      const expiresAtMs = nowMs + ttlSeconds * 1000;
      const expiresAt = new Date(expiresAtMs).toISOString();

      try {
        const stmt = acquireLeaseStatement({
          tenantId: request.tenantId,
          leaseKey,
          ownerToken: request.probeActionIntentId,
          subjectType: 'circuit_probe',
          subjectId: request.targetScope,
          now: request.now,
          expiresAt,
        });

        const rows = await executor.query(stmt);
        if (rows.length > 0) {
          return {
            kind: 'ACQUIRE_PROBE_FENCE_RESULT',
            acquired: true,
            leaseKey,
            probeActionIntentId: request.probeActionIntentId,
            expiresAt: expiresAt as Rfc3339Timestamp,
            reasons: [],
            authorizesExecution: false,
          };
        }

        return {
          kind: 'ACQUIRE_PROBE_FENCE_RESULT',
          acquired: false,
          leaseKey,
          probeActionIntentId: request.probeActionIntentId,
          reasons: ['PROBE_FENCE_ALREADY_ACTIVE'],
          authorizesExecution: false,
        };
      } catch {
        return {
          kind: 'ACQUIRE_PROBE_FENCE_RESULT',
          acquired: false,
          leaseKey,
          probeActionIntentId: request.probeActionIntentId,
          reasons: ['PROBE_FENCE_STORE_FAILED'],
          authorizesExecution: false,
        };
      }
    },

    async heartbeatProbeFence(
      request: HeartbeatProbeFenceRequest,
    ): Promise<HeartbeatProbeFenceResult> {
      const reasons: ProbeFenceHeartbeatReason[] = [];

      if (!isValidRfc3339(request.now)) reasons.push('INVALID_TIME');
      if (!isValidTenantId(request.tenantId)) reasons.push('INVALID_TENANT_ID');
      if (!isValidTargetScope(request.targetScope)) reasons.push('INVALID_TARGET_SCOPE');
      if (!isValidActionIntentId(request.probeActionIntentId)) {
        reasons.push('INVALID_PROBE_ACTION_INTENT_ID');
      }
      if (!isValidTtl(request.ttlSeconds)) reasons.push('INVALID_TTL');

      const leaseKey = isValidTargetScope(request.targetScope)
        ? circuitProbeLeaseKey(request.targetScope)
        : '';

      if (reasons.length > 0) {
        return {
          kind: 'HEARTBEAT_PROBE_FENCE_RESULT',
          renewed: false,
          leaseKey,
          probeActionIntentId: request.probeActionIntentId,
          reasons: uniqueSorted(reasons),
          authorizesExecution: false,
        };
      }

      const ttlSeconds = request.ttlSeconds ?? defaultTtlSeconds;
      const nowMs = Date.parse(request.now);
      const expiresAtMs = nowMs + ttlSeconds * 1000;
      const expiresAt = new Date(expiresAtMs).toISOString();

      try {
        const stmt = heartbeatLeaseStatement({
          tenantId: request.tenantId,
          leaseKey,
          ownerToken: request.probeActionIntentId,
          now: request.now,
          expiresAt,
        });

        const rows = await executor.query(stmt);
        if (rows.length > 0) {
          return {
            kind: 'HEARTBEAT_PROBE_FENCE_RESULT',
            renewed: true,
            leaseKey,
            probeActionIntentId: request.probeActionIntentId,
            expiresAt: expiresAt as Rfc3339Timestamp,
            reasons: [],
            authorizesExecution: false,
          };
        }

        let failureReason: ProbeFenceHeartbeatReason = 'PROBE_FENCE_NOT_ACTIVE';
        const checkStmt = {
          text: 'SELECT * FROM w03_lease WHERE tenant_id = $1 AND lease_key = $2',
          values: [request.tenantId, leaseKey],
        };
        const checkRows = await executor.query(checkStmt);
        if (checkRows.length > 0 && checkRows[0] !== undefined) {
          const current = checkRows[0];
          if (current.owner_token !== request.probeActionIntentId) {
            failureReason = 'PROBE_FENCE_OWNER_MISMATCH';
          } else if (current.status !== 'active') {
            failureReason = 'PROBE_FENCE_NOT_ACTIVE';
          } else if (Date.parse(current.expires_at) <= nowMs) {
            failureReason = 'PROBE_FENCE_EXPIRED';
          }
        }

        return {
          kind: 'HEARTBEAT_PROBE_FENCE_RESULT',
          renewed: false,
          leaseKey,
          probeActionIntentId: request.probeActionIntentId,
          reasons: [failureReason],
          authorizesExecution: false,
        };
      } catch {
        return {
          kind: 'HEARTBEAT_PROBE_FENCE_RESULT',
          renewed: false,
          leaseKey,
          probeActionIntentId: request.probeActionIntentId,
          reasons: ['PROBE_FENCE_STORE_FAILED'],
          authorizesExecution: false,
        };
      }
    },

    async releaseProbeFence(request: ReleaseProbeFenceRequest): Promise<ReleaseProbeFenceResult> {
      const reasons: ProbeFenceReleaseReason[] = [];

      if (!isValidRfc3339(request.now)) reasons.push('INVALID_TIME');
      if (!isValidTenantId(request.tenantId)) reasons.push('INVALID_TENANT_ID');
      if (!isValidTargetScope(request.targetScope)) reasons.push('INVALID_TARGET_SCOPE');
      if (!isValidActionIntentId(request.probeActionIntentId)) {
        reasons.push('INVALID_PROBE_ACTION_INTENT_ID');
      }

      const leaseKey = isValidTargetScope(request.targetScope)
        ? circuitProbeLeaseKey(request.targetScope)
        : '';

      if (reasons.length > 0) {
        return {
          kind: 'RELEASE_PROBE_FENCE_RESULT',
          released: false,
          leaseKey,
          probeActionIntentId: request.probeActionIntentId,
          reasons: uniqueSorted(reasons),
          authorizesExecution: false,
        };
      }

      try {
        const stmt = releaseLeaseStatement({
          tenantId: request.tenantId,
          leaseKey,
          ownerToken: request.probeActionIntentId,
          now: request.now,
        });

        const rows = await executor.query(stmt);
        if (rows.length > 0) {
          return {
            kind: 'RELEASE_PROBE_FENCE_RESULT',
            released: true,
            leaseKey,
            probeActionIntentId: request.probeActionIntentId,
            reasons: [],
            authorizesExecution: false,
          };
        }

        let failureReason: ProbeFenceReleaseReason = 'PROBE_FENCE_NOT_ACTIVE';
        const checkStmt = {
          text: 'SELECT * FROM w03_lease WHERE tenant_id = $1 AND lease_key = $2',
          values: [request.tenantId, leaseKey],
        };
        const checkRows = await executor.query(checkStmt);
        if (checkRows.length > 0 && checkRows[0] !== undefined) {
          const current = checkRows[0];
          if (current.owner_token !== request.probeActionIntentId) {
            failureReason = 'PROBE_FENCE_OWNER_MISMATCH';
          } else if (current.status !== 'active') {
            failureReason = 'PROBE_FENCE_NOT_ACTIVE';
          }
        }

        return {
          kind: 'RELEASE_PROBE_FENCE_RESULT',
          released: false,
          leaseKey,
          probeActionIntentId: request.probeActionIntentId,
          reasons: [failureReason],
          authorizesExecution: false,
        };
      } catch {
        return {
          kind: 'RELEASE_PROBE_FENCE_RESULT',
          released: false,
          leaseKey,
          probeActionIntentId: request.probeActionIntentId,
          reasons: ['PROBE_FENCE_STORE_FAILED'],
          authorizesExecution: false,
        };
      }
    },
  };
}
