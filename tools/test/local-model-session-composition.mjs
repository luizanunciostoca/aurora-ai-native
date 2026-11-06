import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ReadableStream } from 'node:stream/web';
import { clearTimeout, setTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';

// Offline, one-tree composition proof. Run only after npm run build and
// tsc -p services/mobile-gateway/tsconfig.test.json in the same checked-out tree.
// W14 managers and W02/W05/W06 producers/consumers are real compiled modules.
// The retained legacy fault cases inject a synthetic preparation source; the
// separately labelled current-producer cases exercise the concrete new source.
// Authentication, attestation, upstream owner records/readers, source adapters,
// model health/manifest and transport remain explicit synthetic fixtures.
// Neither case class is physical/native proof or an authenticated data-owner store.
assert.equal(process.version, 'v22.16.0', 'use the pinned Node 22.16.0 runtime');
const arguments_ = process.argv.slice(2);
const allowDirtyPreparation = arguments_.includes('--allow-dirty-preparation');
const rootArguments = arguments_.filter((argument) => argument !== '--allow-dirty-preparation');
assert.ok(
  (rootArguments.length === 0 ||
    (rootArguments.length === 2 && rootArguments[0] === '--repo-root')) &&
    arguments_.filter((argument) => argument === '--allow-dirty-preparation').length <= 1,
  'usage: node tools/test/local-model-session-composition.mjs [--repo-root ROOT] [--allow-dirty-preparation]',
);
assert.ok(
  !allowDirtyPreparation || (process.env.CI !== 'true' && process.env.GITHUB_ACTIONS !== 'true'),
  'dirty preparation is forbidden in the CI proof',
);
const root =
  rootArguments.length === 2 ? resolve(rootArguments[1]) : resolve(import.meta.dirname, '../..');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sourceArtifacts = [
  [
    'packages/registries/src/strategies/registry.ts',
    'packages/registries/dist/strategies/registry.js',
  ],
  [
    'packages/registries/src/strategies/local-qwen-descriptor.ts',
    'packages/registries/dist/strategies/local-qwen-descriptor.js',
  ],
  ['packages/intelligence/src/router/router.ts', 'packages/intelligence/dist/router/router.js'],
  ['packages/context/src/retrieval/evaluate.ts', 'packages/context/dist/retrieval/evaluate.js'],
  [
    'packages/context/src/minimal-context/compile.ts',
    'packages/context/dist/minimal-context/compile.js',
  ],
  [
    'packages/context/src/minimal-context/model-prompt.ts',
    'packages/context/dist/minimal-context/model-prompt.js',
  ],
  [
    'packages/context/src/minimal-context/current-public-model-context.ts',
    'packages/context/dist/minimal-context/current-public-model-context.js',
  ],
  ['packages/context/src/query/validate.ts', 'packages/context/dist/query/validate.js'],
  ['packages/context/src/sources/acquire.ts', 'packages/context/dist/sources/acquire.js'],
  ['packages/contracts/src/consent/index.ts', 'packages/contracts/dist/consent/index.js'],
  ['packages/policy/src/index.ts', 'packages/policy/dist/packages/policy/src/index.js'],
  [
    'packages/policy/src/query/current-policy.ts',
    'packages/policy/dist/packages/policy/src/query/current-policy.js',
  ],
  [
    'packages/policy/src/query/precheck.ts',
    'packages/policy/dist/packages/policy/src/query/precheck.js',
  ],
  [
    'services/agent-runtime/src/runtime/public-local-model-bridge.ts',
    'services/agent-runtime/dist/runtime/public-local-model-bridge.js',
  ],
  [
    'services/agent-runtime/src/runtime/keyed-local-inference.ts',
    'services/agent-runtime/dist/runtime/keyed-local-inference.js',
  ],
  [
    'services/agent-runtime/src/runtime/local-inference.ts',
    'services/agent-runtime/dist/runtime/local-inference.js',
  ],
  [
    'services/agent-runtime/src/runtime/session-bound-local-model.ts',
    'services/agent-runtime/dist/runtime/session-bound-local-model.js',
  ],
  [
    'services/agent-runtime/src/runtime/current-local-model-preparation-source.ts',
    'services/agent-runtime/dist/runtime/current-local-model-preparation-source.js',
  ],
  [
    'services/mobile-gateway/src/gateway-auth/session-manager.ts',
    'services/mobile-gateway/dist-test/src/gateway-auth/session-manager.js',
  ],
  [
    'services/mobile-gateway/src/device/registry.ts',
    'services/mobile-gateway/dist-test/src/device/registry.js',
  ],
  [
    'services/mobile-gateway/src/device-session/session-trust.ts',
    'services/mobile-gateway/dist-test/src/device-session/session-trust.js',
  ],
  [
    'services/mobile-gateway/src/gateway-auth/local-model-session-admission.ts',
    'services/mobile-gateway/dist-test/src/gateway-auth/local-model-session-admission.js',
  ],
  [
    'services/mobile-gateway/src/gateway-auth/local-model-session-operation.ts',
    'services/mobile-gateway/dist-test/src/gateway-auth/local-model-session-operation.js',
  ],
];
const identities = sourceArtifacts.map(([source, artifact]) => ({
  source,
  sourceSha256: sha256(readFileSync(resolve(root, source))),
  artifact,
  artifactSha256: sha256(readFileSync(resolve(root, artifact))),
}));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const gitHeadTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const worktreeState = () => {
  const entries = execFileSync(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  // Explicit service test compilation produces the two service output trees;
  // packages/schemas test:compile canonically emits its tsconfig.test.json
  // outDir, dist-test, during npm test. Never exempt tracked changes, source
  // files or arbitrary untracked directories.
  const generated = entries.filter(
    (entry) =>
      entry.startsWith('?? ') &&
      /^(?:services\/(?:mobile-gateway|agent-runtime)|packages\/schemas)\/dist-test\//.test(
        entry.slice(3),
      ),
  );
  return {
    dirty: entries.some((entry) => !generated.includes(entry)),
    rawDirty: entries.length > 0,
    generatedUntrackedExclusions: generated.map((entry) => entry.slice(3)).sort(),
  };
};
const initialWorktree = worktreeState();
const worktreeDirty = initialWorktree.dirty;
if (!allowDirtyPreparation) {
  assert.equal(
    worktreeDirty,
    false,
    'exact-HEAD proof requires a clean tree; local dirty runs need explicit preparation mode',
  );
  for (const identity of identities) {
    assert.equal(
      sha256(execFileSync('git', ['show', `${head}:${identity.source}`], { cwd: root })),
      identity.sourceSha256,
      `source does not match HEAD: ${identity.source}`,
    );
  }
}

let unexpectedFetchCalls = 0;
const { Headers, Response } = globalThis;
globalThis.fetch = async () => {
  unexpectedFetchCalls += 1;
  throw new Error('NETWORK_FORBIDDEN_IN_OFFLINE_SESSION_COMPOSITION_PROOF');
};
const require = createRequire(import.meta.url);
const from = (path) => require(resolve(root, path));
const registryPublic = from('packages/registries/dist/strategies/index.js');
const { createStrategyRegistry, selectStrategy } = registryPublic;
const { createLocalQwenStrategyDescriptor } = from(
  'packages/registries/dist/strategies/local-qwen-descriptor.js',
);
const { routeIntelligence } = from('packages/intelligence/dist/router/router.js');
const { evaluateContextRetrieval } = from('packages/context/dist/retrieval/evaluate.js');
const { compileMinimalContext } = from('packages/context/dist/minimal-context/compile.js');
const { compilePublicLocalModelPrompt } = from(
  'packages/context/dist/minimal-context/model-prompt.js',
);
const { CurrentPublicModelContext } = from(
  'packages/context/dist/minimal-context/current-public-model-context.js',
);
const { createSessionBoundKeyedLocalModel } = from(
  'services/agent-runtime/dist/runtime/session-bound-local-model.js',
);
const { CurrentLocalModelPreparationSource } = from(
  'services/agent-runtime/dist/runtime/current-local-model-preparation-source.js',
);
const {
  LOCAL_QWEN_CHAT_ENDPOINT,
  LOCAL_QWEN_MODEL_ID,
  LOCAL_QWEN_STRATEGY_ID,
  QWEN35_2B_Q4_K_M_SHA256,
} = from('services/agent-runtime/dist/runtime/local-inference.js');
const { GatewaySessionManager } = from(
  'services/mobile-gateway/dist-test/src/gateway-auth/session-manager.js',
);
const { InMemoryDeviceRegistry } = from('services/mobile-gateway/dist-test/src/device/registry.js');
const { DeviceSessionTrustManager } = from(
  'services/mobile-gateway/dist-test/src/device-session/session-trust.js',
);
const { LocalModelSessionOperation } = from(
  'services/mobile-gateway/dist-test/src/gateway-auth/local-model-session-operation.js',
);

let assertions = 0;
const eq = (actual, expected, message) => {
  assertions += 1;
  assert.equal(actual, expected, message);
};
const ok = (actual, message) => {
  assertions += 1;
  assert.ok(actual, message);
};
const deep = (actual, expected, message) => {
  assertions += 1;
  assert.deepEqual(actual, expected, message);
};
const NOW = Date.parse('2026-11-06T12:00:00.000Z');
const TENANT = 'ten_01JW14DABCDB00000000000000';
const ACTOR = 'idn_01JW14DABCDD00000000000000';
const CORRELATION = 'correlation:session-composition:fixture';
const DEVICE_ID = 'dvc_01JW14DABCDA00000000000000';
const SOURCE = 'source-reference-session-composition-fixture';
const ADAPTER = 'public.docs';
const PROVENANCE = 'provenance-reference-session-composition-fixture';
const PREPARATION_REF = 'preparation:session-composition:fixture';
const CREDENTIAL = 'FIXTURE_AUTHENTICATION_NOT_A_REAL_CREDENTIAL';
const TOKEN = 'FIXTURE_MODEL_TOKEN_NOT_A_REAL_CREDENTIAL_'.padEnd(64, 'x');
const PUBLIC_TEXT = 'Horário público de atendimento: 09:00 às 18:00.';
const GENERATED_TEXT = 'Atendimento público: 09:00 às 18:00.';
const at = (epoch) => new Date(epoch).toISOString();
const totals = {
  credentialReads: 0,
  transportCalls: 0,
  producerCalls: 0,
  sourceRevalidations: 0,
  sourceSyncChecks: 0,
  currentOwnerRecordReads: 0,
  currentRoutingRecordReads: 0,
  currentPolicyLookups: 0,
  currentContextAdapterReads: 0,
  currentSourceReads: 0,
  currentStrategySelections: 0,
};
const results = [];
const cases = [];
const scenario = (name, run) =>
  cases.push({ name, run, coverage: 'LEGACY_INJECTED_PREPARATION_BOUNDARY_REGRESSION' });
const currentProducerScenario = (name, run) =>
  cases.push({ name, run, coverage: 'ACTUAL_W02_W05_W06_CURRENT_PREPARATION_COMPOSITION' });

function noAuthority(value, gateway = false) {
  eq(value.authorizesExecution, false);
  eq(value.canInvokeTools, false);
  if (gateway) eq(value.canGrantPermission, false);
  if ('retryAuthorized' in value) eq(value.retryAuthorized, false);
  if ('provesExecutionSuccess' in value) eq(value.provesExecutionSuccess, false);
}

function abstained(value, code) {
  eq(value.status, 'ABSTAINED');
  noAuthority(value, true);
  eq(typeof value.code, 'string');
  ok(value.code.length > 0);
  if (code !== undefined) eq(value.code, code);
  eq('content' in value, false);
  eq('prompt' in value, false);
  eq('tool_calls' in value, false);
}

function deferred() {
  let resolvePromise;
  const promise = new Promise((resolvePending) => {
    resolvePromise = resolvePending;
  });
  return { promise, resolve: resolvePromise };
}

async function bounded(promise, label = 'scenario') {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`OFFLINE_PROOF_BOUND_EXCEEDED:${label}`)), 3000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function health(now, overrides = {}) {
  return {
    source: 'W05F_VERIFIED_LOCAL_MODEL_HEALTH',
    state: 'AVAILABLE',
    observedAt: at(now - 1000),
    maxAgeMs: 10_000,
    modelIntegrityVerified: true,
    endpointIdentityVerified: true,
    authorizesExecution: false,
    ...overrides,
  };
}

