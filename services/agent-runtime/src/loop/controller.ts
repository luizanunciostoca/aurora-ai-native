import type {
  AdaptiveLoopControlFrame,
  AdaptiveLoopEvent,
  AdaptiveLoopSnapshot,
  AdaptiveLoopTerminalPhase,
  AdaptiveLoopTerminalReason,
  AdvanceAdaptiveLoopResult,
  BoundedAdaptiveLoopConfig,
  PlannedToolAction,
  StartAdaptiveLoopInput,
  StartAdaptiveLoopResult,
} from './types.js';

const TERMINAL_PHASES = new Set<AdaptiveLoopTerminalPhase>([
  'COMPLETED',
  'ABSTAINED',
  'ESCALATED',
  'CANCELLED',
  'BUDGET_EXHAUSTED',
  'FAILED',
]);

const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

function validPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function validNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validIdentifier(value: string): boolean {
  return IDENTIFIER_PATTERN.test(value);
}

function validReference(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 512;
}

function validConfig(config: BoundedAdaptiveLoopConfig): boolean {
  return (
    validPositiveSafeInteger(config.maxIterations) &&
    validPositiveSafeInteger(config.maxElapsedMs) &&
    validPositiveSafeInteger(config.maxModelCalls) &&
    validPositiveSafeInteger(config.maxToolPlanningCalls) &&
    validPositiveSafeInteger(config.maxRepairAttempts)
  );
}

function sameContext(
  tenantId: string,
  correlationId: string,
  frame: AdaptiveLoopControlFrame,
): boolean {
  return (
    frame.worker.tenant.tenantId === tenantId &&
    frame.worker.correlation.correlationId === correlationId &&
    frame.capabilityPlan.tenantId === tenantId &&
    frame.capabilityPlan.correlationId === correlationId &&
    frame.budget.tenantId === tenantId &&
    frame.budget.correlationId === correlationId
  );
}

function validFrameShape(frame: AdaptiveLoopControlFrame): boolean {
  const capabilityIds = frame.capabilityPlan.selectedCapabilityIds;
  return (
    validNonNegativeSafeInteger(frame.nowEpochMs) &&
    frame.worker.authoritySemantics === 'AGENT_RUNTIME_OWNERSHIP_ONLY_NO_AUTHORITY' &&
    frame.worker.authorizesExecution === false &&
    frame.worker.canInvokeTools === false &&
    frame.worker.taskId.trim().length > 0 &&
    validNonNegativeSafeInteger(frame.worker.generation) &&
    frame.capabilityPlan.source === 'W04_CAPABILITY_PLAN' &&
    frame.capabilityPlan.authorizesExecution === false &&
    frame.capabilityPlan.registryVersion.trim().length > 0 &&
    Array.isArray(capabilityIds) &&
    capabilityIds.every((capabilityId) => validIdentifier(capabilityId)) &&
    new Set(capabilityIds).size === capabilityIds.length &&
    frame.budget.source === 'W04_EXECUTION_BUDGET_ASSESSMENT' &&
    frame.budget.budgetId.trim().length > 0 &&
    frame.budget.mandatorySafetyValidationRequired === true &&
    frame.budget.canSkipMandatoryValidation === false &&
    frame.budget.authorizesExecution === false &&
    validNonNegativeSafeInteger(frame.budget.remaining.latencyMs) &&
    validNonNegativeSafeInteger(frame.budget.remaining.reasoningUnits) &&
    validNonNegativeSafeInteger(frame.budget.remaining.toolCalls)
  );
}

function workerUsableForLoop(frame: AdaptiveLoopControlFrame): boolean {
  return (
    frame.worker.state === 'ACTIVE' &&
    frame.worker.ownerPresent === true &&
    frame.worker.cancelRequested === false &&
    frame.worker.generation > 0 &&
    frame.worker.justification === 'ITERATIVE_OBSERVE_PLAN_REQUIRED'
  );
}

function budgetAvailable(frame: AdaptiveLoopControlFrame): boolean {
  return (
    frame.budget.state !== 'EXHAUSTED' &&
    frame.budget.action !== 'STOP_OPTIONAL' &&
    frame.budget.action !== 'HOLD' &&
    frame.budget.remaining.latencyMs > 0
  );
}

function copyPlannedActions(actions: readonly PlannedToolAction[]): readonly PlannedToolAction[] {
  return actions.map((action) => ({ ...action }));
}

