import type {
  DueTimerClaimInput,
  LeaseAcquireInput,
  LeaseHeartbeatInput,
  LeaseOwnerInput,
  SqlStatement,
  TimerOwnerInput,
  TimerScheduleInput,
  WorkflowFollowUpInput,
} from './types';

function nonEmpty(value: string, field: string): string {
  if (value.trim().length === 0) throw new Error(`${field} must not be empty`);
  return value;
}

function metadataJson(metadata: Readonly<Record<string, unknown>> | undefined): string {
  return JSON.stringify(metadata ?? {});
}

export function workflowScheduleKey(workflowKey: string, stepKey: string): string {
  return `workflow:${nonEmpty(workflowKey, 'workflowKey')}:${nonEmpty(stepKey, 'stepKey')}`;
}

export function workflowLeaseKey(workflowKey: string): string {
  return `workflow:${nonEmpty(workflowKey, 'workflowKey')}`;
}

/**
 * Schedules at most one active timer for tenant + scheduleKey. The transaction-level
 * advisory lock closes the race that a plain NOT EXISTS check would leave open.
 */
export function scheduleTimerStatement(input: TimerScheduleInput): SqlStatement {
  nonEmpty(input.timerName, 'timerName');
  nonEmpty(input.scheduleKey, 'scheduleKey');
  return {
    text: `
WITH lock_key AS (
  SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $3::text, 0))
), existing AS (
  SELECT timer_id, tenant_id, timer_name, schedule_key, status, scheduled_for, claimed_by, metadata
  FROM w03_timer, lock_key
  WHERE tenant_id = $1
    AND schedule_key = $3
    AND status IN ('scheduled', 'claimed')
  ORDER BY created_at DESC
  LIMIT 1
), inserted AS (
  INSERT INTO w03_timer (tenant_id, timer_name, schedule_key, status, scheduled_for, metadata)
  SELECT $1, $2, $3, 'scheduled', $4::timestamptz, $5::jsonb
  FROM lock_key
  WHERE NOT EXISTS (SELECT 1 FROM existing)
  RETURNING timer_id, tenant_id, timer_name, schedule_key, status, scheduled_for, claimed_by, metadata
)
SELECT * FROM inserted
UNION ALL
SELECT * FROM existing
LIMIT 1`,
    values: [
      input.tenantId,
      input.timerName,
      input.scheduleKey,
      input.scheduledFor,
      metadataJson(input.metadata),
    ],
  };
}

/**
 * Claims one due timer and establishes its fencing lease in the same SQL statement.
 * An unexpired active lease cannot be stolen. SKIP LOCKED provides bounded worker contention.
 */
export function claimDueTimerStatement(input: DueTimerClaimInput): SqlStatement {
  nonEmpty(input.ownerToken, 'ownerToken');
  return {
    text: `
WITH candidate AS (
  SELECT timer_id
  FROM w03_timer
  WHERE tenant_id = $1
    AND status = 'scheduled'
    AND scheduled_for <= $2::timestamptz
  ORDER BY scheduled_for, timer_id
  FOR UPDATE SKIP LOCKED
  LIMIT 1
), lease_claim AS (
  INSERT INTO w03_lease (
    tenant_id, lease_key, owner_token, subject_type, subject_id,
    status, acquired_at, expires_at, heartbeat_at
  )
  SELECT
    $1,
    'timer:' || candidate.timer_id::text,
    $3,
    'timer',
    candidate.timer_id::text,
    'active',
    $2::timestamptz,
    $4::timestamptz,
    $2::timestamptz
  FROM candidate
  ON CONFLICT (tenant_id, lease_key) DO UPDATE SET
    owner_token = EXCLUDED.owner_token,
    subject_type = EXCLUDED.subject_type,
    subject_id = EXCLUDED.subject_id,
    status = 'active',
    acquired_at = EXCLUDED.acquired_at,
    expires_at = EXCLUDED.expires_at,
    heartbeat_at = EXCLUDED.heartbeat_at,
    last_error = NULL
  WHERE w03_lease.status <> 'active'
     OR w03_lease.expires_at <= $2::timestamptz
  RETURNING subject_id
)
UPDATE w03_timer AS timer
SET status = 'claimed', claimed_by = $3, updated_at = $2::timestamptz
FROM candidate, lease_claim
WHERE timer.timer_id = candidate.timer_id
  AND lease_claim.subject_id = timer.timer_id::text
RETURNING timer.*`,
    values: [input.tenantId, input.now, input.ownerToken, input.leaseExpiresAt],
  };
}

