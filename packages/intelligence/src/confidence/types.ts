import type { CorrelationContext, TenantContext } from '@aurora/contracts';

export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type ConfidenceDisposition = 'PROCEED_WITH_EVIDENCE' | 'VERIFY' | 'ESCALATE' | 'ABSTAIN';

export interface ConfidenceSignalSet {
  readonly evidenceQualityBps: number | null;
  readonly consistencyBps: number | null;
  readonly coverageBps: number | null;
  readonly freshnessBps: number | null;
  readonly ambiguityBps: number | null;
}

export interface ConfidenceEvaluationRequest {
  readonly tenant: TenantContext;
  readonly correlation: CorrelationContext;
  readonly signals: ConfidenceSignalSet;
}

export type ConfidenceUncertaintyReason =
  | 'EVIDENCE_QUALITY_UNKNOWN'
  | 'CONSISTENCY_UNKNOWN'
  | 'COVERAGE_UNKNOWN'
  | 'FRESHNESS_UNKNOWN'
  | 'AMBIGUITY_UNKNOWN'
  | 'HIGH_AMBIGUITY'
  | 'LOW_EVIDENCE_QUALITY'
  | 'SIGNAL_CONFLICT';

export interface ConfidenceDecomposition {
  readonly evidenceQualityBps: number | null;
  readonly consistencyBps: number | null;
  readonly coverageBps: number | null;
  readonly freshnessBps: number | null;
  readonly ambiguityBps: number | null;
}

export interface ConfidenceEvaluation {
  readonly kind: 'CONFIDENCE_EVALUATION';
  readonly schemaVersion: '1.0.0';
  readonly tenant: TenantContext;
  readonly correlation: CorrelationContext;
  readonly scoreBps: number | null;
  readonly band: ConfidenceBand;
  readonly disposition: ConfidenceDisposition;
  readonly decomposition: ConfidenceDecomposition;
  readonly uncertaintyReasons: readonly ConfidenceUncertaintyReason[];
  readonly calibrationInterfaceVersion: '1.0.0';
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export type CalibrationObservedOutcome = 'CORRECT' | 'INCORRECT' | 'INDETERMINATE';

export interface ConfidenceCalibrationSample {
  readonly kind: 'CONFIDENCE_CALIBRATION_SAMPLE';
  readonly schemaVersion: '1.0.0';
  readonly tenant: TenantContext;
  readonly correlation: CorrelationContext;
  readonly predictedScoreBps: number | null;
  readonly predictedBand: ConfidenceBand;
  readonly observedOutcome: CalibrationObservedOutcome;
  readonly recordedAt: string;
  readonly sourceEvaluationVersion: '1.0.0';
  readonly promotesRuntimeBehavior: false;
  readonly authorizesExecution: false;
}
