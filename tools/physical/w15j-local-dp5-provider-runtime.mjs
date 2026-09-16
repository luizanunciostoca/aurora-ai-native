import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

const MATERIAL_KIND = 'W15J_LOCAL_DP5_OPERATOR_MATERIAL';
const SCHEMA_VERSION = '1.0.0';
const CAPABILITY_ID = 'audio.volume.set';
const ACTION_ID = 'AUDIO_VOLUME_STEP_UP';
const APP_CAPABILITY_ID = 'app.open';
const APP_ACTION_ID = 'OPEN_VALIDATED_APP';
const APP_POLICY_SCOPE = 'app.open';
const APP_ROUTE_ACTION = 'android.intent.action.MAIN';
const POLICY_ACTION = ACTION_ID;
const POLICY_SCOPE = 'audio.volume.set';
const POLICY_REFERENCE = 'policy:aurora:w15j:local-dp5';
const POLICY_VERSION = '1.0.0';
const PURPOSE_ID = 'local-device-control';
const JURISDICTION = 'BR-BA';
const DATA_CLASSIFICATION = 'INTERNAL';
const SAFEGUARD_MAX_AGE_MS = 30 * 60_000;
const MAX_MATERIAL_AGE_MS = 5 * 60_000;
const MAX_MATERIAL_LIFETIME_MS = 2 * 60 * 60_000;

const IDS = Object.freeze({
  tenantId: /^ten_[0-9A-HJKMNP-TV-Z]{26}$/u,
  identityId: /^idn_[0-9A-HJKMNP-TV-Z]{26}$/u,
  correlationId: /^cor_[0-9A-HJKMNP-TV-Z]{26}$/u,
  deviceId: /^dvc_[0-9A-HJKMNP-TV-Z]{26}$/u,
  actionIntentId: /^act_[0-9A-HJKMNP-TV-Z]{26}$/u,
  commandId: /^cmd_[0-9A-HJKMNP-TV-Z]{26}$/u,
  executionId: /^exe_[0-9A-HJKMNP-TV-Z]{26}$/u,
  causationId: /^cau_[0-9A-HJKMNP-TV-Z]{26}$/u,
  policyTokenId: /^ptk_[0-9A-HJKMNP-TV-Z]{26}$/u,
});
const SAFE_TOKEN = /^[A-Za-z0-9._:/+-]+$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const PACKAGE_NAME = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/u;
const APP_ACTION_KEYS = new Set([
  'actionIntentId',
  'commandId',
  'executionId',
  'causationId',
  'policyTokenId',
  'idempotencyKey',
  'orderingKey',
  'orderingSequence',
  'circuitKey',
  'appId',
  'packageName',
  'trustedSignerSha256',
]);
const MATERIAL_KEYS = new Set([
  'kind',
  'schemaVersion',
  'generatedAt',
  'expiresAt',
  'tenantId',
  'actorIdentityId',
  'subjectIdentityId',
  'correlationId',
  'deviceId',
  'deviceSessionId',
  'actionIntentId',
  'commandId',
  'executionId',
  'causationId',
  'policyTokenId',
  'idempotencyKey',
  'orderingKey',
  'orderingSequence',
  'circuitKey',
  'appAction',
  'operatorApprovalReference',
  'authorizesExecution',
  'canGrantPermission',
]);

function plainRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, expected) {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function timestamp(value) {
  if (typeof value !== 'string' || value.length > 64) return null;
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed)) return null;
  return new Date(parsed).toISOString() === value ? parsed : null;
}

function safeToken(value, maximum = 256) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    SAFE_TOKEN.test(value)
  );
}

function validAppAction(value) {
  return (
    plainRecord(value) &&
    exactKeys(value, APP_ACTION_KEYS) &&
    IDS.actionIntentId.test(value.actionIntentId) &&
    IDS.commandId.test(value.commandId) &&
    IDS.executionId.test(value.executionId) &&
    IDS.causationId.test(value.causationId) &&
    IDS.policyTokenId.test(value.policyTokenId) &&
    safeToken(value.idempotencyKey, 256) &&
    safeToken(value.orderingKey, 256) &&
    Number.isSafeInteger(value.orderingSequence) &&
    value.orderingSequence > 0 &&
    safeToken(value.circuitKey, 180) &&
    safeToken(value.appId, 128) &&
    PACKAGE_NAME.test(value.packageName) &&
    SHA256.test(value.trustedSignerSha256)
  );
}

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

