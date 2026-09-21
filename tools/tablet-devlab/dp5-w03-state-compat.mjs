export function executionStateCompatible(seed, attempt, containment) {
  if (attempt === null || containment === null) return false;
  const expectedQuota = seed.quota ?? null;
  const actualQuota = attempt.quota ?? null;
  return (
    attempt.tenantId === seed.tenantId &&
    attempt.actionIntentId === seed.actionIntentId &&
    attempt.executionRef === seed.executionRef &&
    attempt.attemptNumber === seed.attemptNumber &&
    attempt.maxAttempts === seed.maxAttempts &&
    JSON.stringify(actualQuota) === JSON.stringify(expectedQuota) &&
    containment.tenantId === seed.tenantId &&
    containment.circuitKey === seed.circuitKey &&
    containment.authorizesExecution === false &&
    containment.snapshot.circuit.state === seed.containment.circuit.state &&
    containment.snapshot.circuit.consecutiveFailures ===
      seed.containment.circuit.consecutiveFailures &&
    containment.snapshot.circuit.halfOpenProbeInFlight ===
      seed.containment.circuit.halfOpenProbeInFlight &&
    containment.snapshot.killSwitch.state === seed.containment.killSwitch.state &&
    containment.snapshot.dependencyHealth === seed.containment.dependencyHealth &&
    containment.snapshot.cancellationRequested === seed.containment.cancellationRequested &&
    containment.snapshot.currentInFlight === seed.containment.currentInFlight &&
    containment.snapshot.maxInFlight === seed.containment.maxInFlight &&
    containment.snapshot.retryDepth === seed.containment.retryDepth &&
    containment.snapshot.maxRetryDepth === seed.containment.maxRetryDepth
  );
}
