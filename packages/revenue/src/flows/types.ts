import type { CorrelationContext, TenantId } from '@aurora/contracts';

import type { RevenueCrmCurrentnessReason, RevenueCrmReadModel } from '../crm/types.js';
import type { RevenueEntityRef } from '../lifecycle/types.js';
import type { QualificationEvaluation, QualificationStage } from '../scoring/types.js';

export const REVENUE_FLOW_KINDS = ['NURTURE', 'SALES', 'CUSTOMER_SUCCESS'] as const;
export type RevenueFlowKind = (typeof REVENUE_FLOW_KINDS)[number];

export const REVENUE_FLOW_STATES = [
  'ACTIVE',
  'PAUSED_POLICY',
  'WAITING_RECONCILIATION',
  'COMPLETED',
  'CANCELLED',
] as const;
export type RevenueFlowState = (typeof REVENUE_FLOW_STATES)[number];

export const REVENUE_CONTACT_PURPOSES = ['MARKETING', 'SALES', 'CUSTOMER_SUCCESS'] as const;
export type RevenueContactPurpose = (typeof REVENUE_CONTACT_PURPOSES)[number];

export type RevenueConsentStatus = 'ALLOWED' | 'OPTED_OUT' | 'UNKNOWN';

export type RevenueDispatchObservation =
  'NONE' | 'ACKNOWLEDGED' | 'NO_EFFECT_CONFIRMED' | 'EXECUTION_UNCERTAIN';

export type RevenueFlowCancellationReason =
  'NONE' | 'USER_REQUEST' | 'CONSENT_REVOKED' | 'BUSINESS_CANCELLED';

export type RevenueDomainTaskKind =
  'PREPARE_NURTURE_TOUCH' | 'PREPARE_SALES_HANDOFF' | 'PREPARE_CUSTOMER_SUCCESS_CHECKIN';