function routerInput(binding) {
  const tenant = { tenantId: binding.tenantId };
  const correlation = { correlationId: binding.correlationId };
  return {
    tenant,
    correlation,
    classification: {
      tenant,
      correlation,
      taskClass: 'INFORMATIONAL',
      modality: 'TEXT',
      complexity: 'TRIVIAL',
      reversibility: 'NOT_APPLICABLE',
      riskSignals: [],
      classificationConfidence: 'HIGH',
      reasons: ['TASK_CLASS_FROM_OPERATION'],
      authoritySemantics: 'CLASSIFIER_ONLY_NO_AUTHORITY',
    },
    reasoning: {
      status: 'RESOLVED',
      tenant,
      correlation,
      level: 'L2',
      requestedLevel: 'L2',
      reasons: ['TASK_NEED_FROM_COMPLEXITY'],
      mandatorySafetyValidationRequired: true,
      canSkipMandatoryValidation: false,
      authorizesExecution: false,
    },
    confidence: {
      kind: 'CONFIDENCE_EVALUATION',
      schemaVersion: '1.0.0',
      tenant,
      correlation,
      scoreBps: 9000,
      band: 'HIGH',
      disposition: 'PROCEED_WITH_EVIDENCE',
      decomposition: {
        evidenceQualityBps: 9000,
        consistencyBps: 9000,
        coverageBps: 9000,
        freshnessBps: 9000,
        ambiguityBps: 1000,
      },
      uncertaintyReasons: [],
      calibrationInterfaceVersion: '1.0.0',
      authorizesExecution: false,
      canGrantPermission: false,
    },
    lane: {
      source: 'W04_LANE_RESOLUTION',
      tenantId: binding.tenantId,
      correlationId: binding.correlationId,
      lane: 'FAST',
      mandatoryValidations: ['CURRENT_POLICY', 'CURRENT_AUTHORITY', 'EXECUTOR_PRECONDITIONS'],
      authorizesExecution: false,
    },
    capabilityPlan: {
      source: 'W04_CAPABILITY_PLAN',
      tenantId: binding.tenantId,
      correlationId: binding.correlationId,
      status: 'READY',
      registryVersion: 'fixture-capabilities:v1',
      authorizesExecution: false,
    },
    budget: {
      source: 'W04_EXECUTION_BUDGET_ASSESSMENT',
      tenantId: binding.tenantId,
      correlationId: binding.correlationId,
      budgetId: 'fixture-budget:v1',
      state: 'WITHIN_BUDGET',
      action: 'CONTINUE_OPTIONAL',
      mandatorySafetyValidationRequired: true,
      canSkipMandatoryValidation: false,
      authorizesExecution: false,
    },
    preferences: {
      deterministic: [],
      model: [LOCAL_QWEN_STRATEGY_ID],
      specialist: [],
      computerUsePlanning: [],
      human: [],
    },
  };
}

function makeRoute(binding, now, healthProjection = health(now)) {
  const descriptor = createLocalQwenStrategyDescriptor({
    nowEpochMs: now,
    ...(healthProjection === null ? {} : { health: healthProjection }),
  });
  const created = createStrategyRegistry('session-composition-fixture:v1', [descriptor]);
  eq(created.status, 'CREATED');
  const registry = created.registry;
  let selectionCalls = 0;
  const route = routeIntelligence({
    ...routerInput(binding),
    strategies: {
      registryVersion: registry.registryVersion,
      select(criteria) {
        selectionCalls += 1;
        return selectStrategy(registry, criteria);
      },
    },
    nowEpochMs: now,
  });
  eq(selectionCalls, 1);
  eq(route.authorizesExecution, false);
  eq(route.downstreamExecutionStillRequiresCurrentValidation, true);
  return route;
}

function makeCompiled(binding, now, options = {}) {
  const tenantId = options.contextTenant ?? binding.tenantId;
  const retrievalAt = now - (options.contextAgeMs ?? 2000);
  const query = {
    kind: 'ContextQuery',
    schemaVersion: '1.0.0',
    tenant: { tenantId },
    correlation: { correlationId: binding.correlationId },
    actor: { kind: 'HUMAN', identityId: binding.actorIdentityId },
    purpose: {
      kind: 'PurposeContext',
      purposeId: 'public.information',
      version: '1.0.0',
      status: 'ACTIVE',
      allowedDataClassifications: ['PUBLIC'],
    },
    jurisdiction: { kind: 'JurisdictionContext', jurisdiction: 'BR', version: '1.0.0' },
    requiresConsent: false,
    maxDataClassification: 'PUBLIC',
    currentness: 'CURRENT_REQUIRED',
    selectors: [
      {
        adapterId: ADAPTER,
        sourceClass: 'COMPANY_KNOWLEDGE',
        key: 'documentRef',
        value: 'public:42',
      },
    ],
    limits: { maxSourceFanout: 1, maxItemsPerSource: 2, maxTotalItems: 2 },
  };
  const item = {
    sourceReference: SOURCE,
    sourceRevision: 'fixture-revision:v1',
    tenant: { tenantId },
    classification: 'PUBLIC',
    observedAt: at(retrievalAt - 1000),
    provenanceReference: PROVENANCE,
    payload: PUBLIC_TEXT,
    adapterId: ADAPTER,
    sourceClass: 'COMPANY_KNOWLEDGE',
  };
  const retrieval = evaluateContextRetrieval({
    query,
    acquisition: {
      kind: 'ContextAcquisitionResult',
      items: [item],
      rejections: [],
      attemptedSelectors: 1,
      invokedAdapters: [ADAPTER],
      authorizesExecution: false,
    },
    policy: {
      evaluatedAt: at(retrievalAt),
      minimumTrustBps: 6000,
      trustBpsByAdapter: { [ADAPTER]: 9500 },
      maxAgeMsBySourceClass: { COMPANY_KNOWLEDGE: 60000 },
    },
  });
  eq(retrieval.authorizesExecution, false);
  const compiled = compileMinimalContext({
    query,
    retrieval,
    limits: { maxItems: 2, maxCanonicalUnits: 100000 },
  });
  eq(compiled.valid, true, 'fixture must pass the actual retrieval/minimization pipeline');
  eq(compiled.package.items.length, 1);
  return options.mutateCompiled ? options.mutateCompiled(compiled) : compiled;
}

function makePrompt(binding, now, options) {
  const prompt = compilePublicLocalModelPrompt({
    compiled: makeCompiled(binding, now, options),
    tenantId: binding.tenantId,
    correlationId: binding.correlationId,
    instruction: 'Resuma o horário público da empresa.',
    allowedAdapterIds: [ADAPTER],
    nowEpochMs: now,
    maxAgeMs: 10000,
    maxPromptBytes: 8192,
    maxItems: 2,
  });
  noAuthority(prompt);
  eq(prompt.purpose, 'INFORMATION_ONLY');
  return prompt;
}

