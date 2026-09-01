import type {
  CalibrationObservedOutcome,
  ConfidenceBand,
  ConfidenceCalibrationSample,
  ConfidenceDisposition,
  ConfidenceEvaluation,
  ConfidenceEvaluationRequest,
  ConfidenceSignalSet,
  ConfidenceUncertaintyReason,
} from './types';

const BPS_MAX = 10_000;
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function validateSignal(value: number | null, field: string): void {
  if (value === null) return;
  if (!Number.isSafeInteger(value) || value < 0 || value > BPS_MAX) {
    throw new RangeError(`${field} must be an integer between 0 and ${BPS_MAX} basis points`);
  }
}

function validateSignals(signals: ConfidenceSignalSet): void {
  validateSignal(signals.evidenceQualityBps, 'evidenceQualityBps');
  validateSignal(signals.consistencyBps, 'consistencyBps');
  validateSignal(signals.coverageBps, 'coverageBps');
  validateSignal(signals.freshnessBps, 'freshnessBps');
  validateSignal(signals.ambiguityBps, 'ambiguityBps');
}

function uncertaintyReasons(signals: ConfidenceSignalSet): ConfidenceUncertaintyReason[] {
  const reasons: ConfidenceUncertaintyReason[] = [];
  if (signals.evidenceQualityBps === null) reasons.push('EVIDENCE_QUALITY_UNKNOWN');
  if (signals.consistencyBps === null) reasons.push('CONSISTENCY_UNKNOWN');
  if (signals.coverageBps === null) reasons.push('COVERAGE_UNKNOWN');
  if (signals.freshnessBps === null) reasons.push('FRESHNESS_UNKNOWN');
  if (signals.ambiguityBps === null) reasons.push('AMBIGUITY_UNKNOWN');
  if (signals.ambiguityBps !== null && signals.ambiguityBps >= 7_000) reasons.push('HIGH_AMBIGUITY');
  if (signals.evidenceQualityBps !== null && signals.evidenceQualityBps < 4_000) {
    reasons.push('LOW_EVIDENCE_QUALITY');
  }
  if (
    signals.consistencyBps !== null &&
    signals.evidenceQualityBps !== null &&
    Math.abs(signals.consistencyBps - signals.evidenceQualityBps) >= 5_000
  ) {
    reasons.push('SIGNAL_CONFLICT');
  }
  return reasons;
}

function completeScore(signals: ConfidenceSignalSet): number | null {
  const { evidenceQualityBps, consistencyBps, coverageBps, freshnessBps, ambiguityBps } = signals;
  if (
    evidenceQualityBps === null ||
    consistencyBps === null ||
    coverageBps === null ||
    freshnessBps === null ||
    ambiguityBps === null
  ) {
    return null;
  }

  const positive =
    evidenceQualityBps * 30 +
    consistencyBps * 25 +
    coverageBps * 20 +
    freshnessBps * 15 +
    (BPS_MAX - ambiguityBps) * 10;
  return Math.floor(positive / 100);
}

function classify(
  scoreBps: number | null,
  signals: ConfidenceSignalSet,
  reasons: readonly ConfidenceUncertaintyReason[],
): { band: ConfidenceBand; disposition: ConfidenceDisposition } {
  if (scoreBps === null) return { band: 'UNKNOWN', disposition: 'ABSTAIN' };
  if (reasons.includes('SIGNAL_CONFLICT') || reasons.includes('HIGH_AMBIGUITY')) {
    return scoreBps >= 5_000
      ? { band: 'LOW', disposition: 'ESCALATE' }
      : { band: 'LOW', disposition: 'ABSTAIN' };
  }
  if (scoreBps >= 8_000 && (signals.ambiguityBps ?? BPS_MAX) <= 2_000) {
    return { band: 'HIGH', disposition: 'PROCEED_WITH_EVIDENCE' };
  }
  if (scoreBps >= 6_000) return { band: 'MEDIUM', disposition: 'VERIFY' };
  if (scoreBps >= 3_500) return { band: 'LOW', disposition: 'ESCALATE' };
  return { band: 'LOW', disposition: 'ABSTAIN' };
}

export function evaluateConfidence(request: ConfidenceEvaluationRequest): ConfidenceEvaluation {
  validateSignals(request.signals);
  const reasons = uncertaintyReasons(request.signals);
  const scoreBps = completeScore(request.signals);
  const { band, disposition } = classify(scoreBps, request.signals, reasons);

  return {
    kind: 'CONFIDENCE_EVALUATION',
    schemaVersion: '1.0.0',
    tenant: request.tenant,
    correlation: request.correlation,
    scoreBps,
    band,
    disposition,
    decomposition: { ...request.signals },
    uncertaintyReasons: reasons,
    calibrationInterfaceVersion: '1.0.0',
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

export function createCalibrationSample(
  evaluation: ConfidenceEvaluation,
  observedOutcome: CalibrationObservedOutcome,
  recordedAt: string,
): ConfidenceCalibrationSample {
  if (!RFC3339_PATTERN.test(recordedAt) || !Number.isFinite(Date.parse(recordedAt))) {
    throw new RangeError('recordedAt must be a valid RFC3339 timestamp');
  }
  return {
    kind: 'CONFIDENCE_CALIBRATION_SAMPLE',
    schemaVersion: '1.0.0',
    tenant: evaluation.tenant,
    correlation: evaluation.correlation,
    predictedScoreBps: evaluation.scoreBps,
    predictedBand: evaluation.band,
    observedOutcome,
    recordedAt,
    sourceEvaluationVersion: evaluation.schemaVersion,
    promotesRuntimeBehavior: false,
    authorizesExecution: false,
  };
}