function inspectMaterialFile(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path) {
    throw new Error('DP5 material path must be absolute.');
  }
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile() || realpathSync(path) !== path) {
    throw new Error('DP5 material file is not a direct regular file.');
  }
  if ((metadata.mode & 0o077) !== 0)
    throw new Error('DP5 material must not be group/other accessible.');
  if (typeof process.getuid === 'function' && metadata.uid !== process.getuid()) {
    throw new Error('DP5 material must be owned by the current operator uid.');
  }
  if (statSync(path).size <= 0 || statSync(path).size > 64 * 1024) {
    throw new Error('DP5 material size is invalid.');
  }
}

export function loadAndValidateW15JDp5Material(path, nowMs = Date.now()) {
  inspectMaterialFile(path);
  let material;
  try {
    material = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error('DP5 material JSON is invalid.');
  }
  if (!plainRecord(material) || !exactKeys(material, MATERIAL_KEYS)) {
    throw new Error('DP5 material schema is invalid.');
  }
  const generatedAtMs = timestamp(material.generatedAt);
  const expiresAtMs = timestamp(material.expiresAt);
  if (
    material.kind !== MATERIAL_KIND ||
    material.schemaVersion !== SCHEMA_VERSION ||
    generatedAtMs === null ||
    expiresAtMs === null ||
    !Number.isSafeInteger(nowMs) ||
    generatedAtMs > nowMs ||
    nowMs - generatedAtMs > MAX_MATERIAL_AGE_MS ||
    expiresAtMs <= nowMs ||
    expiresAtMs - generatedAtMs > MAX_MATERIAL_LIFETIME_MS ||
    !IDS.tenantId.test(material.tenantId) ||
    !IDS.identityId.test(material.actorIdentityId) ||
    !IDS.identityId.test(material.subjectIdentityId) ||
    !IDS.correlationId.test(material.correlationId) ||
    !IDS.deviceId.test(material.deviceId) ||
    !safeToken(material.deviceSessionId, 128) ||
    !IDS.actionIntentId.test(material.actionIntentId) ||
    !IDS.commandId.test(material.commandId) ||
    !IDS.executionId.test(material.executionId) ||
    !IDS.causationId.test(material.causationId) ||
    !IDS.policyTokenId.test(material.policyTokenId) ||
    !safeToken(material.idempotencyKey, 256) ||
    !safeToken(material.orderingKey, 256) ||
    !Number.isSafeInteger(material.orderingSequence) ||
    material.orderingSequence <= 0 ||
    !safeToken(material.circuitKey, 180) ||
    !validAppAction(material.appAction) ||
    !safeToken(material.operatorApprovalReference, 256) ||
    material.authorizesExecution !== false ||
    material.canGrantPermission !== false
  ) {
    throw new Error('DP5 material bindings are invalid or stale.');
  }
  return Object.freeze({ ...material, generatedAtMs, expiresAtMs });
}

function buildPolicySnapshot(material) {
  const rule = (ruleId, action, scope, reasonReference) =>
    Object.freeze({
      ruleId,
      effect: 'ALLOW',
      action,
      scope: Object.freeze([scope]),
      tenantIds: Object.freeze([material.tenantId]),
      actorKinds: Object.freeze(['HUMAN']),
      actorIdentityIds: Object.freeze([material.actorIdentityId]),
      subjectReferences: Object.freeze([`identity:${material.subjectIdentityId}`]),
      purposeIds: Object.freeze([PURPOSE_ID]),
      jurisdictions: Object.freeze([JURISDICTION]),
      dataClassifications: Object.freeze([DATA_CLASSIFICATION]),
      reasonReference,
    });
  return Object.freeze({
    kind: 'PolicySnapshot',
    policy: Object.freeze({ reference: POLICY_REFERENCE, version: POLICY_VERSION }),
    state: 'ACTIVE',
    rules: Object.freeze([
      rule(
        'rule.w15j.local.volume-step',
        POLICY_ACTION,
        POLICY_SCOPE,
        'policy:aurora:w15j:local-dp5#bounded-volume-step',
      ),
      rule(
        'rule.w15j.local.aurora-self-launch',
        APP_ACTION_ID,
        APP_POLICY_SCOPE,
        'policy:aurora:w15j:local-dp5#aurora-self-launch',
      ),
    ]),
  });
}