function completion(withTools = false) {
  const message = {
    role: 'assistant',
    content: GENERATED_TEXT,
    ...(withTools
      ? {
          tool_calls: [
            {
              id: 'fixture-tool',
              type: 'function',
              function: { name: 'never_execute', arguments: '{}' },
            },
          ],
        }
      : {}),
  };
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * These are deliberately synthetic upstream owner records/readers, NOT the implementation under
 * test. Policy decisions, context acquisition/minimization/prompt compilation and preparation
 * currentness are performed by the real W02/W05/W06 modules below. Record timestamps are captured
 * once per request; revalidation never refreshes an expired record or supplies an approval boolean.
 */
function currentOwnerFixture({
  now,
  counters,
  options,
  rememberBound,
  rememberPreparation,
  fixture,
}) {
  const entries = new Map();
  let currentEntry;
  const count = (name) => {
    counters[name] += 1;
    totals[name] += 1;
  };
  const entryFor = (bound) => {
    const key = JSON.stringify([
      bound.tenantId,
      bound.actorIdentityId,
      bound.correlationId,
      bound.gatewaySessionId,
      bound.connectionId,
      bound.gatewayGeneration,
      bound.deviceSessionId,
      bound.deviceId,
      bound.registrationVersion,
      bound.requestId,
      bound.deadlineMs,
    ]);
    const previous = entries.get(key);
    if (previous) return previous;
    const observed = now();
    const expires = Math.min(observed + 4000, bound.deadlineMs);
    const actor = { kind: 'HUMAN', identityId: bound.actorIdentityId };
    const subject = { kind: 'IDENTITY', identityId: bound.actorIdentityId };
    const purpose = {
      kind: 'PurposeContext',
      purposeId: 'public.information',
      version: '1.0.0',
      status: 'ACTIVE',
      allowedDataClassifications: ['PUBLIC'],
    };
    const jurisdiction = { kind: 'JurisdictionContext', jurisdiction: 'BR', version: '1.0.0' };
    const consent = {
      kind: 'ConsentRecord',
      schemaVersion: '1.0.0',
      reference: {
        kind: 'CONSENT_RECORD',
        reference: 'consent:current-producer:fixture',
        version: '1.0.0',
      },
      tenantId: bound.tenantId,
      subject: { ...subject },
      status: 'ACTIVE',
      grantedAt: at(observed - 1000),
      expiresAt: at(observed + 20000),
      scope: { purposeIds: [purpose.purposeId], jurisdictions: ['BR'] },
      provenance: {
        source: 'synthetic-owner-fixture',
        reference: 'consent-provenance:fixture',
        capturedAt: at(observed - 1000),
      },
      classification: 'PUBLIC',
    };
    const policyReference = { reference: 'policy:current-producer:fixture', version: '1.0.0' };
    const query = {
      kind: 'ContextQuery',
      schemaVersion: '1.0.0',
      tenant: { tenantId: bound.tenantId },
      correlation: { correlationId: bound.correlationId },
      actor: { ...actor },
      purpose: { ...purpose, allowedDataClassifications: [...purpose.allowedDataClassifications] },
      jurisdiction: { ...jurisdiction },
      requiresConsent: true,
      consent: { ...consent.reference },
      maxDataClassification: 'PUBLIC',
      currentness: 'CURRENT_REQUIRED',
      selectors: [
        {
          adapterId: ADAPTER,
          sourceClass: 'COMPANY_KNOWLEDGE',
          key: 'documentRef',
          value: 'public:42',
        },
      ],
      limits: { maxSourceFanout: 1, maxItemsPerSource: 2, maxTotalItems: 2 },
    };
    const policyEvaluation = {
      kind: 'PolicyEvaluationRequest',
      schemaVersion: '1.0.0',
      policy: { ...policyReference },
      correlation: { correlationId: bound.correlationId },
      tenant: { tenantId: bound.tenantId },
      tenantBoundary: {
        status: 'WITHIN_BOUNDARY',
        reason: 'BOUNDARY_CONFIRMED',
        correlationId: bound.correlationId,
        evidence: {
          evaluatedTenantId: bound.tenantId,
          actorIdentityId: bound.actorIdentityId,
          matchedBindingCount: 1,
          observedBindingTenantIds: [bound.tenantId],
        },
      },
      actor: { ...actor },
      subject,
      action: 'model.public.process',
      requestedScope: ['context:public'],
      purpose: { ...purpose, allowedDataClassifications: [...purpose.allowedDataClassifications] },
      jurisdiction: { ...jurisdiction },
      dataClassification: 'PUBLIC',
      consent,
    };
    const policySnapshot = {
      kind: 'PolicySnapshot',
      policy: { ...policyReference },
      state: 'ACTIVE',
      rules: [
        {
          ruleId: 'fixture-current-model-public-processing',
          effect: 'ALLOW',
          action: 'model.public.process',
          scope: ['context:public'],
          tenantIds: [bound.tenantId],
          actorKinds: ['HUMAN'],
          actorIdentityIds: [bound.actorIdentityId],
          subjectReferences: [`identity:${bound.actorIdentityId}`],
          purposeIds: [purpose.purposeId],
          jurisdictions: ['BR'],
          dataClassifications: ['PUBLIC'],
          consentRequired: true,
          authorityRequired: false,
        },
      ],
    };
    const contextRecord = {
      kind: 'CURRENT_PUBLIC_MODEL_CONTEXT_RECORD',
      reference: `context-owner:fixture:${bound.requestId}`,
      binding: { ...bound },
      observedAtEpochMs: observed,
      expiresAtEpochMs: expires,
      query,
      policyEvaluation,
      instruction: 'Resuma o horário público da empresa.',
      retrievalPolicy: {
        minimumTrustBps: 6000,
        trustBpsByAdapter: { [ADAPTER]: 9500 },
        maxAgeMsBySourceClass: { COMPANY_KNOWLEDGE: 60000 },
      },
      compilerLimits: { maxItems: 2, maxCanonicalUnits: 100000 },
      allowedAdapterIds: [ADAPTER],
    };
    const routingRecord = {
      kind: 'CURRENT_LOCAL_MODEL_ROUTING_RECORD',
      reference: `routing-owner:fixture:${bound.requestId}`,
      binding: { ...bound },
      observedAtEpochMs: observed,
      expiresAtEpochMs: expires,
      routerRequest: routerInput(bound),
      manifest: {
        source: 'LOCAL_RUNTIME_MANIFEST_PROJECTION',
        modelId: LOCAL_QWEN_MODEL_ID,
        modelSha256: QWEN35_2B_Q4_K_M_SHA256,
        observedAtEpochMs: observed - 100,
        maxAgeMs: 5000,
        authorizesExecution: false,
      },
      maxOutputTokens: 64,
    };
    const sourceItem = {
      sourceReference: SOURCE,
      sourceRevision: 'fixture-revision:v1',
      tenant: { tenantId: bound.tenantId },
      classification: 'PUBLIC',
      observedAt: at(observed - 1000),
      provenanceReference: PROVENANCE,
      payload: PUBLIC_TEXT,
    };
    const entry = {
      contextRecord,
      routingRecord,
      policySnapshot,
      sourceItem,
      modelHealth: health(observed),
    };
    entries.set(key, entry);
    currentEntry = entry;
    if (options.mutateCurrentOwners) options.mutateCurrentOwners(entry);
    return entry;
  };
  const owner = {
    readCurrent(bound) {
      count('currentOwnerRecordReads');
      return options.missingCurrentOwner ? null : entryFor(bound).contextRecord;
    },
    policy: {
      getCurrent(request) {
        count('currentPolicyLookups');
        eq(request.policyReference, 'policy:current-producer:fixture');
        eq(request.tenantId, TENANT);
        eq(request.actorIdentityId, ACTOR);
        return options.missingCurrentPolicy ? undefined : currentEntry.policySnapshot;
      },
    },
    adapters: [
      {
        descriptor: {
          adapterId: ADAPTER,
          sourceClass: 'COMPANY_KNOWLEDGE',
          readOnly: true,
          supportedSelectorKeys: ['documentRef'],
          maxItemsPerRead: 2,
        },
        async read(request) {
          count('currentContextAdapterReads');
          eq(request.tenant.tenantId, TENANT);
          eq(request.actor.identityId, ACTOR);
          eq(request.correlation.correlationId, CORRELATION);
          eq(request.maxDataClassification, 'PUBLIC');
          eq(request.currentness, 'CURRENT_REQUIRED');
          eq(request.purpose.purposeId, 'public.information');
          eq(request.consent.reference, 'consent:current-producer:fixture');
          eq(request.selector.adapterId, ADAPTER);
          eq(request.selector.value, 'public:42');
          eq(request.limit, 2);
          if (options.currentReadHook) await options.currentReadHook({ f: fixture(), counters });
          return { items: [currentEntry.sourceItem] };
        },
      },
    ],
    readCurrentSource(bound, adapterId, sourceReference) {
      count('currentSourceReads');
      eq(adapterId, ADAPTER);
      eq(sourceReference, SOURCE);
      return entryFor(bound).sourceItem;
    },
  };
  const context = new CurrentPublicModelContext({
    now,
    ...(options.uncomposedOwner ? {} : { owner }),
  });
  const routing = {
    readCurrent(bound) {
      count('currentRoutingRecordReads');
      return options.missingCurrentRouting ? null : entryFor(bound).routingRecord;
    },
    strategies: {
      registryVersion: 'session-composition-fixture:v1',
      select(criteria) {
        count('currentStrategySelections');
        const descriptor = createLocalQwenStrategyDescriptor({
          nowEpochMs: now(),
          ...(currentEntry.modelHealth === null ? {} : { health: currentEntry.modelHealth }),
        });
        const registry = createStrategyRegistry('session-composition-fixture:v1', [descriptor]);
        eq(registry.status, 'CREATED');
        return selectStrategy(registry.registry, criteria);
      },
    },
    routeIntelligence,
  };
  const actual = new CurrentLocalModelPreparationSource({
    now,
    context,
    ...(options.uncomposedRouting ? {} : { routing }),
  });
  const source = {
    async prepareCurrent(bound, signal) {
      counters.producerCalls += 1;
      totals.producerCalls += 1;
      rememberBound(bound);
      const prepared = await actual.prepareCurrent(bound, signal);
      rememberPreparation(prepared);
      if (options.currentPreparedHook)
        await options.currentPreparedHook({ f: fixture(), prepared });
      return prepared;
    },
    async revalidateCurrent(reference, bound, nowEpochMs, signal) {
      counters.sourceRevalidations += 1;
      totals.sourceRevalidations += 1;
      return actual.revalidateCurrent(reference, bound, nowEpochMs, signal);
    },
    isCurrent(reference, bound, nowEpochMs) {
      counters.sourceSyncChecks += 1;
      totals.sourceSyncChecks += 1;
      return actual.isCurrent(reference, bound, nowEpochMs);
    },
  };
  return { source, currentOwners: () => currentEntry };
}

function fixture(options = {}) {
  let currentNow = NOW;
  let currentRecord;
  let sourceCurrent = true;
  const counters = {
    authReads: 0,
    attestationReads: 0,
    invokes: 0,
    producerCalls: 0,
    sourceRevalidations: 0,
    sourceSyncChecks: 0,
    credentialReads: 0,
    transportCalls: 0,
    completionFaults: 0,
    currentOwnerRecordReads: 0,
    currentRoutingRecordReads: 0,
    currentPolicyLookups: 0,
    currentContextAdapterReads: 0,
    currentSourceReads: 0,
    currentStrategySelections: 0,
  };
  let lastPreparation;
  let lastBound;
  const authenticator = {
    verify(credential) {
      counters.authReads += 1;
      return credential === CREDENTIAL
        ? {
            tenantId: TENANT,
            actorIdentityId: ACTOR,
            issuedAtMs: NOW - 1000,
            expiresAtMs: NOW + 30000,
            authVersion: 'v1',
          }
        : null;
    },
  };
  const gateway = new GatewaySessionManager(authenticator);
  const opened = gateway.openSession({
    protocolVersion: '1.0',
    sessionId: 'gateway:composition:1',
    credential: CREDENTIAL,
    tenantId: TENANT,
    actor: { kind: 'HUMAN', identityId: ACTOR },
    correlation: { correlationId: CORRELATION },
    nowMs: currentNow,
  });
  eq(opened.ok, true);
  const initialGateway = opened.value;
  const devices = new InMemoryDeviceRegistry('ALLOW_SAME_BINDING_AFTER_REVOCATION');
  const provenance = (reference, time = currentNow) => ({
    source: 'W14_DEVICE_REGISTRATION',
    reference,
    observedAt: at(time),
  });
  const registered = devices.register({
    deviceId: DEVICE_ID,
    tenantId: TENANT,
    boundIdentityId: ACTOR,
    registeredAt: at(currentNow - 2000),
    provenance: provenance('fixture:registration', currentNow - 2000),
  });
  eq(registered.ok, true);
  const activated = devices.transition('ACTIVATE', {
    ref: registered.record.ref,
    expectedVersion: registered.record.ref.registrationVersion,
    transitionedAt: at(currentNow - 1000),
    provenance: provenance('fixture:activation', currentNow - 1000),
  });
  eq(activated.ok, true);
  currentRecord = activated.record;
  let attestation = {
    kind: 'DEVICE_ATTESTATION_REFERENCE',
    reference: 'fixture:attestation',
    provider: 'synthetic-fixture-attester',
    version: '1',
    state: 'VERIFIED',
    observedAtMs: NOW - 500,
    expiresAtMs: NOW + 20000,
  };
  const deviceSessions = new DeviceSessionTrustManager();
  const trusted = deviceSessions.openSession({
    deviceSessionId: 'device:composition:1',
    gatewaySession: initialGateway,
    deviceRecord: currentRecord,
    attestation,
    nowMs: currentNow,
  });
  eq(trusted.ok, true);
  const binding = Object.freeze({
    sessionId: initialGateway.sessionId,
    connectionId: initialGateway.connectionId,
    tenantId: initialGateway.tenantId,
    actorIdentityId: initialGateway.actorIdentityId,
    correlationId: initialGateway.correlationId,
  });
  const body = (requestId = 'request:composition:1', deadlineMs = currentNow + 5000) => ({
    deviceSessionId: 'device:composition:1',
    requestId,
    deadlineMs,
  });

  const clientDependencies = {
    now: () => currentNow,
    credentialSource: {
      async readCurrent() {
        counters.credentialReads += 1;
        totals.credentialReads += 1;
        if (options.credentialHook) await options.credentialHook({ counters, f });
        return {
          kind: 'LOCAL_MODEL_EPHEMERAL_BEARER',
          bearerToken: TOKEN,
          observedAtEpochMs: currentNow - 100,
          expiresAtEpochMs: currentNow + 20000,
          authorizesExecution: false,
          canInvokeTools: false,
        };
      },
    },
    transport: async (url, init) => {
      counters.transportCalls += 1;
      totals.transportCalls += 1;
      eq(url, LOCAL_QWEN_CHAT_ENDPOINT);
      eq(init.method, 'POST');
      eq(init.redirect, 'error');
      eq(init.credentials, 'omit');
      eq(init.cache, 'no-store');
      eq(init.referrerPolicy, 'no-referrer');
      const headers = new Headers(init.headers);
      eq(headers.get('authorization'), `Bearer ${TOKEN}`);
      eq(headers.get('content-type'), 'application/json');
      eq(headers.has('cookie'), false);
      eq(headers.has('proxy-authorization'), false);
      eq(typeof init.body, 'string');
      const payload = JSON.parse(init.body);
      eq(payload.model, LOCAL_QWEN_MODEL_ID);
      eq(payload.stream, false);
      eq(payload.max_tokens, 64);
      eq('tools' in payload, false);
      eq('tool_choice' in payload, false);
      eq(payload.messages.length, 2);
      eq(payload.messages[1].role, 'user');
      eq(payload.messages[1].content, lastPreparation.minimizedPublicPrompt.prompt);
      for (const forbidden of [
        TENANT,
        ACTOR,
        CORRELATION,
        DEVICE_ID,
        SOURCE,
        ADAPTER,
        PROVENANCE,
        PREPARATION_REF,
        CREDENTIAL,
        TOKEN,
        binding.sessionId,
        binding.connectionId,
        'device:composition:1',
        lastBound.requestId,
        'MinimalContextPackage',
        'DeviceSessionTrustSnapshot',
        'policy:current-producer:fixture',
        'consent:current-producer:fixture',
        'consent-provenance:fixture',
        'context-owner:fixture:',
        'routing-owner:fixture:',
        'model.public.process',
        'context:public',
      ]) {
        eq(
          init.body.includes(forbidden),
          false,
          'private metadata must stay outside the model body',
        );
      }
      return options.responder
        ? options.responder({ counters, init, f })
        : completion(options.toolOutput);
    },
  };
  const legacySource = {
    async prepareCurrent(bound, signal) {
      counters.producerCalls += 1;
      totals.producerCalls += 1;
      eq(signal.aborted, false);
      eq(Object.isFrozen(bound), true, 'producer binding must be a captured immutable projection');
      deep(
        Object.keys(bound).sort(),
        [
          'tenantId',
          'actorIdentityId',
          'correlationId',
          'gatewaySessionId',
          'connectionId',
          'gatewayGeneration',
          'deviceSessionId',
          'deviceId',
          'registrationVersion',
          'requestId',
          'deadlineMs',
        ].sort(),
      );
      eq(bound.tenantId, TENANT);
      eq(bound.actorIdentityId, ACTOR);
      eq(bound.correlationId, CORRELATION);
      eq(bound.deviceId, DEVICE_ID);
      eq(bound.registrationVersion, currentRecord.ref.registrationVersion);
      lastBound = bound;
      const route = makeRoute(
        bound,
        currentNow,
        options.missingHealth
          ? null
          : health(currentNow, options.staleHealth ? { observedAt: at(currentNow - 20001) } : {}),
      );
      const minimizedPublicPrompt = makePrompt(bound, currentNow, options);
      lastPreparation = {
        kind: 'W05_W06_SESSION_LOCAL_MODEL_PREPARATION',
        binding: { ...bound },
        preparationRef: PREPARATION_REF,
        observedAtEpochMs: currentNow,
        expiresAtEpochMs: Math.min(currentNow + 4000, bound.deadlineMs),
        route,
        manifest: {
          source: 'LOCAL_RUNTIME_MANIFEST_PROJECTION',
          modelId: LOCAL_QWEN_MODEL_ID,
          modelSha256: QWEN35_2B_Q4_K_M_SHA256,
          observedAtEpochMs: currentNow - 100,
          maxAgeMs: 5000,
          authorizesExecution: false,
        },
        minimizedPublicPrompt,
        maxOutputTokens: 64,
      };
      if (options.mutatePreparation) options.mutatePreparation(lastPreparation);
      if (options.prepareHook) await options.prepareHook(f);
      return lastPreparation;
    },
    async revalidateCurrent(reference, bound, nowEpochMs, signal) {
      counters.sourceRevalidations += 1;
      totals.sourceRevalidations += 1;
      eq(reference, PREPARATION_REF);
      eq(nowEpochMs, currentNow);
      deep(bound, lastBound);
      return sourceCurrent && !signal.aborted;
    },
    isCurrent(reference, bound, nowEpochMs) {
      counters.sourceSyncChecks += 1;
      totals.sourceSyncChecks += 1;
      eq(reference, PREPARATION_REF);
      eq(nowEpochMs, currentNow);
      deep(bound, lastBound);
      return sourceCurrent;
    },
  };
  const currentOwners = options.currentProducers
    ? currentOwnerFixture({
        now: () => currentNow,
        counters,
        options,
        rememberBound(bound) {
          lastBound = bound;
        },
        rememberPreparation(prepared) {
          lastPreparation = prepared;
        },
        fixture: () => f,
      })
    : null;
  const source = currentOwners?.source ?? legacySource;
  const core = createSessionBoundKeyedLocalModel({
    ...clientDependencies,
    ...(options.missingSource ? {} : { source }),
  });
  const gatewayPort = options.completeFault
    ? new Proxy(gateway, {
        get(target, key) {
          if (key === 'completeRequest')
            return () => {
              counters.completionFaults += 1;
              return {
                ok: false,
                error: {
                  code: 'REQUEST_NOT_FOUND',
                  message: 'synthetic finalization fault',
                  retryable: false,
                },
              };
            };
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      })
    : gateway;
  const operation = new LocalModelSessionOperation({
    gatewaySessions: gatewayPort,
    deviceSessions,
    devices,
    currentAttestation: {
      async readCurrent() {
        counters.attestationReads += 1;
        if (options.attestationHook) {
          await options.attestationHook({ readIndex: counters.attestationReads, counters, f });
        }
        return attestation;
      },
    },
    now: () => currentNow,
    async invoke(bound, signal, guards) {
      counters.invokes += 1;
      return core.infer(bound, signal, guards);
    },
  });
  const f = {
    operation,
    core,
    gateway,
    devices,
    deviceSessions,
    binding,
    body,
    counters,
    run: (request = body(), socket = binding) => operation.run(request, socket),
    now: () => currentNow,
    setNow(value) {
      currentNow = value;
    },
    setSourceCurrent(value) {
      sourceCurrent = value;
    },
    setAttestation(changes) {
      attestation = { ...attestation, ...changes };
    },
    preparation: () => lastPreparation,
    currentOwners: () => currentOwners?.currentOwners(),
    trusted: () =>
      deviceSessions.getSession('device:composition:1', binding.connectionId, currentNow),
    outstanding() {
      const current = gateway.getSession(binding.sessionId, currentNow);
      eq(current.ok, true);
      return current.value.outstandingRequests;
    },
    transition(transition) {
      const result = devices.transition(transition, {
        ref: currentRecord.ref,
        expectedVersion: currentRecord.ref.registrationVersion,
        transitionedAt: at(currentNow),
        provenance: provenance(`fixture:${transition.toLowerCase()}`),
      });
      eq(result.ok, true);
      currentRecord = result.record;
      return result.record;
    },
    reregister() {
      f.transition('REVOKE');
      const registeredAgain = devices.register({
        deviceId: DEVICE_ID,
        tenantId: TENANT,
        boundIdentityId: ACTOR,
        expectedVersion: currentRecord.ref.registrationVersion,
        registeredAt: at(currentNow),
        provenance: provenance('fixture:reregistration'),
      });
      eq(registeredAgain.ok, true);
      currentRecord = registeredAgain.record;
      return f.transition('ACTIVATE');
    },
    reconnect() {
      const closed = gateway.closeSession({
        protocolVersion: '1.0',
        ...binding,
        nowMs: currentNow,
      });
      eq(closed.ok, true);
      const result = gateway.reconnectSession({
        protocolVersion: '1.0',
        sessionId: binding.sessionId,
        previousConnectionId: binding.connectionId,
        credential: CREDENTIAL,
        tenantId: TENANT,
        actor: { kind: 'HUMAN', identityId: ACTOR },
        correlation: { correlationId: CORRELATION },
        nowMs: currentNow,
      });
      eq(result.ok, true);
      ok(result.value.generation > initialGateway.generation);
      ok(result.value.connectionId !== binding.connectionId);
      return result.value;
    },
  };
  return f;
}

function noModelCalls(f, expectedProducerCalls = 0) {
  eq(f.counters.producerCalls, expectedProducerCalls);
  eq(f.counters.credentialReads, 0);
  eq(f.counters.transportCalls, 0);
}

scenario(
  'legacy injected orchestration with actual W14 and W05/W06 modules generates one information-only candidate',
  async () => {
    eq('createLocalQwenStrategyDescriptor' in registryPublic, false);
    const f = fixture();
    const result = await bounded(f.run());
    eq(result.status, 'GENERATED');
    eq(result.content, GENERATED_TEXT);
    noAuthority(result, true);
    eq(result.strategyId, LOCAL_QWEN_STRATEGY_ID);
    eq(result.modelSha256, QWEN35_2B_Q4_K_M_SHA256);
    eq(f.counters.producerCalls, 1);
    ok(f.counters.sourceRevalidations >= 2);
    ok(
      f.counters.sourceSyncChecks >= 3,
      'dispatch, core release and W14 release need current source checks',
    );
    eq(f.counters.credentialReads, 1);
    eq(f.counters.transportCalls, 1);
    eq(f.outstanding(), 0);
    const prompt = f.preparation().minimizedPublicPrompt;
    eq(prompt.status, 'READY');
    deep(prompt.includedSourceReferences, [SOURCE]);
    eq(f.preparation().route.status, 'SELECTED');
    eq(f.preparation().route.family, 'MODEL');
  },
);

scenario(
  'W14 request replay cannot repeat producer, credential acquisition or model transport',
  async () => {
    const f = fixture();
    eq((await bounded(f.run())).status, 'GENERATED');
    abstained(await bounded(f.run()));
    eq(f.counters.producerCalls, 1);
    eq(f.counters.credentialReads, 1);
    eq(f.counters.transportCalls, 1);
    eq(f.outstanding(), 0);
  },
);

scenario('body injection and getters are rejected before any core work', async () => {
  const f = fixture();
  for (const extra of [
    { tenantId: TENANT },
    { actorIdentityId: ACTOR },
    { prompt: PUBLIC_TEXT },
    { credential: CREDENTIAL },
    { authorizesExecution: true },
    { canInvokeTools: true },
    { gatewayGeneration: 99 },
    { modelHost: '127.0.0.1' },
  ]) {
    abstained(await bounded(f.run({ ...f.body(), ...extra })));
  }
  let getterCalls = 0;
  const body = { ...f.body() };
  Object.defineProperty(body, 'requestId', {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error('fixture getter');
    },
  });
  abstained(await bounded(f.run(body)));
  eq(getterCalls, 0);
  noModelCalls(f);
  eq(f.counters.invokes, 0);
  eq(f.outstanding(), 0);
});

scenario(
  'cross-tenant actor correlation connection and gateway session fail before core',
  async () => {
    const f = fixture();
    for (const changed of [
      { tenantId: 'ten_01JW14DABCDC00000000000000' },
      { actorIdentityId: 'idn_01JW14DABCDE00000000000000' },
      { correlationId: 'correlation:foreign' },
      { connectionId: 'connection:foreign' },
      { sessionId: 'gateway:foreign' },
    ]) {
      abstained(await bounded(f.run(f.body(), { ...f.binding, ...changed })));
    }
    abstained(await bounded(f.run({ ...f.body(), deviceSessionId: 'device:foreign' })));
    noModelCalls(f);
    eq(f.counters.invokes, 0);
    eq(f.outstanding(), 0);
  },
);

for (const transition of ['REVOKE', 'MARK_COMPROMISED', 'RETIRE']) {
  scenario(
    `current real device registry ${transition} overrides a cached active trust snapshot`,
    async () => {
      const f = fixture();
      f.transition(transition);
      eq(
        f.trusted().ok,
        true,
        'negative must start with the stale-but-active cached trust counterexample',
      );
      abstained(await bounded(f.run()));
      noModelCalls(f);
      eq(f.counters.invokes, 0);
      eq(f.outstanding(), 0);
    },
  );
}

scenario('fresh gateway generation invalidates the old authenticated connection', async () => {
  const f = fixture();
  f.reconnect();
  abstained(await bounded(f.run()));
  noModelCalls(f);
  eq(f.counters.invokes, 0);
  eq(f.outstanding(), 0);
});

scenario('expired authentication and stale attestation cannot reach core', async () => {
  const expired = fixture();
  expired.setNow(NOW + 30000);
  abstained(await bounded(expired.run()));
  noModelCalls(expired);
  eq(expired.counters.invokes, 0);
  const attestation = fixture();
  attestation.setAttestation({ expiresAtMs: NOW });
  abstained(await bounded(attestation.run()));
  noModelCalls(attestation);
  eq(attestation.counters.invokes, 0);
});

scenario('uncomposed W05/W06 producer abstains without reading a model credential', async () => {
  const f = fixture({ missingSource: true });
  abstained(await bounded(f.run()));
  eq(f.counters.invokes, 1);
  noModelCalls(f);
  eq(f.outstanding(), 0);
});

for (const [name, options, promptReason] of [
  ['missing model health', { missingHealth: true }],
  ['stale model health', { staleHealth: true }],
  ['stale W06 compiled context', { contextAgeMs: 15000 }, 'STALE_CONTEXT'],
  [
    'cross-tenant W06 compiled context',
    { contextTenant: 'ten_01JW14DABCDC00000000000000' },
    'CROSS_TENANT_OR_CORRELATION',
  ],
]) {
  scenario(`${name} refuses before keyed credentials and transport`, async () => {
    const f = fixture(options);
    abstained(await bounded(f.run()));
    noModelCalls(f, 1);
    eq(f.outstanding(), 0);
    if (promptReason) {
      eq(f.preparation().minimizedPublicPrompt.status, 'ABSTAINED');
      eq(f.preparation().minimizedPublicPrompt.reason, promptReason);
    } else eq(f.preparation().route.status, 'ABSTAINED');
  });
}

scenario('W06 accessor is never evaluated and its source is never sent to the model', async () => {
  let getterCalls = 0;
  const f = fixture({
    mutateCompiled(compiled) {
      const hostile = { ...compiled.package.items[0] };
      Object.defineProperty(hostile, 'payload', {
        enumerable: true,
        get() {
          getterCalls += 1;
          throw new Error('PRIVATE_MARKER_MUST_NOT_ESCAPE');
        },
      });
      return { ...compiled, package: { ...compiled.package, items: [hostile] } };
    },
  });
  const result = await bounded(f.run());
  abstained(result);
  eq(getterCalls, 0);
  noModelCalls(f, 1);
  eq(f.preparation().minimizedPublicPrompt.reason, 'INVALID_CONTEXT');
  eq(JSON.stringify(result).includes('PRIVATE_MARKER'), false);
});

scenario('W06 still rejects required consent missing from the compiled query', async () => {
  const f = fixture({
    mutateCompiled(compiled) {
      return {
        ...compiled,
        package: {
          ...compiled.package,
          query: { ...compiled.package.query, requiresConsent: true },
        },
      };
    },
  });
  abstained(await bounded(f.run()));
  noModelCalls(f, 1);
  eq(f.preparation().minimizedPublicPrompt.reason, 'INVALID_CONTEXT');
});

scenario('trusted-producer binding drift is rejected before inference', async () => {
  const f = fixture({
    mutatePreparation(preparation) {
      preparation.binding.gatewayGeneration += 1;
    },
  });
  abstained(await bounded(f.run()));
  noModelCalls(f, 1);
  eq(f.outstanding(), 0);
});

scenario('revoked source permission is not replaced by PUBLIC classification', async () => {
  const f = fixture();
  f.setSourceCurrent(false);
  abstained(await bounded(f.run()));
  noModelCalls(f, 1);
  ok(f.counters.sourceRevalidations > 0);
  eq(f.outstanding(), 0);
});

scenario('real device revocation during producer await stops dispatch', async () => {
  const started = deferred();
  const release = deferred();
  const f = fixture({
    async prepareHook() {
      started.resolve();
      await release.promise;
    },
  });
  const pending = f.run();
  await bounded(started.promise);
  f.transition('REVOKE');
  release.resolve();
  abstained(await bounded(pending));
  noModelCalls(f, 1);
  eq(f.outstanding(), 0);
});

scenario(
  'an ACTIVE re-registered device cannot reuse the old registration version during await',
  async () => {
    const started = deferred();
    const release = deferred();
    const f = fixture({
      async prepareHook() {
        started.resolve();
        await release.promise;
      },
    });
    const pending = f.run();
    await bounded(started.promise);
    const replacement = f.reregister();
    eq(replacement.state, 'ACTIVE');
    ok(replacement.ref.registrationVersion > 2);
    eq(f.trusted().ok, true, 'cached W14 trust alone must not hide the changed registry version');
    release.resolve();
    abstained(await bounded(pending));
    noModelCalls(f, 1);
    eq(f.outstanding(), 0);
  },
);

scenario('real device revocation during model await suppresses the late text', async () => {
  const started = deferred();
  const release = deferred();
  const f = fixture({
    async responder() {
      started.resolve();
      await release.promise;
      return completion();
    },
  });
  const pending = f.run();
  await bounded(started.promise);
  f.transition('REVOKE');
  release.resolve();
  abstained(await bounded(pending));
  eq(f.counters.transportCalls, 1);
  eq(f.counters.credentialReads, 1);
  eq(f.outstanding(), 0);
});

scenario('source permission revoked during model await suppresses generated text', async () => {
  const started = deferred();
  const release = deferred();
  const f = fixture({
    async responder() {
      started.resolve();
      await release.promise;
      return completion();
    },
  });
  const pending = f.run();
  await bounded(started.promise);
  f.setSourceCurrent(false);
  release.resolve();
  abstained(await bounded(pending));
  eq(f.counters.transportCalls, 1);
  eq(f.outstanding(), 0);
});

for (const revokedOwner of ['source', 'W14 device registry']) {
  scenario(
    `${revokedOwner} revocation during credential acquisition prevents transport dispatch`,
    async () => {
      const started = deferred();
      const release = deferred();
      const f = fixture({
        async credentialHook({ counters }) {
          ok(counters.sourceRevalidations >= 1);
          ok(counters.sourceSyncChecks > 0);
          eq(counters.transportCalls, 0);
          started.resolve();
          await release.promise;
        },
      });
      const pending = f.run();
      await bounded(started.promise);
      if (revokedOwner === 'source') f.setSourceCurrent(false);
      else f.transition('REVOKE');
      release.resolve();
      abstained(await bounded(pending));
      eq(f.counters.producerCalls, 1);
      eq(f.counters.credentialReads, 1);
      eq(
        f.counters.transportCalls,
        0,
        'no model request may leave after the credential wait loses its binding',
      );
      eq(f.outstanding(), 0);
    },
  );
}

for (const stopKind of ['cancel', 'timeout']) {
  scenario(
    `${stopKind} during credential await cannot lend a newer request guard to the late credential`,
    async () => {
      const started = deferred();
      const release = deferred();
      const newStarted = deferred();
      const newRelease = deferred();
      const newRequestId = `request:composition:credential-${stopKind}-new`;
      const f = fixture({
        async credentialHook({ counters }) {
          if (counters.credentialReads === 1) {
            eq(counters.transportCalls, 0);
            started.resolve();
            await release.promise;
          } else if (counters.credentialReads === 2) {
            eq(counters.producerCalls, 2);
            eq(counters.transportCalls, 0);
            newStarted.resolve();
            await newRelease.promise;
          }
        },
      });
      const firstBody = f.body(
        `request:composition:credential-${stopKind}-old`,
        NOW + (stopKind === 'timeout' ? 100 : 5000),
      );
      const pending = f.run(firstBody);
      await bounded(started.promise);
      if (stopKind === 'cancel') {
        const cancellation = f.operation.cancel(firstBody, f.binding);
        eq(cancellation.requested, true);
        noAuthority(cancellation, true);
      }
      abstained(await bounded(pending), stopKind === 'cancel' ? 'CANCELLED' : 'TIMEOUT');
      eq(f.counters.credentialReads, 1);
      eq(f.counters.transportCalls, 0);
      await new Promise((resolveTurn) => setTimeout(resolveTurn, 0));
      let newSettled = false;
      const newPending = f.run(f.body(newRequestId)).then((result) => {
        newSettled = true;
        return result;
      });
      await bounded(newStarted.promise);
      // The keyed wrapper rejects the cancelled credential wait promptly, even
      // if the synthetic source is uncooperative. A new valid client flight can
      // therefore own its guard while the old raw credential is still pending.
      eq(f.counters.credentialReads, 2);
      eq(f.counters.transportCalls, 0);
      release.resolve();
      await new Promise((resolveTurn) => setTimeout(resolveTurn, 0));
      eq(f.counters.credentialReads, 2);
      eq(newSettled, false, 'the new flight must remain inside its own credential await');
      eq(f.counters.transportCalls, 0, 'the old credential must never dispatch under a new guard');
      newRelease.resolve();
      const recovered = await bounded(newPending);
      eq(recovered.status, 'GENERATED');
      eq(recovered.content, GENERATED_TEXT);
      noAuthority(recovered, true);
      eq(f.counters.producerCalls, 2);
      eq(f.counters.credentialReads, 2);
      eq(f.counters.transportCalls, 1);
      eq(f.outstanding(), 0);
    },
  );
}

scenario('deadline crossing while transport waits prevents late success', async () => {
  const started = deferred();
  const release = deferred();
  const f = fixture({
    async responder() {
      started.resolve();
      await release.promise;
      return completion();
    },
  });
  const pending = f.run();
  await bounded(started.promise);
  f.setNow(NOW + 5001);
  release.resolve();
  abstained(await bounded(pending));
  eq(f.counters.transportCalls, 1);
});

scenario(
  'source revocation during pre-dispatch W14 await cannot slip through an earlier source check',
  async () => {
    const started = deferred();
    const release = deferred();
    const f = fixture({
      async attestationHook({ readIndex, counters }) {
        if (readIndex !== 2) return;
        eq(counters.sourceRevalidations, 1);
        eq(counters.transportCalls, 0);
        started.resolve();
        await release.promise;
      },
    });
    const pending = f.run();
    await bounded(started.promise);
    f.setSourceCurrent(false);
    release.resolve();
    abstained(await bounded(pending));
    noModelCalls(f, 1);
    ok(f.counters.sourceSyncChecks > 0);
    eq(f.outstanding(), 0);
  },
);

scenario(
  'source revocation in final W14 await suppresses text already returned by the real W05 adapter',
  async () => {
    const started = deferred();
    const release = deferred();
    const f = fixture({
      async attestationHook({ readIndex, counters }) {
        if (readIndex !== 4) return;
        eq(counters.sourceRevalidations, 2);
        eq(counters.transportCalls, 1);
        started.resolve();
        await release.promise;
      },
    });
    const pending = f.run();
    await bounded(started.promise);
    f.setSourceCurrent(false);
    const beforeReleaseChecks = f.counters.sourceSyncChecks;
    release.resolve();
    abstained(await bounded(pending));
    ok(
      f.counters.sourceSyncChecks > beforeReleaseChecks,
      'W14 must actually invoke the registered final source guard',
    );
    eq(f.counters.transportCalls, 1);
    eq(f.outstanding(), 0);
  },
);

scenario(
  'real reconnect during model await refuses the old generation and quarantines uncertain completion',
  async () => {
    const started = deferred();
    const release = deferred();
    const f = fixture({
      async responder() {
        started.resolve();
        await release.promise;
        return completion();
      },
    });
    const pending = f.run();
    await bounded(started.promise);
    f.reconnect();
    release.resolve();
    abstained(await bounded(pending), 'RECONCILIATION_REQUIRED');
    eq(f.counters.transportCalls, 1);
    abstained(
      await bounded(f.run(f.body('request:composition:after-reconnect'))),
      'RECONCILIATION_REQUIRED',
    );
    eq(f.counters.transportCalls, 1);
    eq(f.counters.producerCalls, 1);
  },
);

scenario(
  'a non-cooperative model transport cannot keep the caller open after the deadline',
  async () => {
    const started = deferred();
    const release = deferred();
    let lateBodiesCancelled = 0;
    const f = fixture({
      async responder() {
        started.resolve();
        return release.promise;
      },
    });
    const pending = f.run(f.body('request:composition:short-deadline', NOW + 100));
    await bounded(started.promise);
    abstained(await bounded(pending), 'TIMEOUT');
    abstained(await bounded(f.run(f.body('request:composition:timeout-busy'))), 'BUSY');
    eq(f.counters.credentialReads, 1);
    eq(f.counters.transportCalls, 1);
    release.resolve(
      new Response(
        new ReadableStream({
          cancel() {
            lateBodiesCancelled += 1;
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    await new Promise((resolveTurn) => setTimeout(resolveTurn, 0));
    eq(lateBodiesCancelled, 1);
  },
);

scenario(
  'cancellation is bounded, late body is cancelled and singleton blocks overlapping transport',
  async () => {
    const started = deferred();
    const release = deferred();
    let lateBodiesCancelled = 0;
    const f = fixture({
      async responder({ counters }) {
        if (counters.transportCalls === 1) {
          started.resolve();
          return release.promise;
        }
        return completion();
      },
    });
    const firstBody = f.body();
    const pending = f.run(firstBody);
    await bounded(started.promise);
    const cancellation = f.operation.cancel(firstBody, f.binding);
    eq(cancellation.requested, true);
    noAuthority(cancellation, true);
    abstained(await bounded(pending));
    abstained(await bounded(f.run(f.body('request:composition:busy'))), 'BUSY');
    eq(f.counters.credentialReads, 1);
    eq(f.counters.transportCalls, 1);
    release.resolve(
      new Response(
        new ReadableStream({
          cancel() {
            lateBodiesCancelled += 1;
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    await new Promise((resolveTurn) => setTimeout(resolveTurn, 0));
    eq(lateBodiesCancelled, 1);
    const recovered = await bounded(f.run(f.body('request:composition:recovered')));
    eq(recovered.status, 'GENERATED');
    eq(recovered.content, GENERATED_TEXT);
    noAuthority(recovered, true);
    eq(f.counters.credentialReads, 2);
    eq(f.counters.transportCalls, 2);
    eq(f.outstanding(), 0);
  },
);

scenario('model tool-shaped output is never converted into execution authority', async () => {
  const f = fixture({ toolOutput: true });
  abstained(await bounded(f.run()));
  eq(f.counters.credentialReads, 1);
  eq(f.counters.transportCalls, 1);
  eq(f.outstanding(), 0);
});

scenario(
  'synthetic canonical completion denial quarantines the operation without blind retry',
  async () => {
    const f = fixture({ completeFault: true });
    abstained(await bounded(f.run()), 'RECONCILIATION_REQUIRED');
    eq(f.counters.completionFaults, 1);
    eq(f.counters.transportCalls, 1);
    eq(f.outstanding(), 1, 'failed completion must not be reported as finalized');
    abstained(
      await bounded(f.run(f.body('request:composition:after-uncertain'))),
      'RECONCILIATION_REQUIRED',
    );
    eq(f.counters.transportCalls, 1);
    eq(f.counters.producerCalls, 1);
  },
);

currentProducerScenario(
  'actual current W02/W05/W06 producers compose with W14 and the keyed client without fixture-made preparations',
  async () => {
    const f = fixture({ currentProducers: true });
    const result = await bounded(f.run());
    eq(result.status, 'GENERATED');
    eq(result.content, GENERATED_TEXT);
    noAuthority(result, true);
    eq(result.strategyId, LOCAL_QWEN_STRATEGY_ID);
    eq(result.modelSha256, QWEN35_2B_Q4_K_M_SHA256);
    eq(f.counters.producerCalls, 1);
    eq(f.counters.currentContextAdapterReads, 1);
    ok(f.counters.currentPolicyLookups >= 3, 'policy must be read again at currentness boundaries');
    ok(f.counters.currentSourceReads >= 3, 'provenance/content must be read again before release');
    ok(f.counters.currentStrategySelections >= 3, 'current strategy must be selected again');
    ok(f.counters.sourceRevalidations >= 2);
    ok(f.counters.sourceSyncChecks >= 3);
    eq(f.counters.credentialReads, 1);
    eq(f.counters.transportCalls, 1);
    eq(f.outstanding(), 0);
    eq(f.preparation().kind, 'W05_W06_SESSION_LOCAL_MODEL_PREPARATION');
    eq(f.preparation().minimizedPublicPrompt.status, 'READY');
    deep(f.preparation().minimizedPublicPrompt.includedSourceReferences, [SOURCE]);
    eq(f.preparation().route.family, 'MODEL');
    eq(f.preparation().route.status, 'SELECTED');
  },
);

currentProducerScenario(
  'missing real-producer owner or current policy/routing records cannot be replaced by defaults',
  async () => {
    for (const missing of [
      'uncomposedOwner',
      'missingCurrentOwner',
      'missingCurrentPolicy',
      'uncomposedRouting',
      'missingCurrentRouting',
    ]) {
      const f = fixture({ currentProducers: true, [missing]: true });
      const result = await bounded(f.run());
      abstained(result);
      noModelCalls(f, 1);
      eq(f.counters.currentContextAdapterReads, 0, `${missing} must fail before acquisition`);
      eq(f.outstanding(), 0);
    }
  },
);

currentProducerScenario(
  'canonical policy and consent deny missing revoked expired foreign or purpose-incompatible records before acquisition',
  async () => {
    const mutations = [
      (entry) => {
        entry.policySnapshot.rules[0].effect = 'DENY';
      },
      (entry) => {
        entry.policySnapshot.rules[0].effect = 'REQUIRE_APPROVAL';
      },
      (entry) => {
        delete entry.contextRecord.policyEvaluation.consent;
      },
      (entry) => {
        entry.contextRecord.policyEvaluation.consent.status = 'REVOKED';
      },
      (entry) => {
        entry.contextRecord.policyEvaluation.consent.expiresAt = at(NOW);
      },
      (entry) => {
        entry.contextRecord.policyEvaluation.consent.subject.identityId = 'identity:foreign';
      },
      (entry) => {
        entry.contextRecord.policyEvaluation.consent.scope.purposeIds = ['different.purpose'];
      },
      (entry) => {
        entry.contextRecord.query.purpose.status = 'DISABLED';
        entry.contextRecord.policyEvaluation.purpose.status = 'DISABLED';
      },
      (entry) => {
        entry.contextRecord.query.tenant.tenantId = 'tenant:foreign';
      },
    ];
    for (const mutateCurrentOwners of mutations) {
      const f = fixture({ currentProducers: true, mutateCurrentOwners });
      const result = await bounded(f.run());
      abstained(result);
      noModelCalls(f, 1);
      eq(
        f.counters.currentContextAdapterReads,
        0,
        'invalid data-use preconditions must precede acquisition',
      );
      eq(f.outstanding(), 0);
    }
  },
);

currentProducerScenario(
  'actual current router and manifest checks refuse unavailable model or blocked upstream budget',
  async () => {
    for (const mutateCurrentOwners of [
      (entry) => {
        entry.modelHealth = null;
      },
      (entry) => {
        entry.modelHealth.observedAt = at(NOW - 20001);
      },
      (entry) => {
        entry.routingRecord.manifest.modelSha256 = '0'.repeat(64);
      },
      (entry) => {
        entry.routingRecord.routerRequest.budget.state = 'EXHAUSTED';
      },
    ]) {
      const f = fixture({ currentProducers: true, mutateCurrentOwners });
      abstained(await bounded(f.run()));
      noModelCalls(f, 1);
      eq(f.outstanding(), 0);
    }
  },
);

currentProducerScenario(
  'actual acquisition and minimization refuse nonpublic stale or provenance-free source content',
  async () => {
    for (const mutateCurrentOwners of [
      (entry) => {
        entry.sourceItem.classification = 'INTERNAL';
      },
      (entry) => {
        entry.sourceItem.provenanceReference = '';
      },
      (entry) => {
        entry.sourceItem.observedAt = at(NOW - 120000);
      },
      (entry) => {
        entry.sourceItem.tenant.tenantId = 'tenant:foreign';
      },
    ]) {
      const f = fixture({ currentProducers: true, mutateCurrentOwners });
      abstained(await bounded(f.run()));
      noModelCalls(f, 1);
      eq(f.counters.currentContextAdapterReads, 1);
      eq(f.outstanding(), 0);
    }
  },
);

currentProducerScenario(
  'actual current-source snapshot rejects an accessor without reading or disclosing its payload',
  async () => {
    let getterCalls = 0;
    const f = fixture({
      currentProducers: true,
      mutateCurrentOwners(entry) {
        Object.defineProperty(entry.sourceItem, 'payload', {
          enumerable: true,
          get() {
            getterCalls += 1;
            throw new Error('PRIVATE_MARKER_CURRENT_PRODUCER');
          },
        });
      },
    });
    const result = await bounded(f.run());
    abstained(result);
    eq(getterCalls, 0, 'a source accessor must not execute even inside canonical acquisition');
    noModelCalls(f, 1);
    eq(JSON.stringify(result).includes('PRIVATE_MARKER'), false);
    eq(f.outstanding(), 0);
  },
);

currentProducerScenario(
  'canonical current policy revocation during actual adapter acquisition prevents preparation',
  async () => {
    const started = deferred();
    const release = deferred();
    const f = fixture({
      currentProducers: true,
      async currentReadHook() {
        started.resolve();
        await release.promise;
      },
    });
    const pending = f.run();
    await bounded(started.promise);
    eq(f.counters.currentContextAdapterReads, 1);
    f.currentOwners().policySnapshot.rules[0].effect = 'DENY';
    release.resolve();
    abstained(await bounded(pending));
    noModelCalls(f, 1);
    eq(f.outstanding(), 0);
  },
);

currentProducerScenario(
  'owner identity drift during actual adapter acquisition cannot produce a cross-session preparation',
  async () => {
    const started = deferred();
    const release = deferred();
    const f = fixture({
      currentProducers: true,
      async currentReadHook() {
        started.resolve();
        await release.promise;
      },
    });
    const pending = f.run();
    await bounded(started.promise);
    f.currentOwners().contextRecord.binding.gatewayGeneration += 1;
    release.resolve();
    abstained(await bounded(pending));
    noModelCalls(f, 1);
    eq(f.outstanding(), 0);
  },
);

currentProducerScenario(
  'changing source content without changing its revision still invalidates the captured preparation',
  async () => {
    const f = fixture({
      currentProducers: true,
      currentPreparedHook({ f: current, prepared }) {
        ok(prepared !== null);
        const before = current.currentOwners().sourceItem.sourceRevision;
        current.currentOwners().sourceItem.payload = 'Outra informação pública.';
        eq(current.currentOwners().sourceItem.sourceRevision, before);
      },
    });
    abstained(await bounded(f.run()));
    noModelCalls(f, 1);
    eq(f.outstanding(), 0);
  },
);

const currentRevocations = [
  [
    'policy',
    (entry) => {
      entry.policySnapshot.rules[0].effect = 'DENY';
    },
  ],
  [
    'consent',
    (entry) => {
      entry.contextRecord.policyEvaluation.consent.status = 'REVOKED';
    },
  ],
  [
    'source',
    (entry) => {
      entry.sourceItem.sourceRevision = 'fixture-revision:v2';
    },
  ],
  [
    'strategy',
    (entry) => {
      entry.modelHealth = null;
    },
  ],
];

for (const [owner, revoke] of currentRevocations) {
  currentProducerScenario(
    `actual ${owner} owner change during credential acquisition prevents every model dispatch`,
    async () => {
      const started = deferred();
      const release = deferred();
      const f = fixture({
        currentProducers: true,
        async credentialHook() {
          started.resolve();
          await release.promise;
        },
      });
      const pending = f.run();
      await bounded(started.promise);
      eq(f.counters.transportCalls, 0);
      revoke(f.currentOwners());
      release.resolve();
      abstained(await bounded(pending));
      eq(f.counters.credentialReads, 1);
      eq(f.counters.transportCalls, 0);
      eq(f.outstanding(), 0);
    },
  );
}

for (const [owner, revoke] of currentRevocations) {
  currentProducerScenario(
    `actual ${owner} owner change in final W14 attestation prevents release of already generated text`,
    async () => {
      const started = deferred();
      const release = deferred();
      const f = fixture({
        currentProducers: true,
        async attestationHook({ readIndex, counters }) {
          if (readIndex !== 4) return;
          eq(counters.transportCalls, 1);
          started.resolve();
          await release.promise;
        },
      });
      const pending = f.run();
      await bounded(started.promise);
      revoke(f.currentOwners());
      const previousChecks = f.counters.sourceSyncChecks;
      release.resolve();
      const result = await bounded(pending);
      abstained(result);
      ok(
        f.counters.sourceSyncChecks > previousChecks,
        'W14 must invoke the actual source release guard',
      );
      eq(f.counters.transportCalls, 1);
      eq(JSON.stringify(result).includes(GENERATED_TEXT), false);
      eq(f.outstanding(), 0);
    },
  );
}

currentProducerScenario(
  'expired owner observation is not refreshed by current-record reads',
  async () => {
    const f = fixture({
      currentProducers: true,
      currentPreparedHook({ f: current, prepared }) {
        ok(prepared !== null);
        eq(current.currentOwners().contextRecord.expiresAtEpochMs, NOW + 4000);
        current.setNow(NOW + 4001);
      },
    });
    abstained(await bounded(f.run()));
    noModelCalls(f, 1);
    eq(f.currentOwners().contextRecord.observedAtEpochMs, NOW);
    eq(f.currentOwners().contextRecord.expiresAtEpochMs, NOW + 4000);
    eq(f.outstanding(), 0);
  },
);

currentProducerScenario(
  'bounded cancellation during actual acquisition fences further reads until the old read settles and then recovers',
  async () => {
    const started = deferred();
    const release = deferred();
    const f = fixture({
      currentProducers: true,
      async currentReadHook({ counters }) {
        if (counters.currentContextAdapterReads !== 1) return;
        started.resolve();
        await release.promise;
      },
    });
    const request = f.body();
    const pending = f.run(request);
    await bounded(started.promise);
    const cancellation = f.operation.cancel(request, f.binding);
    eq(cancellation.requested, true);
    noAuthority(cancellation, true);
    abstained(await bounded(pending), 'CANCELLED');
    // The source API deliberately returns null rather than exporting a BUSY result. Let outer
    // logical cancellation settle, then prove the actual retained W06 read fence rather than
    // assuming that every caller propagates the same diagnostic code as a native/HTTP client.
    await new Promise((resolveTurn) => setTimeout(resolveTurn, 0));
    abstained(await bounded(f.run(f.body('request:current-owner:pending-read'))));
    eq(f.counters.producerCalls, 2);
    eq(f.counters.currentContextAdapterReads, 1, 'no second read may start before quiescence');
    eq(f.counters.credentialReads, 0);
    eq(f.counters.transportCalls, 0);
    release.resolve();
    await new Promise((resolveTurn) => setTimeout(resolveTurn, 0));
    const result = await bounded(f.run(f.body('request:current-owner:recovered')));
    eq(result.status, 'GENERATED');
    eq(result.content, GENERATED_TEXT);
    noAuthority(result, true);
    eq(f.counters.producerCalls, 3);
    eq(f.counters.currentContextAdapterReads, 2);
    eq(f.counters.credentialReads, 1);
    eq(f.counters.transportCalls, 1);
    eq(f.outstanding(), 0);
  },
);

for (const entry of cases) {
  const before = assertions;
  const start = performance.now();
  await bounded(entry.run(), entry.name);
  ok(assertions > before, 'every declared scenario must execute assertions');
  results.push({
    name: entry.name,
    coverage: entry.coverage,
    verdict: 'PASS',
    assertions: assertions - before,
    elapsedMs: Math.round((performance.now() - start) * 1000) / 1000,
  });
}
const legacyResults = results.filter(
  (entry) => entry.coverage === 'LEGACY_INJECTED_PREPARATION_BOUNDARY_REGRESSION',
);
const currentProducerResults = results.filter(
  (entry) => entry.coverage === 'ACTUAL_W02_W05_W06_CURRENT_PREPARATION_COMPOSITION',
);
eq(
  legacyResults.length,
  34,
  'all previous boundary regression scenarios must remain; no skipped proofs',
);
eq(currentProducerResults.length, 19, 'all new actual current-producer scenarios must execute');
eq(results.length, 53, 'every declared scenario must execute');
eq(unexpectedFetchCalls, 0);
for (const identity of identities) {
  eq(
    sha256(readFileSync(resolve(root, identity.source))),
    identity.sourceSha256,
    'source changed during proof',
  );
  eq(
    sha256(readFileSync(resolve(root, identity.artifact))),
    identity.artifactSha256,
    'compiled artifact changed during proof',
  );
}
eq(
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  head,
  'HEAD changed during proof',
);
const finalWorktree = worktreeState();
if (!allowDirtyPreparation) {
  eq(finalWorktree.dirty, false, 'exact-HEAD proof left a dirty tree');
}
console.log(
  JSON.stringify(
    {
      proof: 'AURORA_OFFLINE_W14_CORE_SESSION_COMPOSITION',
      verdict: 'PASS',
      mode: allowDirtyPreparation ? 'LOCAL_PREPARATORY_SINGLE_TREE' : 'EXACT_HEAD_SINGLE_TREE',
      runtime: process.version,
      head,
      gitHeadTree,
      worktreeDirty,
      rawWorktreeDirty: initialWorktree.rawDirty,
      generatedUntrackedExclusions: {
        before: initialWorktree.generatedUntrackedExclusions,
        after: finalWorktree.generatedUntrackedExclusions,
      },
      scriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
      assertions,
      cases: results,
      coverageCounts: {
        legacyInjectedPreparationBoundaryRegressions: legacyResults.length,
        actualCurrentPreparationProducerComposition: currentProducerResults.length,
      },
      skipped: 0,
      unexpectedFetchCalls,
      syntheticFixtureCounters: totals,
      authorizesExecution: false,
      canInvokeTools: false,
      canGrantPermission: false,
      identities,
      limitations: [
        'All named W14 managers and W02/W05/W06 producers/consumers are actual compiled source modules from this one tree.',
        'The 34 legacy boundary regression scenarios deliberately inject a synthetic preparation orchestration; they do not prove the concrete current-source adapter.',
        'The separately counted current-producer scenarios invoke actual CurrentPublicModelContext and CurrentLocalModelPreparationSource, current-policy lookup/precheck/consent, acquisition, minimization, prompt compilation and current strategy routing.',
        'Authenticator, device attestation, W04 planning inputs, upstream owner/policy/consent/source records and readers, model health/manifest, credentials and model transport remain synthetic fixtures, not authenticated live authorities.',
        'The completion-denial case injects one explicit fault over an otherwise real GatewaySessionManager; it is not provider evidence.',
        'The global fetch is prohibited. No live HTTP/socket endpoint, model, GGUF integrity verification, Android/JNI, tablet or physical action was exercised.',
        'This proves bounded offline software composition only, not deployed core activation, W14 cryptographic peer authentication, data-consent attestation, native integration or final acceptance.',
      ],
    },
    null,
    2,
  ),
);