export function acquireLeaseStatement(input: LeaseAcquireInput): SqlStatement {
  nonEmpty(input.leaseKey, 'leaseKey');
  nonEmpty(input.ownerToken, 'ownerToken');
  nonEmpty(input.subjectType, 'subjectType');
  nonEmpty(input.subjectId, 'subjectId');
  return {
    text: `
INSERT INTO w03_lease (
  tenant_id, lease_key, owner_token, subject_type, subject_id,
  status, acquired_at, expires_at, heartbeat_at
)
VALUES ($1, $2, $3, $4, $5, 'active', $6::timestamptz, $7::timestamptz, $6::timestamptz)
ON CONFLICT (tenant_id, lease_key) DO UPDATE SET
  owner_token = EXCLUDED.owner_token,
  subject_type = EXCLUDED.subject_type,
  subject_id = EXCLUDED.subject_id,
  status = 'active',
  acquired_at = EXCLUDED.acquired_at,
  expires_at = EXCLUDED.expires_at,
  heartbeat_at = EXCLUDED.heartbeat_at,
  last_error = NULL
WHERE w03_lease.status <> 'active'
   OR w03_lease.expires_at <= $6::timestamptz
RETURNING *`,
    values: [
      input.tenantId,
      input.leaseKey,
      input.ownerToken,
      input.subjectType,
      input.subjectId,
      input.now,
      input.expiresAt,
    ],
  };
}

/** Heartbeat cannot revive or widen an expired/stolen lease. */
export function heartbeatLeaseStatement(input: LeaseHeartbeatInput): SqlStatement {
  nonEmpty(input.leaseKey, 'leaseKey');
  nonEmpty(input.ownerToken, 'ownerToken');
  return {
    text: `
UPDATE w03_lease
SET heartbeat_at = $4::timestamptz, expires_at = $5::timestamptz
WHERE tenant_id = $1
  AND lease_key = $2
  AND owner_token = $3
  AND status = 'active'
  AND expires_at > $4::timestamptz
RETURNING *`,
    values: [input.tenantId, input.leaseKey, input.ownerToken, input.now, input.expiresAt],
  };
}

export function releaseLeaseStatement(input: LeaseOwnerInput): SqlStatement {
  nonEmpty(input.leaseKey, 'leaseKey');
  nonEmpty(input.ownerToken, 'ownerToken');
  return {
    text: `
UPDATE w03_lease
SET status = 'released', heartbeat_at = $4::timestamptz
WHERE tenant_id = $1
  AND lease_key = $2
  AND owner_token = $3
  AND status = 'active'
RETURNING *`,
    values: [input.tenantId, input.leaseKey, input.ownerToken, input.now],
  };
}

/** Completion succeeds only while the exact timer lease remains current. */
export function completeClaimedTimerStatement(input: TimerOwnerInput): SqlStatement {
  nonEmpty(input.timerId, 'timerId');
  nonEmpty(input.ownerToken, 'ownerToken');
  return {
    text: `
WITH owned_lease AS (
  SELECT lease_id
  FROM w03_lease
  WHERE tenant_id = $1
    AND lease_key = 'timer:' || $2::text
    AND owner_token = $3
    AND status = 'active'
    AND expires_at > $4::timestamptz
  FOR UPDATE
), completed AS (
  UPDATE w03_timer AS timer
  SET status = 'completed', completed_at = $4::timestamptz, updated_at = $4::timestamptz
  FROM owned_lease
  WHERE timer.tenant_id = $1
    AND timer.timer_id::text = $2
    AND timer.status = 'claimed'
    AND timer.claimed_by = $3
  RETURNING timer.*
), released AS (
  UPDATE w03_lease AS lease
  SET status = 'released', heartbeat_at = $4::timestamptz
  FROM completed
  WHERE lease.lease_id IN (SELECT lease_id FROM owned_lease)
  RETURNING lease.lease_id
)
SELECT completed.*
FROM completed, released`,
    values: [input.tenantId, input.timerId, input.ownerToken, input.now],
  };
}