function buildPolicyToken(material, kind) {
  const app = kind === 'app';
  const source = app ? material.appAction : material;
  return Object.freeze({
    kind: 'POLICY_TOKEN',
    schemaVersion: SCHEMA_VERSION,
    policyTokenId: source.policyTokenId,
    tenant: Object.freeze({ tenantId: material.tenantId }),
    subject: Object.freeze({ reference: `identity:${material.subjectIdentityId}` }),
    action: app ? APP_ACTION_ID : POLICY_ACTION,
    scope: Object.freeze([app ? APP_POLICY_SCOPE : POLICY_SCOPE]),
    issuedAt: material.generatedAt,
    expiresAt: material.expiresAt,
    policy: Object.freeze({ reference: POLICY_REFERENCE, version: POLICY_VERSION }),
    authorityClass: 'POLICY_RULE',
    correlation: Object.freeze({ correlationId: material.correlationId }),
  });
}

function buildActionIntent(material, kind) {
  const app = kind === 'app';
  const source = app ? material.appAction : material;
  return Object.freeze({
    kind: 'ACTION_INTENT',
    schemaVersion: SCHEMA_VERSION,
    actionIntentId: source.actionIntentId,
    capability: Object.freeze({
      capability: app ? APP_CAPABILITY_ID : CAPABILITY_ID,
      actionType: app ? APP_ACTION_ID : ACTION_ID,
    }),
    executionTarget: Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      kind: 'DEVICE',
      bindingReference: material.deviceId,
    }),
    tenant: Object.freeze({ tenantId: material.tenantId }),
    actor: Object.freeze({ kind: 'HUMAN', identityId: material.actorIdentityId }),
    requestOrigin: Object.freeze({ kind: 'HUMAN', identityId: material.actorIdentityId }),
    correlation: Object.freeze({ correlationId: material.correlationId }),
    resolvedParameters: Object.freeze(app ? { appId: source.appId } : {}),
    idempotency: Object.freeze({ mode: 'REQUIRED', key: source.idempotencyKey }),
    preconditions: Object.freeze([]),
    deadlineAt: material.expiresAt,
    authority: Object.freeze({ kind: 'POLICY_TOKEN', policyTokenId: source.policyTokenId }),
    dataClassification: DATA_CLASSIFICATION,
  });
}

function buildPolicyEvaluationSeed(material, policyToken, kind) {
  const app = kind === 'app';
  return Object.freeze({
    kind: 'PolicyEvaluationRequest',
    schemaVersion: SCHEMA_VERSION,
    correlation: Object.freeze({ correlationId: material.correlationId }),
    tenant: Object.freeze({ tenantId: material.tenantId }),
    tenantBoundary: Object.freeze({
      status: 'WITHIN_BOUNDARY',
      reason: 'BOUNDARY_CONFIRMED',
      correlationId: material.correlationId,
      evidence: Object.freeze({
        evaluatedTenantId: material.tenantId,
        actorIdentityId: material.actorIdentityId,
        matchedBindingCount: 1,
        observedBindingTenantIds: Object.freeze([material.tenantId]),
      }),
    }),
    actor: Object.freeze({ kind: 'HUMAN', identityId: material.actorIdentityId }),
    subject: Object.freeze({ kind: 'IDENTITY', identityId: material.subjectIdentityId }),
    action: app ? APP_ACTION_ID : POLICY_ACTION,
    requestedScope: Object.freeze([app ? APP_POLICY_SCOPE : POLICY_SCOPE]),
    purpose: Object.freeze({
      kind: 'PurposeContext',
      purposeId: PURPOSE_ID,
      version: SCHEMA_VERSION,
      status: 'ACTIVE',
      allowedDataClassifications: Object.freeze([DATA_CLASSIFICATION]),
    }),
    jurisdiction: Object.freeze({
      kind: 'JurisdictionContext',
      jurisdiction: JURISDICTION,
      version: SCHEMA_VERSION,
    }),
    dataClassification: DATA_CLASSIFICATION,
    policyToken,
  });
}