function copySnapshot(
  snapshot: AdaptiveLoopSnapshot,
  patch: Partial<AdaptiveLoopSnapshot>,
): AdaptiveLoopSnapshot {
  return {
    ...snapshot,
    ...patch,
    tenant: { ...snapshot.tenant },
    correlation: { ...snapshot.correlation },
    strategy: { ...snapshot.strategy },
    config: { ...snapshot.config },
    usage: patch.usage ? { ...patch.usage } : { ...snapshot.usage },
    plannedActions: patch.plannedActions
      ? copyPlannedActions(patch.plannedActions)
      : copyPlannedActions(snapshot.plannedActions),
  };
}

function terminate(
  snapshot: AdaptiveLoopSnapshot,
  phase: AdaptiveLoopTerminalPhase,
  reason: AdaptiveLoopTerminalReason,
  nowEpochMs: number,
  evidenceReference?: string,
  usage = snapshot.usage,
): AdvanceAdaptiveLoopResult {
  return {
    status: 'TERMINATED',
    code: 'TERMINATED',
    snapshot: copySnapshot(snapshot, {
      phase,
      usage,
      terminalReason: reason,
      lastTransitionEpochMs: nowEpochMs,
      lastEvidenceReference: evidenceReference ?? snapshot.lastEvidenceReference,
    }),
  };
}

function rejectEvent(snapshot: AdaptiveLoopSnapshot): AdvanceAdaptiveLoopResult {
  return {
    status: 'REJECTED',
    code: 'INVALID_EVENT',
    snapshot: copySnapshot(snapshot, {}),
  };
}

function advanced(
  snapshot: AdaptiveLoopSnapshot,
  phase: AdaptiveLoopSnapshot['phase'],
  event: AdaptiveLoopEvent,
  frame: AdaptiveLoopControlFrame,
  usage = snapshot.usage,
  plannedActions = snapshot.plannedActions,
): AdvanceAdaptiveLoopResult {
  return {
    status: 'ADVANCED',
    code: 'ADVANCED',
    snapshot: copySnapshot(snapshot, {
      phase,
      usage,
      plannedActions,
      lastTransitionEpochMs: frame.nowEpochMs,
      lastEvidenceReference: event.evidenceReference,
      terminalReason: null,
    }),
  };
}

function modelUsageOrLimit(
  snapshot: AdaptiveLoopSnapshot,
  frame: AdaptiveLoopControlFrame,
  event: AdaptiveLoopEvent & { readonly usedModel: boolean },
): { usage: AdaptiveLoopSnapshot['usage'] } | { result: AdvanceAdaptiveLoopResult } {
  if (!event.usedModel) return { usage: snapshot.usage };
  if (frame.budget.remaining.reasoningUnits === 0) {
    return {
      result: terminate(
        snapshot,
        'BUDGET_EXHAUSTED',
        'W04_REASONING_BUDGET_EXHAUSTED',
        frame.nowEpochMs,
        event.evidenceReference,
      ),
    };
  }
  if (snapshot.usage.modelCalls >= snapshot.config.maxModelCalls) {
    return {
      result: terminate(
        snapshot,
        'BUDGET_EXHAUSTED',
        'LOCAL_MODEL_CALL_LIMIT',
        frame.nowEpochMs,
        event.evidenceReference,
      ),
    };
  }
  return {
    usage: {
      ...snapshot.usage,
      modelCalls: snapshot.usage.modelCalls + 1,
    },
  };
}

function dispositionResult(
  snapshot: AdaptiveLoopSnapshot,
  frame: AdaptiveLoopControlFrame,
  event: AdaptiveLoopEvent,
  disposition: 'TOOL_PLAN' | 'VALIDATE' | 'ABSTAIN' | 'ESCALATE' | 'FAIL',
  usage: AdaptiveLoopSnapshot['usage'],
): AdvanceAdaptiveLoopResult {
  switch (disposition) {
    case 'TOOL_PLAN':
      return advanced(snapshot, 'TOOL_PLAN', event, frame, usage, []);
    case 'VALIDATE':
      return advanced(snapshot, 'VALIDATE', event, frame, usage);
    case 'ABSTAIN':
      return terminate(
        snapshot,
        'ABSTAINED',
        'ABSTAINED_BY_STEP',
        frame.nowEpochMs,
        event.evidenceReference,
        usage,
      );
    case 'ESCALATE':
      return terminate(
        snapshot,
        'ESCALATED',
        'ESCALATED_BY_STEP',
        frame.nowEpochMs,
        event.evidenceReference,
        usage,
      );
    case 'FAIL':
      return terminate(
        snapshot,
        'FAILED',
        'FAILED_BY_STEP',
        frame.nowEpochMs,
        event.evidenceReference,
        usage,
      );
  }
}

