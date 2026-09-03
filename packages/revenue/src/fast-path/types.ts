import type { CorrelationContext, TenantId } from '@aurora/contracts';

import type { RevenueEntityRef } from '../lifecycle/types.js';
import type { ProjectedConfidenceDisposition } from '../scoring/types.js';

export const REVENUE_FAST_PATH_TASK_KINDS = [
  'CRM_CURRENT_READ',
  'QUALIFICATION_CURRENT_READ',
  'NBA_CONTEXT_REUSE',
  'REVENUE_SUMMARY_READ',
  'FOLLOW_UP_DRAFT',
  'CUSTOMER_SUCCESS_BRIEF',
] as const;
export type RevenueFastPathTaskKind = (typeof REVENUE_FAST_PATH_TASK_KINDS)[number];

export interface RevenueFastPathTask {
  readonly taskId: string;
  readonly tenantId: TenantId;
  readonly correlation: CorrelationContext;
  readonly taskKind: RevenueFastPathTaskKind;
  readonly entity: RevenueEntityRef;
  readonly entityVersion: number;
  readonly inputContractVersion: string;
  readonly riskClass: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  readonly valueClass: 'ROUTINE' | 'HIGH_VALUE';
  readonly conflictCount: number;
  readonly staleMaterialEvidence: boolean;
  readonly externalWrite: boolean;
}