function buildProjection(material) {
  const registryProjection = [
    {
      capabilityId: CAPABILITY_ID,
      targetKind: 'DEVICE',
      actionId: ACTION_ID,
      boundedEffect: 'ONE_MEDIA_VOLUME_STEP_UP',
    },
    {
      capabilityId: APP_CAPABILITY_ID,
      targetKind: 'DEVICE',
      actionId: APP_ACTION_ID,
      boundedEffect: 'AURORA_SELF_LAUNCH',
    },
  ];
  const vocabularyProjection = [
    {
      commandId: material.commandId,
      phrases: ['aumentar volume', 'aumente o volume', 'subir volume'],
      capabilityId: CAPABILITY_ID,
    },
    {
      commandId: material.appAction.commandId,
      phrases: ['abrir aurora', 'abra a aurora'],
      capabilityId: APP_CAPABILITY_ID,
    },
  ];
  const entry = (capabilityId, riskClass = 'LOW') =>
    Object.freeze({
      capabilityId,
      tenantId: material.tenantId,
      supportedTargetKinds: Object.freeze(['DEVICE']),
      currentAvailability: 'CURRENT_AVAILABLE',
      riskClass,
      observedAtMs: material.generatedAtMs,
      expiresAtMs: material.expiresAtMs,
    });
  return Object.freeze({
    kind: 'GOVERNED_VOICE_PROJECTION',
    activeTenantId: material.tenantId,
    registry: Object.freeze({
      registryKind: 'AURORA_CANONICAL_CAPABILITY_REGISTRY',
      registryVersion: 'w04-dp5-1.1.0',
      observedAtMs: material.generatedAtMs,
      expiresAtMs: material.expiresAtMs,
      provenance: Object.freeze({
        sourceRef: 'w04:accepted:dp5-bounded-device-actions-v2',
        contentSha256: sha256Hex(canonicalJson(registryProjection)),
      }),
      entries: Object.freeze([entry(CAPABILITY_ID), entry(APP_CAPABILITY_ID)]),
    }),
    vocabulary: Object.freeze({
      vocabularyVersion: 'w15g-dp5-1.1.0',
      observedAtMs: material.generatedAtMs,
      expiresAtMs: material.expiresAtMs,
      provenance: Object.freeze({
        sourceRef: 'w15g:dp5:bounded-device-actions-v2',
        contentSha256: sha256Hex(canonicalJson(vocabularyProjection)),
      }),
      bindings: Object.freeze(
        vocabularyProjection.map((item) =>
          Object.freeze({ ...item, phrases: Object.freeze(item.phrases) }),
        ),
      ),
    }),
    nativeBindings: Object.freeze([
      Object.freeze({
        capabilityId: CAPABILITY_ID,
        minApiLevel: 26,
        requiredFeatures: Object.freeze([]),
        requiredPermissions: Object.freeze([]),
        maxSnapshotAgeMs: 30_000,
      }),
      Object.freeze({
        capabilityId: APP_CAPABILITY_ID,
        minApiLevel: 26,
        requiredFeatures: Object.freeze([]),
        requiredPermissions: Object.freeze([]),
        maxSnapshotAgeMs: 30_000,
      }),
    ]),
    appBindings: Object.freeze([
      Object.freeze({
        appId: material.appAction.appId,
        packageName: material.appAction.packageName,
        trustedSignerSha256: Object.freeze([material.appAction.trustedSignerSha256]),
        routes: Object.freeze([
          Object.freeze({
            routeId: 'aurora-main',
            kind: 'INTENT',
            action: APP_ROUTE_ACTION,
            supportsReadback: true,
          }),
        ]),
        maxSnapshotAgeMs: 30_000,
      }),
    ]),
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
}

function buildExecutionStateSeed(material, kind) {
  const source = kind === 'app' ? material.appAction : material;
  return Object.freeze({
    tenantId: material.tenantId,
    actionIntentId: source.actionIntentId,
    executionRef: source.executionId,
    attemptNumber: 1,
    maxAttempts: 1,
    quota: Object.freeze({ limit: 1, used: 0 }),
    circuitKey: source.circuitKey,
    containment: Object.freeze({
      circuit: Object.freeze({
        state: 'CLOSED',
        consecutiveFailures: 0,
        halfOpenProbeInFlight: false,
      }),
      killSwitch: Object.freeze({ state: 'INACTIVE', changedAt: material.generatedAt }),
      dependencyHealth: 'HEALTHY',
      cancellationRequested: false,
      currentInFlight: 0,
      maxInFlight: 1,
      retryDepth: 0,
      maxRetryDepth: 0,
    }),
    updatedAt: material.generatedAt,
    authorizesExecution: false,
  });
}

function buildPrincipal(material) {
  return Object.freeze({
    tenantId: material.tenantId,
    actor: Object.freeze({ kind: 'HUMAN', identityId: material.actorIdentityId }),
    correlationId: material.correlationId,
    deviceId: material.deviceId,
    deviceSessionId: material.deviceSessionId,
    authenticatedAtMs: material.generatedAtMs,
    authenticationExpiresAtMs: material.expiresAtMs,
    authenticationReference: material.operatorApprovalReference,
    authorizesExecution: false,
    canGrantPermission: false,
  });
}

export async function createW15JLocalDp5OperatorInput({ databaseUrl, materialPath }) {
  if (typeof databaseUrl !== 'string' || !/^postgres(?:ql)?:\/\//u.test(databaseUrl)) {
    throw new Error('AURORA_W15J_DATABASE_URL is missing or invalid.');
  }
  const material = loadAndValidateW15JDp5Material(materialPath);
  const [{ evaluateAuthority }, portsModule, authorityModule, projectionModule] = await Promise.all(
    [
      import('@aurora/policy-core/authority'),
      import('../../services/executors/dist/voice-intake/physical-host-ports.js'),
      import('../../services/executors/dist/voice-intake/preissued-authority-source.js'),
      import('../../services/mobile-gateway/dist/physical-host/voice-projection-intake-adapter.js'),
    ],
  );

  if (
    typeof evaluateAuthority !== 'function' ||
    typeof portsModule.createW15JDispatchingPhysicalHostW07Ports !== 'function' ||
    typeof authorityModule.PreissuedCurrentPolicyVoiceAuthoritySource !== 'function' ||
    typeof projectionModule.withCurrentVoiceProjection !== 'function'
  ) {
    throw new Error('Canonical W02/W07/W14 provider owners are unavailable.');
  }

  const policySnapshot = buildPolicySnapshot(material);
  const policyToken = buildPolicyToken(material, 'volume');
  const actionIntent = buildActionIntent(material, 'volume');
  const policyEvaluation = buildPolicyEvaluationSeed(material, policyToken, 'volume');
  const appPolicyToken = buildPolicyToken(material, 'app');
  const appActionIntent = buildActionIntent(material, 'app');
  const appPolicyEvaluation = buildPolicyEvaluationSeed(material, appPolicyToken, 'app');

  const currentPolicy = Object.freeze({
    getCurrent(request) {
      if (
        request?.policyReference !== POLICY_REFERENCE ||
        request?.tenantId !== material.tenantId ||
        request?.actorIdentityId !== material.actorIdentityId
      ) {
        return undefined;
      }
      return policySnapshot;
    },
  });
  const voiceAuthoritySource = new authorityModule.PreissuedCurrentPolicyVoiceAuthoritySource(
    [
      Object.freeze({
        commandId: material.commandId,
        capabilityId: CAPABILITY_ID,
        actionIntent,
        expectedPolicyReference: POLICY_REFERENCE,
        policyEvaluation,
        requireCorrelationMatch: true,
        authorizesExecution: false,
      }),
      Object.freeze({
        commandId: material.appAction.commandId,
        capabilityId: APP_CAPABILITY_ID,
        actionIntent: appActionIntent,
        expectedPolicyReference: POLICY_REFERENCE,
        policyEvaluation: appPolicyEvaluation,
        requireCorrelationMatch: true,
        authorizesExecution: false,
      }),
    ],
    currentPolicy,
  );

  const executionSpecs = Object.freeze([
    Object.freeze({ source: material, capabilityId: CAPABILITY_ID, actionIntent }),
    Object.freeze({
      source: material.appAction,
      capabilityId: APP_CAPABILITY_ID,
      actionIntent: appActionIntent,
    }),
  ]);
  const executionIdentities = Object.freeze(
    executionSpecs.map(({ source, capabilityId, actionIntent: intent }) =>
      Object.freeze({
        commandId: source.commandId,
        capabilityId,
        executionId: source.executionId,
        causationId: source.causationId,
        orderingKey: source.orderingKey,
        orderingSequence: source.orderingSequence,
        canonicalPayloadHash: `sha256:${sha256Hex(canonicalJson(intent))}`,
        authorizesExecution: false,
      }),
    ),
  );

  const deviceExecutionSource = Object.freeze({
    resolve(lookup) {
      const spec = executionSpecs.find(
        ({ source }) =>
          lookup?.commandId === source.commandId && lookup?.executionId === source.executionId,
      );
      if (spec === undefined) return null;
      return Object.freeze({
        commandId: spec.source.commandId,
        executionId: spec.source.executionId,
        actionIntent: spec.actionIntent,
        executor: Object.freeze({
          executor: 'aurora-android-w15j',
          instanceReference: material.deviceId,
        }),
        attempt: 1,
        attemptedAt: material.generatedAt,
        authorizesExecution: false,
      });
    },
  });
  const containmentCircuitKeys = Object.freeze({
    resolveCircuitKey(input) {
      if (input?.tenantId !== material.tenantId) return null;
      const spec = executionSpecs.find(
        ({ source }) => input?.actionIntent?.actionIntentId === source.actionIntentId,
      );
      return spec?.source.circuitKey ?? null;
    },
  });

  const w07 = portsModule.createW15JDispatchingPhysicalHostW07Ports({
    voiceAuthoritySource,
    validateCurrentAuthority: evaluateAuthority,
    deviceExecutionSource,
    executionIdentities,
    safeguardMaxAgeMs: SAFEGUARD_MAX_AGE_MS,
    containmentCircuitKeys,
    evaluatePrecondition: () => false,
  });

  const projection = buildProjection(material);
  const projectionSource = Object.freeze({
    current({ context, nowMs }) {
      if (
        !Number.isSafeInteger(nowMs) ||
        nowMs < material.generatedAtMs ||
        nowMs >= material.expiresAtMs ||
        context?.tenantId !== material.tenantId ||
        context?.actorIdentityId !== material.actorIdentityId ||
        context?.correlationId !== material.correlationId ||
        context?.deviceId !== material.deviceId ||
        context?.deviceSessionId !== material.deviceSessionId
      ) {
        return null;
      }
      return projection;
    },
  });

  const dependencies = Object.freeze({
    receiptEvidenceIngress: w07.receiptEvidenceIngress,
    createVoiceIntake: (...ports) =>
      projectionModule.withCurrentVoiceProjection(
        w07.createVoiceIntake(...ports),
        projectionSource,
      ),
    createContainmentLifecycle: w07.createContainmentLifecycle,
    createAttemptLifecycle: w07.createAttemptLifecycle,
  });

  return Object.freeze({
    databaseUrl,
    dependencies,
    principal: buildPrincipal(material),
    executionStateSeed: Object.freeze([
      buildExecutionStateSeed(material, 'volume'),
      buildExecutionStateSeed(material, 'app'),
    ]),
  });
}