function validPlannedActions(
  actions: readonly PlannedToolAction[],
  frame: AdaptiveLoopControlFrame,
): boolean {
  if (actions.length === 0) return false;
  if (actions.length > frame.budget.remaining.toolCalls) return false;
  const allowedCapabilities = new Set(frame.capabilityPlan.selectedCapabilityIds);
  const uniqueActions = new Set<string>();
  for (const action of actions) {
    if (
      !validIdentifier(action.capabilityId) ||
      !validIdentifier(action.actionType) ||
      action.executionBoundary !== 'W07_REQUIRED' ||
      !validReference(action.planReference) ||
      !allowedCapabilities.has(action.capabilityId)
    ) {
      return false;
    }
    const key = `${action.capabilityId}\u0000${action.actionType}\u0000${action.planReference}`;
    if (uniqueActions.has(key)) return false;
    uniqueActions.add(key);
  }
  return true;
}

function frameFailure(
  snapshot: AdaptiveLoopSnapshot,
  frame: AdaptiveLoopControlFrame,
): AdvanceAdaptiveLoopResult | null {
  if (!validFrameShape(frame)) {
    return terminate(snapshot, 'FAILED', 'CONTROL_FRAME_INVALID', frame.nowEpochMs);
  }
  if (!sameContext(snapshot.tenant.tenantId, snapshot.correlation.correlationId, frame)) {
    return terminate(snapshot, 'FAILED', 'CONTROL_FRAME_INVALID', frame.nowEpochMs);
  }
  if (
    frame.worker.taskId !== snapshot.workerTaskId ||
    frame.worker.generation !== snapshot.workerGeneration ||
    frame.worker.state !== 'ACTIVE' ||
    frame.worker.ownerPresent !== true
  ) {
    return terminate(snapshot, 'FAILED', 'WORKER_OWNERSHIP_CHANGED', frame.nowEpochMs);
  }
  if (frame.worker.cancelRequested) {
    return terminate(snapshot, 'CANCELLED', 'CANCELLED_BY_CONTROL', frame.nowEpochMs);
  }
  if (
    frame.capabilityPlan.registryVersion !== snapshot.capabilityRegistryVersion ||
    frame.budget.budgetId !== snapshot.budgetId
  ) {
    return terminate(snapshot, 'FAILED', 'CONTROL_FRAME_INVALID', frame.nowEpochMs);
  }
  if (frame.capabilityPlan.status !== 'READY') {
    return terminate(snapshot, 'FAILED', 'CAPABILITY_PLAN_BLOCKED', frame.nowEpochMs);
  }
  if (frame.nowEpochMs < snapshot.lastTransitionEpochMs || frame.nowEpochMs < snapshot.startedAtEpochMs) {
    return terminate(snapshot, 'FAILED', 'CONTROL_FRAME_INVALID', frame.nowEpochMs);
  }
  const elapsed = frame.nowEpochMs - snapshot.startedAtEpochMs;
  if (!Number.isSafeInteger(elapsed) || elapsed > snapshot.config.maxElapsedMs) {
    return terminate(snapshot, 'BUDGET_EXHAUSTED', 'LOCAL_ELAPSED_LIMIT', frame.nowEpochMs);
  }
  if (frame.budget.remaining.latencyMs === 0) {
    return terminate(
      snapshot,
      'BUDGET_EXHAUSTED',
      'W04_LATENCY_BUDGET_EXHAUSTED',
      frame.nowEpochMs,
    );
  }
  if (
    frame.budget.state === 'EXHAUSTED' ||
    frame.budget.action === 'STOP_OPTIONAL' ||
    frame.budget.action === 'HOLD'
  ) {
    return terminate(snapshot, 'BUDGET_EXHAUSTED', 'W04_BUDGET_STOP', frame.nowEpochMs);
  }
  return null;
}