/** Read-only projection of accepted W04 lane/capability/budget evidence. */
export interface RevenueFastPathControlProjection {
  readonly source: 'W04_LANE_CAPABILITY_BUDGET';
  readonly tenantId: TenantId;
  readonly correlationId: string;
  readonly lane: 'FAST' | 'GOVERNED';
  readonly preferredPlanningStrategy: 'DETERMINISTIC' | 'TEMPLATE' | 'GOVERNED_REASONING';
  readonly capabilityPlanReference: string;
  readonly capabilityPlanStatus: 'READY' | 'BLOCKED';
  readonly registryVersion: string;
  readonly budgetReference: string;
  readonly budgetState: 'WITHIN_BUDGET' | 'DEGRADED' | 'EXHAUSTED';
  readonly budgetAction: 'CONTINUE_OPTIONAL' | 'DEGRADE_OPTIONAL' | 'STOP_OPTIONAL' | 'HOLD';
  readonly mandatoryValidations: readonly [
    'CURRENT_POLICY',
    'CURRENT_AUTHORITY',
    'EXECUTOR_PRECONDITIONS',
  ];
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

/** Read-only projection of accepted W05 confidence evidence. */
export interface RevenueFastPathConfidenceProjection {
  readonly source: 'W05_CONFIDENCE';
  readonly tenantId: TenantId;
  readonly correlationId: string;
  readonly evaluationReference: string;
  readonly scoreBps: number | null;
  readonly disposition: ProjectedConfidenceDisposition;
  readonly calibrationInterfaceVersion: string;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface RevenueFastPathSourceVersion {
  readonly sourceReference: string;
  readonly sourceRevision: string;
}

/** Exact W06-F cache evaluation projection; this is not a second cache engine. */
export interface RevenueFastPathCacheProjection {
  readonly source: 'W06_SEMANTIC_CACHE_EVALUATION';
  readonly tenantId: TenantId;
  readonly correlationId: string;
  readonly status:
    'HIT' | 'MISS' | 'STALE_REJECTED' | 'INVALIDATED_REJECTED' | 'INCOMPATIBLE_REJECTED';
  readonly cacheKey: string;
  readonly queryFingerprint: string;
  readonly configVersion: string;
  readonly expectedConfigVersion: string;
  readonly sourceVersions: readonly RevenueFastPathSourceVersion[];
  readonly expectedSourceVersions: readonly RevenueFastPathSourceVersion[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly invalidated: boolean;
  readonly invalidatedAt?: string;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

/** Exact W04-G curated template-binding projection. */
export interface RevenueFastPathTemplateProjection {
  readonly source: 'W04_CURATED_PLAN_TEMPLATE';
  readonly tenantId: TenantId;
  readonly correlationId: string;
  readonly templateId: string;
  readonly semanticVersion: string;
  readonly expectedSemanticVersion: string;
  readonly contentHash: string;
  readonly expectedContentHash: string;
  readonly status: 'ACTIVE' | 'INVALIDATED';
  readonly taskKind: RevenueFastPathTaskKind;
  readonly inputContractVersion: string;
  readonly registryVersion: string;
  readonly capabilityPlanReference: string;
  readonly provenanceReference: string;
  readonly authorizesExecution: false;
  readonly adaptivePromotion: false;
  readonly canGrantPermission: false;
}

export interface RevenueFastPathSelectionInput {
  readonly evaluatedAt: string;
  readonly task: RevenueFastPathTask;
  readonly control: RevenueFastPathControlProjection;
  readonly confidence: RevenueFastPathConfidenceProjection;
  readonly cache?: RevenueFastPathCacheProjection;
  readonly template?: RevenueFastPathTemplateProjection;
}

export type RevenuePlanningPath = 'DETERMINISTIC' | 'CACHE' | 'TEMPLATE' | 'GOVERNED';

export type RevenueFastPathReason =
  | 'LOW_RISK_DETERMINISTIC_TASK'
  | 'CURRENT_COMPATIBLE_CACHE_HIT'
  | 'CURRENT_CURATED_TEMPLATE'
  | 'W04_GOVERNED_LANE'
  | 'CAPABILITY_PLAN_BLOCKED'
  | 'BUDGET_RESTRICTED'
  | 'HIGH_RISK'
  | 'HIGH_VALUE'
  | 'CONFLICTING_EVIDENCE'
  | 'STALE_MATERIAL_EVIDENCE'
  | 'CONFIDENCE_REQUIRES_GOVERNANCE'
  | 'EXTERNAL_WRITE_REQUIRES_W07'
  | 'NO_CURRENT_COMPATIBLE_FAST_PATH';

export interface RevenueFastPathEvidence {
  readonly capabilityPlanReference: string;
  readonly registryVersion: string;
  readonly budgetReference: string;
  readonly confidenceEvaluationReference: string;
  readonly confidenceDisposition: ProjectedConfidenceDisposition;
  readonly cacheStatus?: RevenueFastPathCacheProjection['status'];
  readonly cacheKey?: string;
  readonly cacheFresh?: boolean;
  readonly cacheInvalidated?: boolean;
  readonly templateId?: string;
  readonly templateVersion?: string;
  readonly templateCurrent?: boolean;
}

export interface RevenueFastPathSelection {
  readonly kind: 'REVENUE_FAST_PATH_SELECTION';
  readonly schemaVersion: '1.0.0';
  readonly tenantId: TenantId;
  readonly correlation: CorrelationContext;
  readonly taskId: string;
  readonly taskKind: RevenueFastPathTaskKind;
  readonly entity: RevenueEntityRef;
  readonly entityVersion: number;
  readonly evaluatedAt: string;
  readonly path: RevenuePlanningPath;
  readonly reason: RevenueFastPathReason;
  readonly evidence: RevenueFastPathEvidence;
  readonly requiresCurrentW07ValidationForExternalWrite: true;
  readonly createsActionIntent: false;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export const REVENUE_FAST_PATH_ERRORS = [
  'REQUEST_MALFORMED',
  'TASK_MALFORMED',
  'CONTROL_PROJECTION_MALFORMED',
  'CONFIDENCE_PROJECTION_MALFORMED',
  'CACHE_PROJECTION_MALFORMED',
  'TEMPLATE_PROJECTION_MALFORMED',
  'TENANT_MISMATCH',
  'CORRELATION_MISMATCH',
  'EVIDENCE_FUTURE_OBSERVATION',
] as const;
export type RevenueFastPathError = (typeof REVENUE_FAST_PATH_ERRORS)[number];

export type RevenueFastPathSelectionResult =
  | Readonly<{ ok: true; selection: RevenueFastPathSelection }>
  | Readonly<{ ok: false; error: RevenueFastPathError }>;

export interface RevenueFastPathBenchmarkSample {
  readonly baselineLatencyMicros: number;
  readonly selectedLatencyMicros: number;
  readonly baselineModelCalls: number;
  readonly selectedModelCalls: number;
  readonly qualityAccepted: boolean;
  readonly authorityElevationViolations: number;
}

export interface RevenueFastPathBenchmark {
  readonly schema: 'aurora.w10f.fast_path_benchmark.v1';
  readonly measurementScope: 'TEST_FIXTURE_PROXY_NOT_PRODUCTION_SLO_OR_PROVIDER_COST';
  readonly sampleCount: number;
  readonly baselineLatencyMicros: {
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
  };
  readonly selectedLatencyMicros: {
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
  };
  readonly latencySavingsBps: number;
  readonly avoidedModelCalls: number;
  readonly qualityRegressionCount: number;
  readonly authorityElevationViolations: number;
  readonly providerCost: 'NOT_OBSERVED';
  readonly productionSlo: 'NOT_OBSERVED';
}

export type RevenueFastPathBenchmarkResult =
  | Readonly<{ ok: true; benchmark: RevenueFastPathBenchmark }>
  | Readonly<{ ok: false; error: 'BENCHMARK_MALFORMED' }>;
