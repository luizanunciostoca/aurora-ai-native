const SPECS = [
  [
    'DP5-LIFE-001',
    'lifecycleAndProcessRestart.coldLaunchFromStoppedProcess',
    'Cold launch from stopped process',
    'Launch Aurora from a force-stopped state',
    'Observe the cold launch and first usable governed state',
  ],
  [
    'DP5-LIFE-002',
    'lifecycleAndProcessRestart.foregroundBackgroundForeground',
    'Foreground/background/foreground lifecycle',
    'Move Aurora foreground -> background -> foreground',
    'Use Home/recents and observe safe resume',
  ],
  [
    'DP5-LIFE-003',
    'lifecycleAndProcessRestart.forcedProcessStopAndRelaunch',
    'Forced process stop and relaunch',
    'Force-stop Aurora and relaunch',
    'Observe safe re-arm after relaunch',
  ],
  [
    'DP5-LIFE-004',
    'lifecycleAndProcessRestart.processDeathWithSafeDeferredWork',
    'Process death with safe deferred work',
    'Prepare safe deferred work, kill process, relaunch',
    'Trigger only the approved deferred condition',
  ],
  [
    'DP5-LIFE-005',
    'lifecycleAndProcessRestart.processDeathAfterNativeDispatchBoundaryReconciliationOnly',
    'Post-dispatch process death is reconciliation-only',
    'Cross native dispatch boundary, kill process, recover',
    'Perform the bounded physical action when instructed',
  ],

  [
    'DP5-ID-001',
    'deviceIdentityRegistrationAndSession.keystoreRegistrationOverRealSameSocketGateway',
    'Keystore registration over real same-socket gateway',
    'Perform fresh governed registration through the live LOCAL host',
    'Complete the on-device bootstrap/registration gesture',
  ],
  [
    'DP5-ID-002',
    'deviceIdentityRegistrationAndSession.sessionBoundToCurrentDeviceRef',
    'Session bound to current DeviceRef',
    'Open/currentize a governed session and capture DeviceRef binding',
    'Observe current session/device state',
  ],
  [
    'DP5-ID-003',
    'deviceIdentityRegistrationAndSession.freshSocketReconnectAndSessionResume',
    'Fresh socket reconnect and session resume',
    'Reconnect through the governed path',
    'Toggle the instructed connection condition if required',
  ],
  [
    'DP5-ID-004',
    'deviceIdentityRegistrationAndSession.sessionRotation',
    'Session rotation',
    'Invoke bounded SESSION_ROTATE and re-authenticate',
    'Observe app/session state after rotation',
  ],
  [
    'DP5-ID-005',
    'deviceIdentityRegistrationAndSession.expiredSessionRejected',
    'Expired session rejected',
    'Exercise an expired session against the live host',
    'Observe fail-closed rejection',
  ],
  [
    'DP5-ID-006',
    'deviceIdentityRegistrationAndSession.revokedSessionRejected',
    'Revoked session rejected',
    'Invoke SESSION_REVOKE then exercise the revoked session',
    'Observe fail-closed rejection',
  ],
  [
    'DP5-ID-007',
    'deviceIdentityRegistrationAndSession.compromisedReinstalledKeyInvalidatedRecovery',
    'Reinstalled/invalidated key recovery',
    'Exercise governed reinstall/key invalidation recovery',
    'Perform reinstall/data-boundary step only if the runbook explicitly requires it',
  ],
  [
    'DP5-ID-008',
    'deviceIdentityRegistrationAndSession.staleRegistrationOrSessionFailsClosed',
    'Stale registration/session fails closed',
    'Present stale registration/session state',
    'Observe zero unauthorized dispatch',
  ],
  [
    'DP5-ID-009',
    'deviceIdentityRegistrationAndSession.clientAuthorityFieldsAbsentOrRejected',
    'Client authority fields absent/rejected',
    'Exercise prohibited client-authority field injection',
    'Observe rejection without minted authority',
  ],

  [
    'DP5-CAP-001',
    'capabilityAndPermissionPreconditions.freshSupportedCapabilityAvailable',
    'Fresh supported capability available',
    'Read and exercise a current supported capability',
    'Observe the supported path',
  ],
  [
    'DP5-CAP-002',
    'capabilityAndPermissionPreconditions.staleCapabilityFailsClosed',
    'Stale capability fails closed',
    'Invoke CAPABILITY_STALE then evaluate the path',
    'Observe fail-closed stale handling',
  ],
  [
    'DP5-CAP-003',
    'capabilityAndPermissionPreconditions.runtimePermissionDenied',
    'Runtime permission denied',
    'Revoke required runtime permission and exercise the path',
    'Respond to Android permission UI if shown',
  ],
  [
    'DP5-CAP-004',
    'capabilityAndPermissionPreconditions.permissionRevokedAfterGrant',
    'Permission revoked after grant',
    'Grant then revoke permission after readiness',
    'Change Android permission when instructed',
  ],
  [
    'DP5-CAP-005',
    'capabilityAndPermissionPreconditions.backgroundRestrictionApplied',
    'Background restriction applied',
    'Apply bounded background restriction then exercise the path',
    'Apply/observe Android background restriction',
  ],
  [
    'DP5-CAP-006',
    'capabilityAndPermissionPreconditions.permissionNeverGrantsAuroraAuthority',
    'Permission never grants Aurora authority',
    'Grant permission while W02/W07 authority remains absent',
    'Grant the requested Android permission',
  ],

  [
    'DP5-APP-001',
    'installedAppIntegration.expectedPackagePresent',
    'Expected package present',
    'Resolve validated target package/signature state',
    'Observe package presence/readback',
  ],
  [
    'DP5-APP-002',
    'installedAppIntegration.appMissing',
    'Target app missing',
    'Exercise the governed missing-app path',
    'Make the test target unavailable only through the approved runbook',
  ],
  [
    'DP5-APP-003',
    'installedAppIntegration.wrongOrReplacedPackageSignatureMismatch',
    'Wrong/replaced package signature mismatch',
    'Exercise approved package identity mismatch fixture/state',
    'Observe integration block',
  ],
  [
    'DP5-APP-004',
    'installedAppIntegration.invalidOrUntrustedIntentDeepLink',
    'Invalid/untrusted Intent or deep link',
    'Submit approved invalid/untrusted target input',
    'Observe rejection before external action',
  ],
  [
    'DP5-APP-005',
    'installedAppIntegration.supportedGovernedLaunchOrAction',
    'Supported governed launch/action',
    'Execute approved bounded app launch/action',
    'Observe the external app/UI result',
  ],
  [
    'DP5-APP-006',
    'installedAppIntegration.osAppReadbackEvidence',
    'OS/app readback evidence',
    'Capture Android package/activity readback after governed action',
    'Observe external UI/readback',
  ],

  [
    'DP5-EXEC-001',
    'governedNativeExecution.currentDeviceAuthorizationDispatchesExactlyOnce',
    'Current authorization dispatches exactly once',
    'Execute the one bounded authorized native effect',
    'Provide fresh interactive bounded-effect consent and observe the effect',
  ],
  [
    'DP5-EXEC-002',
    'governedNativeExecution.missingOrStaleAuthorityBlocksDispatch',
    'Missing/stale authority blocks dispatch',
    'Remove/stale current authority then submit command',
    'Observe zero native side effect',
  ],
  [
    'DP5-EXEC-003',
    'governedNativeExecution.killSwitchBeforeDispatchBlocks',
    'Kill switch before dispatch blocks',
    'Enable containment/kill before dispatch then submit command',
    'Observe zero native side effect',
  ],
  [
    'DP5-EXEC-004',
    'governedNativeExecution.cancellationBeforeDispatchBlocks',
    'Cancellation before dispatch blocks',
    'Cancel command before dispatch boundary',
    'Observe zero native side effect',
  ],
  [
    'DP5-EXEC-005',
    'governedNativeExecution.cancelKillRaceAfterDispatchIsUncertain',
    'Post-dispatch cancel/kill race is uncertain',
    'Trigger approved post-dispatch cancel/kill race',
    'Perform the instructed timing-sensitive control',
  ],
  [
    'DP5-EXEC-006',
    'governedNativeExecution.ambiguousNativeResultIsUncertain',
    'Ambiguous native result is uncertain',
    'Exercise approved ambiguous native-result path',
    'Observe uncertainty rather than success',
  ],
  [
    'DP5-EXEC-007',
    'governedNativeExecution.verifiedOutcomeProducesEvidenceWithoutRetryAuthority',
    'Verified outcome produces evidence without retry authority',
    'Complete verified bounded outcome and inspect Receipt/Evidence',
    'Observe bounded effect/readback',
  ],

  [
    'DP5-OFF-001',
    'offlineReconnectDedupeAndLateEvidence.prolongedOfflineSafeDeferredOnly',
    'Prolonged offline permits safe deferred work only',
    'Prepare bounded offline state and disconnect network',
    'Disable/re-enable instructed network connection',
  ],
  [
    'DP5-OFF-002',
    'offlineReconnectDedupeAndLateEvidence.freshSocketReconnectPreservesPreviousConnectionEvidence',
    'Fresh reconnect preserves prior connection evidence',
    'Disconnect/reconnect and compare connection generations',
    'Toggle instructed network connection',
  ],
  [
    'DP5-OFF-003',
    'offlineReconnectDedupeAndLateEvidence.duplicateCommandIdempotencyAcrossReconnect',
    'Duplicate command idempotency across reconnect',
    'Exercise same command identity across reconnect',
    'Toggle network when instructed',
  ],
  [
    'DP5-OFF-004',
    'offlineReconnectDedupeAndLateEvidence.processRestartWithQueuedWork',
    'Process restart with queued work',
    'Prepare safe queued work, restart process, inspect durable state',
    'Relaunch after instructed process stop',
  ],
  [
    'DP5-OFF-005',
    'offlineReconnectDedupeAndLateEvidence.staleOrExpiredAuthorityDoesNotReplay',
    'Stale/expired authority does not replay',
    'Make queued authority stale/expired before drain',
    'Observe no replay',
  ],
  [
    'DP5-OFF-006',
    'offlineReconnectDedupeAndLateEvidence.w03InflightOrUncertainIsReconciliationOnly',
    'W03 inflight/uncertain is reconciliation-only',
    'Exercise approved inflight/uncertain durable state',
    'Observe reconciliation without redispatch',
  ],
  [
    'DP5-OFF-007',
    'offlineReconnectDedupeAndLateEvidence.lateReceiptBoundToPriorConnectionGeneration',
    'Late receipt bound to prior connection generation',
    'Observe approved late receipt after new generation exists',
    'Observe original connection binding',
  ],
  [
    'DP5-OFF-008',
    'offlineReconnectDedupeAndLateEvidence.crashFencedReconciliationRequiredDoesNotAutoDispatch',
    'Crash-fenced reconciliation does not auto-dispatch',
    'Exercise crash-fenced reconciliation-required state',
    'Perform instructed process interruption',
  ],
  [
    'DP5-OFF-009',
    'offlineReconnectDedupeAndLateEvidence.postWriteTransportLossIsUncertainNoAutoRetry',
    'Post-write transport loss is uncertain/no auto-retry',
    'Induce approved loss after request-write boundary',
    'Drop connectivity at the instructed moment',
  ],

  [
    'DP5-VOICE-001',
    'voiceAndPresence.validDeterministicCommonCommand',
    'Valid deterministic common voice command',
    'Speak approved deterministic command after wake',
    'Say approved wake phrase/command at instructed distance/volume',
  ],
  [
    'DP5-VOICE-002',
    'voiceAndPresence.falseWakeDoesNotDispatch',
    'False wake does not dispatch',
    'Run negative/noise/passive wake observation',
    'Provide instructed non-wake speech/noise/environment',
  ],
  [
    'DP5-VOICE-003',
    'voiceAndPresence.ambiguousTranscriptEscalates',
    'Ambiguous transcript escalates',
    'Speak approved ambiguous phrase',
    'Say ambiguous phrase exactly as instructed',
  ],
  [
    'DP5-VOICE-004',
    'voiceAndPresence.lifecyclePrivacyRestrictionBlocksFastPath',
    'Lifecycle/privacy restriction blocks fast path',
    'Apply privacy/lifecycle restriction then attempt voice path',
    'Toggle microphone privacy/lifecycle condition',
  ],
  [
    'DP5-VOICE-005',
    'voiceAndPresence.permissionCapabilityDenialBlocksFastPath',
    'Permission/capability denial blocks fast path',
    'Deny required permission/capability then attempt voice path',
    'Deny requested permission/capability',
  ],
  [
    'DP5-VOICE-006',
    'voiceAndPresence.confidenceNeverBecomesAuthority',
    'Confidence never becomes authority',
    'Exercise high-confidence wake/transcript without W02/W07 authorization',
    'Speak approved phrase clearly',
  ],
];