export function startAdaptiveLoop(input: StartAdaptiveLoopInput): StartAdaptiveLoopResult {
  const { frame, route, config } = input;
  if (!validConfig(config) || !validIdentifier(input.loopId)) {
    return { status: 'REJECTED', code: 'INVALID_CONFIG' };
  }
  if (!validFrameShape(frame)) {
    return { status: 'REJECTED', code: 'INVALID_CONTROL_FRAME' };
  }
  if (route.status !== 'SELECTED') {
    return { status: 'REJECTED', code: 'ROUTE_NOT_SELECTED' };
  }
  if (
    route.source !== 'W05_B_INTELLIGENCE_ROUTE' ||
    route.authorizesExecution !== false ||
    route.downstreamExecutionStillRequiresCurrentValidation !== true ||
    !sameContext(route.tenant.tenantId, route.correlation.correlationId, frame)
  ) {
    return { status: 'REJECTED', code: 'INVALID_CONTROL_FRAME' };
  }
  if (
    !['MODEL', 'SPECIALIST', 'COMPUTER_USE_PLANNING'].includes(route.family) ||
    !validIdentifier(route.strategyId) ||
    !validIdentifier(route.strategyVersion) ||
    !workerUsableForLoop(frame)
  ) {
    return { status: 'REJECTED', code: 'ROUTE_NOT_AGENT_SUITABLE' };
  }
  if (frame.capabilityPlan.status !== 'READY') {
    return { status: 'REJECTED', code: 'CAPABILITY_PLAN_BLOCKED' };
  }
  if (!budgetAvailable(frame)) {
    return { status: 'REJECTED', code: 'BUDGET_NOT_AVAILABLE' };
  }

  return {
    status: 'STARTED',
    snapshot: {
      loopId: input.loopId,
      tenant: { ...route.tenant },
      correlation: { ...route.correlation },
      workerTaskId: frame.worker.taskId,
      workerGeneration: frame.worker.generation,
      phase: 'OBSERVE',
      strategy: {
        family: route.family,
        strategyId: route.strategyId,
        strategyVersion: route.strategyVersion,
      },
      capabilityRegistryVersion: frame.capabilityPlan.registryVersion,
      budgetId: frame.budget.budgetId,
      config: { ...config },
      usage: {
        iterations: 0,
        modelCalls: 0,
        toolPlanningCalls: 0,
        repairAttempts: 0,
      },
      startedAtEpochMs: frame.nowEpochMs,
      lastTransitionEpochMs: frame.nowEpochMs,
      lastEvidenceReference: null,
      plannedActions: [],
      terminalReason: null,
      authoritySemantics: 'ADAPTIVE_LOOP_PLANNING_ONLY_NO_AUTHORITY',
      authorizesExecution: false,
      canInvokeTools: false,
      downstreamExecutionStillRequiresCurrentValidation: true,
    },
  };
}

