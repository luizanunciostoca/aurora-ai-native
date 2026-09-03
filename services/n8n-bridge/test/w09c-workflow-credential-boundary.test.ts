// @ts-expect-error -- W09 harness intentionally has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- W09 harness intentionally has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { N8nWorkflowBinding } from '../src/bindings/index.js';
import {
  withResolvedN8nWorkflowCredential,
  type N8nWorkflowCredentialBackend,
  type N8nWorkflowCredentialBackendLookup,
  type N8nWorkflowCredentialReference,
} from '../src/credentials/index.js';

const TENANT_A = 'ten_01JW09CTENANTA000000000';
const TENANT_B = 'ten_01JW09CTENANTB000000000';
const WORKFLOW_HASH = `sha256:${'a'.repeat(64)}`;
const SOURCE_HASH = `sha256:${'b'.repeat(64)}`;
const NOW = '2026-09-03T08:15:00.000Z';

function binding(overrides: Partial<N8nWorkflowBinding> = {}): N8nWorkflowBinding {
  return {
    kind: 'N8N_WORKFLOW_BINDING',
    bindingId: 'w09.workflow.crm-sync',
    bindingVersion: '1.0.0',
    tenantId: TENANT_A,
    workflow: {
      workflowReference: 'n8n.workflow.crm-sync',
      workflowVersion: '42',
      workflowHash: WORKFLOW_HASH,
    },
    capability: {
      capabilityId: 'crm.lead.read',
      capabilityVersion: '2.1.0',
      registryVersion: 'registry.w04.r22',
    },
    provenance: {
      sourceKind: 'AURORA_NATIVE',
      sourceReference: 'aurora:w09:crm-sync',
      sourceHash: SOURCE_HASH,
      licenseStatus: 'AURORA_OWNED',
      sanitizedLineage: null,
    },
    credentialRequirements: [{ credentialReference: 'credref.crm.primary', integration: 'crm' }],
    compatibility: {
      contractVersion: '1.0.0',
      requiredTargetClasses: ['PROVIDER'],
      integrationPrerequisites: ['crm'],
    },
    status: 'ACTIVE',
    registeredAt: '2026-09-03T08:00:00.000Z',
    supersedesVersion: null,
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

function reference(
  overrides: Partial<N8nWorkflowCredentialReference> = {},
): N8nWorkflowCredentialReference {
  return {
    kind: 'N8N_WORKFLOW_CREDENTIAL_REFERENCE',
    schemaVersion: '1.0.0',
    credentialReference: 'credref.crm.primary',
    tenantId: TENANT_A,
    bindingId: 'w09.workflow.crm-sync',
    bindingVersion: '1.0.0',
    workflowReference: 'n8n.workflow.crm-sync',
    workflowVersion: '42',
    workflowHash: WORKFLOW_HASH,
    integration: 'crm',
    provider: 'crm-provider',
    state: 'ACTIVE',
    credentialVersion: 7,
    updatedAt: '2026-09-03T08:05:00.000Z',
    expiresAt: '2026-09-03T09:00:00.000Z',
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

function request(
  credentialReference: unknown = reference(),
  bindingValue: N8nWorkflowBinding = binding(),
): Record<string, unknown> {
  return {
    tenantId: TENANT_A,
    binding: bindingValue,
    credentialReference,
    expectedIntegration: 'crm',
    expectedProvider: 'crm-provider',
    now: NOW,
  };
}

function backend(
  handler: (
    lookup: N8nWorkflowCredentialBackendLookup,
    consume: (credential: string) => void | Promise<void>,
  ) => void | Promise<void>,
): N8nWorkflowCredentialBackend {
  return {
    async withCredential(lookup, consume) {
      await handler(lookup, consume);
    },
  };
}

test('W09-C resolves one exact opaque reference without returning secret material or authority', async () => {
  let observedCredential = '';
  let observedLookup: N8nWorkflowCredentialBackendLookup | undefined;
  const secret = 'super-secret-runtime-value';

  const result = await withResolvedN8nWorkflowCredential(
    request(),
    backend(async (lookup, consume) => {
      observedLookup = lookup;
      await consume(secret);
    }),
    (credential) => {
      observedCredential = credential;
    },
  );

  assert.equal(result.ok, true);
  assert.equal(observedCredential, secret);
  assert.deepEqual(observedLookup, {
    credentialReference: 'credref.crm.primary',
    tenantId: TENANT_A,
    bindingId: 'w09.workflow.crm-sync',
    bindingVersion: '1.0.0',
    workflowReference: 'n8n.workflow.crm-sync',
    workflowVersion: '42',
    workflowHash: WORKFLOW_HASH,
    integration: 'crm',
    provider: 'crm-provider',
    credentialVersion: 7,
  });
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(observedLookup).includes(secret), false);
  assert.deepEqual(result, {
    ok: true,
    credentialReference: 'credref.crm.primary',
    credentialVersion: 7,
    consumedAt: NOW,
    authorizesExecution: false,
    canGrantPermission: false,
  });
});

test('W09-C rejects wrong-tenant binding/reference before backend access', async () => {
  let backendCalls = 0;
  const wrongTenantBinding = binding({ tenantId: TENANT_B });
  const result = await withResolvedN8nWorkflowCredential(
    request(reference({ tenantId: TENANT_B }), wrongTenantBinding),
    backend(() => {
      backendCalls += 1;
    }),
    () => undefined,
  );

  assert.deepEqual(result, {
    ok: false,
    error: 'TENANT_MISMATCH',
    authorizesExecution: false,
    canGrantPermission: false,
  });
  assert.equal(backendCalls, 0);
});

test('W09-C fails closed on binding and workflow identity drift', async () => {
  for (const [candidate, expected] of [
    [reference({ bindingVersion: '2.0.0' }), 'BINDING_MISMATCH'],
    [reference({ workflowReference: 'n8n.workflow.other' }), 'WORKFLOW_MISMATCH'],
    [reference({ workflowVersion: '43' }), 'WORKFLOW_MISMATCH'],
    [reference({ workflowHash: `sha256:${'c'.repeat(64)}` }), 'WORKFLOW_MISMATCH'],
  ] as const) {
    let backendCalls = 0;
    const result = await withResolvedN8nWorkflowCredential(
      request(candidate),
      backend(() => {
        backendCalls += 1;
      }),
      () => undefined,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, expected);
    assert.equal(backendCalls, 0);
  }
});

test('W09-C requires exact integration/provider context and a declared W09-A requirement', async () => {
  const integrationMismatch = request();
  integrationMismatch.expectedIntegration = 'email';
  const providerMismatch = request();
  providerMismatch.expectedProvider = 'other-provider';

  for (const [candidate, expected] of [
    [integrationMismatch, 'INTEGRATION_MISMATCH'],
    [providerMismatch, 'PROVIDER_MISMATCH'],
    [request(reference({ credentialReference: 'credref.crm.unlisted' })), 'REFERENCE_NOT_REQUIRED'],
  ] as const) {
    let backendCalls = 0;
    const result = await withResolvedN8nWorkflowCredential(
      candidate,
      backend(() => {
        backendCalls += 1;
      }),
      () => undefined,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, expected);
    assert.equal(backendCalls, 0);
  }
});

test('W09-C rejects candidate, revoked, rotated, stale and expired credential state', async () => {
  const cases: readonly [Record<string, unknown>, string][] = [
    [request(reference(), binding({ status: 'CANDIDATE' })), 'BINDING_UNAVAILABLE'],
    [request(reference({ state: 'REVOKED' })), 'CREDENTIAL_REVOKED'],
    [request(reference({ state: 'ROTATED' })), 'CREDENTIAL_ROTATED'],
    [request(reference({ state: 'STALE' })), 'CREDENTIAL_STALE'],
    [request(reference({ expiresAt: '2026-09-03T08:15:00.000Z' })), 'CREDENTIAL_EXPIRED'],
  ];

  for (const [candidate, expected] of cases) {
    let backendCalls = 0;
    const result = await withResolvedN8nWorkflowCredential(
      candidate,
      backend(() => {
        backendCalls += 1;
      }),
      () => undefined,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, expected);
    assert.equal(backendCalls, 0);
  }
});

test('W09-C rejects future reference state and malformed extra fields before backend access', async () => {
  const future = reference({ updatedAt: '2026-09-03T08:16:00.000Z' });
  const extra = { ...reference(), fallbackCredentialReference: 'credref.global.default' };

  for (const candidate of [future, extra]) {
    let backendCalls = 0;
    const result = await withResolvedN8nWorkflowCredential(
      request(candidate),
      backend(() => {
        backendCalls += 1;
      }),
      () => undefined,
    );
    assert.deepEqual(result, {
      ok: false,
      error: 'REFERENCE_MALFORMED',
      authorizesExecution: false,
      canGrantPermission: false,
    });
    assert.equal(backendCalls, 0);
  }
});

test('W09-C prohibits secret, pinData and account-id material without invoking accessors', async () => {
  const forbiddenInputs = [
    { ...request(), secretValue: 'must-never-enter-w09' },
    request({ ...reference(), pinData: { authorization: 'private' } }),
    request({ ...reference(), accountId: 'provider-account-raw-id' }),
  ];

  for (const candidate of forbiddenInputs) {
    let backendCalls = 0;
    const result = await withResolvedN8nWorkflowCredential(
      candidate,
      backend(() => {
        backendCalls += 1;
      }),
      () => undefined,
    );
    assert.deepEqual(result, {
      ok: false,
      error: 'SENSITIVE_MATERIAL_PROHIBITED',
      authorizesExecution: false,
      canGrantPermission: false,
    });
    assert.equal(backendCalls, 0);
  }

  let getterCalls = 0;
  const accessor = { ...reference() } as Record<string, unknown>;
  Object.defineProperty(accessor, 'credentialReference', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'credref.crm.primary';
    },
  });
  const accessorResult = await withResolvedN8nWorkflowCredential(
    request(accessor),
    backend(() => undefined),
    () => undefined,
  );
  assert.equal(accessorResult.ok, false);
  if (!accessorResult.ok) assert.equal(accessorResult.error, 'REQUEST_MALFORMED');
  assert.equal(getterCalls, 0);
});

test('W09-C rejects inherited reference objects without backend access', async () => {
  const inherited = Object.assign(Object.create({ state: 'ACTIVE' }), reference());
  let backendCalls = 0;
  const result = await withResolvedN8nWorkflowCredential(
    request(inherited),
    backend(() => {
      backendCalls += 1;
    }),
    () => undefined,
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'REQUEST_MALFORMED');
  assert.equal(backendCalls, 0);
});

test('W09-C fails closed when backend callback protocol is missing, repeated or empty', async () => {
  const missing = await withResolvedN8nWorkflowCredential(
    request(),
    backend(() => undefined),
    () => undefined,
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error, 'BACKEND_PROTOCOL_VIOLATION');

  const empty = await withResolvedN8nWorkflowCredential(
    request(),
    backend((_lookup, consume) => consume('')),
    () => undefined,
  );
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.error, 'BACKEND_PROTOCOL_VIOLATION');

  const repeated = await withResolvedN8nWorkflowCredential(
    request(),
    backend(async (_lookup, consume) => {
      await consume('first-secret');
      await consume('second-secret');
    }),
    () => undefined,
  );
  assert.equal(repeated.ok, false);
  if (!repeated.ok) assert.equal(repeated.error, 'CREDENTIAL_CONSUMPTION_UNCERTAIN');
});