/** A claimed timer can be cancelled only by its current, unexpired fencing owner. */
export function cancelClaimedTimerStatement(input: TimerOwnerInput): SqlStatement {
  nonEmpty(input.timerId, 'timerId');
  nonEmpty(input.ownerToken, 'ownerToken');
  return {
    text: `
WITH owned_lease AS (
  SELECT lease_id
  FROM w03_lease
  WHERE tenant_id = $1
    AND lease_key = 'timer:' || $2::text
    AND owner_token = $3
    AND status = 'active'
    AND expires_at > $4::timestamptz
  FOR UPDATE
), cancelled AS (
  UPDATE w03_timer AS timer
  SET status = 'cancelled', updated_at = $4::timestamptz
  FROM owned_lease
  WHERE timer.tenant_id = $1
    AND timer.timer_id::text = $2
    AND timer.status = 'claimed'
    AND timer.claimed_by = $3
  RETURNING timer.*
), released AS (
  UPDATE w03_lease AS lease
  SET status = 'released', heartbeat_at = $4::timestamptz
  FROM cancelled
  WHERE lease.lease_id IN (SELECT lease_id FROM owned_lease)
  RETURNING lease.lease_id
)
SELECT cancelled.*
FROM cancelled, released`,
    values: [input.tenantId, input.timerId, input.ownerToken, input.now],
  };
}

export function cancelScheduledTimerStatement(
  tenantId: TimerOwnerInput['tenantId'],
  timerId: string,
  now: string,
): SqlStatement {
  nonEmpty(timerId, 'timerId');
  return {
    text: `
UPDATE w03_timer
SET status = 'cancelled', updated_at = $3::timestamptz
WHERE tenant_id = $1
  AND timer_id::text = $2
  AND status = 'scheduled'
RETURNING *`,
    values: [tenantId, timerId, now],
  };
}

/**
 * Restart recovery expires stale timer leases and requeues only the timer still
 * fenced by that exact stale owner. A newer owner can never be rolled back.
 */
export function recoverExpiredTimerClaimsStatement(
  tenantId: TimerOwnerInput['tenantId'],
  now: string,
): SqlStatement {
  return {
    text: `
WITH expired AS (
  UPDATE w03_lease
  SET status = 'expired', heartbeat_at = $2::timestamptz,
      last_error = 'lease expired before timer completion'
  WHERE tenant_id = $1
    AND status = 'active'
    AND subject_type = 'timer'
    AND expires_at <= $2::timestamptz
  RETURNING subject_id, owner_token
)
UPDATE w03_timer AS timer
SET status = 'scheduled', claimed_by = NULL, updated_at = $2::timestamptz
FROM expired
WHERE timer.tenant_id = $1
  AND timer.timer_id::text = expired.subject_id
  AND timer.status = 'claimed'
  AND timer.claimed_by = expired.owner_token
RETURNING timer.*`,
    values: [tenantId, now],
  };
}

export function scheduleWorkflowFollowUpStatement(input: WorkflowFollowUpInput): SqlStatement {
  const scheduleKey = workflowScheduleKey(input.workflowKey, input.stepKey);
  return scheduleTimerStatement({
    tenantId: input.tenantId,
    timerName: 'workflow-follow-up',
    scheduleKey,
    scheduledFor: input.scheduledFor,
    metadata: {
      ...(input.metadata ?? {}),
      workflowKey: input.workflowKey,
      stepKey: input.stepKey,
      durableWorkflowPrimitive: true,
    },
  });
}