const policy = (path) => {
  const category = path.split('.')[0];
  const common = {
    preconditions: [
      'Exact Control Tower/APK/device/host tuple is bound',
      'Representative physical tablet is the only authorized self-ADB target',
    ],
    setup: ['Capture automated baseline before the physical action'],
    expectedResult:
      'Observed physical behavior matches the governed W15-J contract without turning local/device signals into authority.',
    expectedSignals: ['No crash/ANR', 'Evidence remains bound to the exact campaign tuple'],
    forbiddenSignals: [
      'Local confidence/permission/trust becomes W02/W07 authority',
      'Automatic unsafe retry',
    ],
    timeoutMs: category === 'offlineReconnectDedupeAndLateEvidence' ? 300000 : 120000,
    telemetryRequirements: [
      'UTC timestamp',
      'monotonic elapsed timing',
      'filtered/redacted logcat',
      'process/service state',
      'network/device/resource snapshots',
    ],
    requiredLogs: [
      'scenario-receipt.json',
      'logcat.txt',
      'device-state.txt',
      'service-state.txt',
      'scenario-manifest.sha256',
    ],
    cleanup: [
      'Restore only state intentionally changed by this scenario',
      'Capture post-cleanup state',
    ],
    retryPolicy:
      'A retry is a new preserved attempt and requires explicit operator/runbook action; transport/device state never grants retry authority.',
  };
  if (
    category === 'governedNativeExecution' ||
    category === 'offlineReconnectDedupeAndLateEvidence'
  )
    common.expectedSignals.push('Receipt/reconciliation identity remains unambiguous');
  return common;
};