test('W09-C distinguishes pre-consumption unavailability from post-consumption uncertainty', async () => {
  const unavailable = await withResolvedN8nWorkflowCredential(
    request(),
    backend(() => {
      throw new Error('backend unavailable with secret-like diagnostics');
    }),
    () => undefined,
  );
  assert.deepEqual(unavailable, {
    ok: false,
    error: 'CREDENTIAL_UNAVAILABLE',
    authorizesExecution: false,
    canGrantPermission: false,
  });

  let consumed = false;
  const uncertain = await withResolvedN8nWorkflowCredential(
    request(),
    backend(async (_lookup, consume) => {
      await consume('ephemeral-secret');
      throw new Error('backend connection lost after callback');
    }),
    () => {
      consumed = true;
    },
  );
  assert.equal(consumed, true);
  assert.deepEqual(uncertain, {
    ok: false,
    error: 'CREDENTIAL_CONSUMPTION_UNCERTAIN',
    authorizesExecution: false,
    canGrantPermission: false,
  });
});

test('W09-C sanitizes consumer failure and never returns thrown credential-bearing diagnostics', async () => {
  const secret = 'credential-that-must-not-leak';
  const result = await withResolvedN8nWorkflowCredential(
    request(),
    backend((_lookup, consume) => consume(secret)),
    (credential) => {
      throw new Error(`consumer failed after seeing ${credential}`);
    },
  );

  assert.deepEqual(result, {
    ok: false,
    error: 'CONSUMER_FAILED',
    authorizesExecution: false,
    canGrantPermission: false,
  });
  assert.equal(JSON.stringify(result).includes(secret), false);
});