export function advanceAdaptiveLoop(
  snapshot: AdaptiveLoopSnapshot,
  event: AdaptiveLoopEvent,
  frame: AdaptiveLoopControlFrame,
): AdvanceAdaptiveLoopResult {
  if (TERMINAL_PHASES.has(snapshot.phase as AdaptiveLoopTerminalPhase)) {
    return {
      status: 'REJECTED',
      code: 'ALREADY_TERMINAL',
      snapshot: copySnapshot(snapshot, {}),
    };
  }

  const frameFailureResult = frameFailure(snapshot, frame);
  if (frameFailureResult) return frameFailureResult;
  if (!validReference(event.evidenceReference)) return rejectEvent(snapshot);

  if (event.kind === 'CANCEL_REQUESTED') {
    return terminate(
      snapshot,
      'CANCELLED',
      'CANCELLED_BY_CONTROL',
      frame.nowEpochMs,
      event.evidenceReference,
    );
  }

  switch (snapshot.phase) {
    case 'OBSERVE': {
      if (event.kind !== 'OBSERVATION_READY') return rejectEvent(snapshot);
      if (snapshot.usage.iterations >= snapshot.config.maxIterations) {
        return terminate(
          snapshot,
          'BUDGET_EXHAUSTED',
          'LOCAL_ITERATION_LIMIT',
          frame.nowEpochMs,
          event.evidenceReference,
        );
      }
      return advanced(snapshot, 'PLAN', event, frame, {
        ...snapshot.usage,
        iterations: snapshot.usage.iterations + 1,
      });
    }
    case 'PLAN': {
      if (event.kind !== 'PLAN_READY') return rejectEvent(snapshot);
      const modelUsage = modelUsageOrLimit(snapshot, frame, event);
      if ('result' in modelUsage) return modelUsage.result;
      return dispositionResult(snapshot, frame, event, event.disposition, modelUsage.usage);
    }
    case 'TOOL_PLAN': {
      if (event.kind !== 'TOOL_PLAN_READY') return rejectEvent(snapshot);
      if (snapshot.usage.toolPlanningCalls >= snapshot.config.maxToolPlanningCalls) {
        return terminate(
          snapshot,
          'BUDGET_EXHAUSTED',
          'LOCAL_TOOL_PLANNING_LIMIT',
          frame.nowEpochMs,
          event.evidenceReference,
        );
      }
      if (!validPlannedActions(event.plannedActions, frame)) {
        if (event.plannedActions.length > frame.budget.remaining.toolCalls) {
          return terminate(
            snapshot,
            'BUDGET_EXHAUSTED',
            'W04_TOOL_BUDGET_EXHAUSTED',
            frame.nowEpochMs,
            event.evidenceReference,
          );
        }
        return rejectEvent(snapshot);
      }
      const usage = {
        ...snapshot.usage,
        toolPlanningCalls: snapshot.usage.toolPlanningCalls + 1,
      };
      if (event.disposition === 'AWAIT_OBSERVATION') {
        return advanced(
          snapshot,
          'WAITING_TOOL_OBSERVATION',
          event,
          frame,
          usage,
          event.plannedActions,
        );
      }
      if (event.disposition === 'VALIDATE') {
        return advanced(snapshot, 'VALIDATE', event, frame, usage, event.plannedActions);
      }
      return dispositionResult(snapshot, frame, event, event.disposition, usage);
    }
    case 'WAITING_TOOL_OBSERVATION': {
      if (event.kind !== 'TOOL_OBSERVATION_READY') return rejectEvent(snapshot);
      if (event.observationStatus === 'UNKNOWN') {
        return terminate(
          snapshot,
          'ESCALATED',
          'UNKNOWN_TOOL_OBSERVATION',
          frame.nowEpochMs,
          event.evidenceReference,
        );
      }
      return advanced(snapshot, 'INSPECT', event, frame);
    }
    case 'INSPECT': {
      if (event.kind !== 'INSPECTION_READY') return rejectEvent(snapshot);
      const modelUsage = modelUsageOrLimit(snapshot, frame, event);
      if ('result' in modelUsage) return modelUsage.result;
      return dispositionResult(snapshot, frame, event, event.disposition, modelUsage.usage);
    }
    case 'REPAIR': {
      if (event.kind !== 'REPAIR_READY') return rejectEvent(snapshot);
      if (snapshot.usage.repairAttempts >= snapshot.config.maxRepairAttempts) {
        return terminate(
          snapshot,
          'BUDGET_EXHAUSTED',
          'LOCAL_REPAIR_LIMIT',
          frame.nowEpochMs,
          event.evidenceReference,
        );
      }
      const modelUsage = modelUsageOrLimit(snapshot, frame, event);
      if ('result' in modelUsage) return modelUsage.result;
      const usage = {
        ...modelUsage.usage,
        repairAttempts: snapshot.usage.repairAttempts + 1,
      };
      return dispositionResult(snapshot, frame, event, event.disposition, usage);
    }
    case 'VALIDATE': {
      if (event.kind !== 'VALIDATION_READY') return rejectEvent(snapshot);
      switch (event.outcome) {
        case 'PASS':
          return terminate(
            snapshot,
            'COMPLETED',
            'VALIDATION_PASSED',
            frame.nowEpochMs,
            event.evidenceReference,
          );
        case 'REPAIR':
          if (snapshot.usage.iterations >= snapshot.config.maxIterations) {
            return terminate(
              snapshot,
              'BUDGET_EXHAUSTED',
              'LOCAL_ITERATION_LIMIT',
              frame.nowEpochMs,
              event.evidenceReference,
            );
          }
          return advanced(snapshot, 'REPAIR', event, frame, {
            ...snapshot.usage,
            iterations: snapshot.usage.iterations + 1,
          });
        case 'ABSTAIN':
          return terminate(
            snapshot,
            'ABSTAINED',
            'ABSTAINED_BY_STEP',
            frame.nowEpochMs,
            event.evidenceReference,
          );
        case 'ESCALATE':
          return terminate(
            snapshot,
            'ESCALATED',
            'ESCALATED_BY_STEP',
            frame.nowEpochMs,
            event.evidenceReference,
          );
        case 'FAIL':
          return terminate(
            snapshot,
            'FAILED',
            'FAILED_BY_STEP',
            frame.nowEpochMs,
            event.evidenceReference,
          );
      }
    }
    default:
      return rejectEvent(snapshot);
  }
}