export const DP5_SCENARIOS = Object.freeze(
  SPECS.map(([id, path, name, action, manualAction]) => {
    const p = policy(path);
    const screenshotEvidence =
      path.includes('supportedGovernedLaunchOrAction') || path.includes('osAppReadbackEvidence')
        ? 'REQUIRED'
        : path.includes('coldLaunch') || path.includes('validDeterministicCommonCommand')
          ? 'RECOMMENDED'
          : 'OPTIONAL';
    return Object.freeze({
      id,
      path,
      name,
      category: path.split('.')[0],
      apkVersion: 'BOUND_AT_CAMPAIGN_INIT',
      commitSha: 'BOUND_AT_CAMPAIGN_INIT',
      deviceIdentity: 'BOUND_AT_CAMPAIGN_INIT',
      preconditions: p.preconditions,
      setup: p.setup,
      actions: [action],
      expectedResult: p.expectedResult,
      expectedSignals: p.expectedSignals,
      forbiddenSignals: p.forbiddenSignals,
      timeoutMs: p.timeoutMs,
      telemetryRequirements: p.telemetryRequirements,
      requiredLogs: p.requiredLogs,
      screenshotEvidence,
      receiptsRequired:
        path.startsWith('governedNativeExecution.') ||
        path.startsWith('offlineReconnectDedupeAndLateEvidence.'),
      timestampsRequired: true,
      monotonicTimingRequired: true,
      initialStatus: 'NOT_RUN',
      failureCause: null,
      artifactLinks: [],
      cleanup: p.cleanup,
      retryPolicy: p.retryPolicy,
      manualActions: [manualAction],
      automationCollectors: [
        'logcat',
        'process',
        'service',
        'package',
        'appops',
        'network',
        'host-instance',
        'cpu',
        'memory',
        'battery',
        'thermal',
      ],
      humanVerdictRequired: true,
    });
  }),
);

export const DP5_SCENARIO_BY_ID = Object.freeze(
  Object.fromEntries(DP5_SCENARIOS.map((scenario) => [scenario.id, scenario])),
);
export const DP5_SCENARIO_BY_PATH = Object.freeze(
  Object.fromEntries(DP5_SCENARIOS.map((scenario) => [scenario.path, scenario])),
);

if (DP5_SCENARIOS.length !== 48) throw new Error('DP5 catalog must contain exactly 48 scenarios');
if (new Set(DP5_SCENARIOS.map((scenario) => scenario.id)).size !== 48)
  throw new Error('DP5 scenario IDs must be unique');
if (new Set(DP5_SCENARIOS.map((scenario) => scenario.path)).size !== 48)
  throw new Error('DP5 scenario paths must be unique');