/** Projection of current W02 consent/purpose evaluation. It is evidence, never authority. */
export interface RevenueContactPolicyProjection {
  readonly tenantId: TenantId;
  readonly evaluatedAt: string;
  readonly current: boolean;
  readonly consentStatus: RevenueConsentStatus;
  readonly allowedPurposes: readonly RevenueContactPurpose[];
  readonly sourceRevision: string;
  readonly sourceReference: string;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

/**
 * Projection of an accepted W04 template/capability composition. W10-D does not
 * own template registry truth and stores only the bounded inputs needed to plan
 * one domain flow.
 */
export interface RevenueFlowTemplateStepProjection {
  readonly stepId: string;
  readonly taskKind: RevenueDomainTaskKind;
  readonly contactPurpose: RevenueContactPurpose;
  readonly externalAction: boolean;
  readonly cadenceMs: number;
  readonly maxAttempts: number;
}

export interface RevenueFlowTemplateProjection {
  readonly source: 'W04_TEMPLATE_PLAN';
  readonly tenantId: TenantId;
  readonly templateReference: string;
  readonly templateVersion: string;
  readonly status: 'READY' | 'STALE' | 'BLOCKED';
  readonly flowKind: RevenueFlowKind;
  readonly steps: readonly RevenueFlowTemplateStepProjection[];
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface RevenueFlowCrmProjection {
  readonly model: RevenueCrmReadModel;
  readonly current: boolean;
  readonly currentnessReasons: readonly RevenueCrmCurrentnessReason[];
}

export interface RevenueFlowRecord {
  readonly kind: 'REVENUE_DOMAIN_FLOW';
  readonly schemaVersion: '1.0.0';
  readonly tenantId: TenantId;
  readonly flowId: string;
  readonly flowKind: RevenueFlowKind;
  readonly entity: RevenueEntityRef;
  readonly entityVersion: number;
  readonly templateReference: string;
  readonly templateVersion: string;
  readonly state: RevenueFlowState;
  readonly stepIndex: number;
  readonly attemptsForStep: number;
  readonly nextEligibleAt: string;
  readonly lastTaskDedupeKey?: string;
  readonly lastDispatchObservation: RevenueDispatchObservation;
  readonly updatedAt: string;
  readonly correlation: CorrelationContext;
  readonly cancellationReason: RevenueFlowCancellationReason;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface RevenueDomainTask {
  readonly kind: 'REVENUE_DOMAIN_TASK';
  readonly schemaVersion: '1.0.0';
  readonly tenantId: TenantId;
  readonly flowId: string;
  readonly flowKind: RevenueFlowKind;
  readonly entity: RevenueEntityRef;
  readonly entityVersion: number;
  readonly stepId: string;
  readonly stepIndex: number;
  readonly attempt: number;
  readonly taskKind: RevenueDomainTaskKind;
  readonly contactPurpose: RevenueContactPurpose;
  readonly templateReference: string;
  readonly templateVersion: string;
  readonly dedupeKey: string;
  readonly plannedAt: string;
  readonly externalActionPlanned: boolean;
  readonly requiresGovernedExecution: boolean;
  readonly executionBoundary: 'W07_W08_CURRENT_VALIDATION_REQUIRED' | 'INTERNAL_DOMAIN_PREPARATION';
  readonly createsActionIntent: false;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface PlanRevenueFlowInput {
  readonly tenantId: TenantId;
  readonly flowId: string;
  readonly evaluatedAt: string;
  readonly correlation: CorrelationContext;
  readonly crm: RevenueFlowCrmProjection;
  readonly qualification?: QualificationEvaluation;
  readonly contactPolicy: RevenueContactPolicyProjection;
  readonly template: RevenueFlowTemplateProjection;
  readonly existing?: RevenueFlowRecord;
  readonly dispatchObservation?: RevenueDispatchObservation;
  readonly cancellationReason?: RevenueFlowCancellationReason;
}

export type RevenueFlowDisposition = 'TASK_READY' | 'WAIT' | 'ABSTAIN' | 'ESCALATE' | 'TERMINAL';

export type RevenueFlowReason =
  | 'TASK_CREATED'
  | 'NOT_YET_DUE'
  | 'WAITING_FOR_OUTCOME'
  | 'CRM_NOT_CURRENT'
  | 'QUALIFICATION_REQUIRED'
  | 'QUALIFICATION_INCOMPLETE'
  | 'QUALIFICATION_REVIEW_REQUIRED'
  | 'FLOW_NOT_APPLICABLE'
  | 'CONTACT_POLICY_NOT_CURRENT'
  | 'CONSENT_BLOCKED'
  | 'PURPOSE_NOT_ALLOWED'
  | 'TEMPLATE_NOT_READY'
  | 'RECONCILIATION_REQUIRED'
  | 'RETRY_BUDGET_EXHAUSTED'
  | 'FLOW_COMPLETED'
  | 'FLOW_CANCELLED';

export interface RevenueFlowPlan {
  readonly kind: 'REVENUE_FLOW_PLAN';
  readonly schemaVersion: '1.0.0';
  readonly disposition: RevenueFlowDisposition;
  readonly reason: RevenueFlowReason;
  readonly record: RevenueFlowRecord;
  readonly task?: RevenueDomainTask;
  readonly invalidatesPendingOutreach: boolean;
  readonly authoritySemantics: 'DOMAIN_TASK_ONLY_NO_ACTION_INTENT';
  readonly downstreamExecutionStillRequiresCurrentValidation: true;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export const REVENUE_FLOW_ERRORS = [
  'REQUEST_MALFORMED',
  'CRM_RECORD_MALFORMED',
  'TENANT_MISMATCH',
  'ENTITY_MISMATCH',
  'ENTITY_VERSION_CONFLICT',
  'TEMPLATE_MALFORMED',
  'TEMPLATE_STEP_DUPLICATE',
  'EXISTING_RECORD_MALFORMED',
  'FLOW_ID_CONFLICT',
  'FLOW_KIND_CONFLICT',
  'TEMPLATE_VERSION_CONFLICT',
  'OUT_OF_ORDER_EVALUATION',
  'DISPATCH_OBSERVATION_INVALID',
] as const;
export type RevenueFlowError = (typeof REVENUE_FLOW_ERRORS)[number];

export type PlanRevenueFlowResult =
  Readonly<{ ok: true; plan: RevenueFlowPlan }> | Readonly<{ ok: false; error: RevenueFlowError }>;

export interface RevenueFlowApplicability {
  readonly flowKind: RevenueFlowKind;
  readonly entityKind: RevenueEntityRef['kind'];
  readonly qualificationStages: readonly QualificationStage[];
}
