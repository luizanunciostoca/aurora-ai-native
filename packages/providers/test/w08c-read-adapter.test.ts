// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { ProviderExecutionTargetReference } from '@aurora/contracts/execution-target';
import type { ProviderExternalId, TenantId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';

import type { ProviderBindingRecord } from '../src/bindings/index.js';
import type { CredentialBackend, SecretReferenceRecord } from '../src/credentials/index.js';
import * as readApi from '../src/read/index.js';
import {
  executeProviderRead,
  type ProviderReadAdapter,
  type ProviderReadRequest,
  type ProviderReadTransportRequest,
} from '../src/read/index.js';

const VERSION = '1.0.0' as ContractVersion;
const NOW = '2026-09-03T01:00:00Z' as Rfc3339Timestamp;
const OBSERVED = '2026-09-03T00:59:00Z' as Rfc3339Timestamp;
const TENANT_A = 'ten_01JTESTTENANTA000000000000' as TenantId;
const TENANT_B = 'ten_01JTESTTENANTB000000000000' as TenantId;
const ACCOUNT = 'act_123' as ProviderExternalId;
const OTHER_ACCOUNT = 'act_999' as ProviderExternalId;
const CREDENTIAL = ['fixture', 'transient', 'read', 'credential'].join('-');

function binding(overrides: Partial<ProviderBindingRecord> = {}): ProviderBindingRecord {
  return {
    kind: 'ProviderBindingRecord',
    schemaVersion: VERSION,
    bindingReference: 'provider-binding-meta-account-1',
    tenant: { tenantId: TENANT_A },
    provider: 'META',
    accountReference: ACCOUNT,
    targetType: 'INSTAGRAM_ACCOUNT',
    targetReference: 'ig_external_1' as ProviderExternalId,
    state: 'ACTIVE',
    verificationState: 'VERIFIED',
    bindingVersion: 3,
    updatedAt: NOW,
    authorizesExecution: false,
    ...overrides,
  };
}

function secretReference(overrides: Partial<SecretReferenceRecord> = {}): SecretReferenceRecord {
  return {
    kind: 'SecretReferenceRecord',
    schemaVersion: VERSION,
    secretReference: 'secretref/meta/account/read-primary',
    tenant: { tenantId: TENANT_A },
    provider: 'META',
    accountReference: ACCOUNT,
    bindingReference: 'provider-binding-meta-account-1',
    state: 'ACTIVE',
    credentialVersion: 4,
    updatedAt: NOW,
    authorizesExecution: false,
    ...overrides,
  };
}

function target(
  overrides: Partial<ProviderExecutionTargetReference> = {},
): ProviderExecutionTargetReference {
  return {
    schemaVersion: VERSION,
    kind: 'PROVIDER',
    provider: 'META',
    accountReference: ACCOUNT,
    targetType: 'INSTAGRAM_ACCOUNT',
    targetReference: 'ig_external_1',
    ...overrides,
  };
}

function request(overrides: Partial<ProviderReadRequest> = {}): ProviderReadRequest {
  return {
    tenant: { tenantId: TENANT_A },
    executionTarget: target(),
    binding: binding(),
    secretReference: secretReference(),
    now: NOW,
    correlationReference: 'cor_w08c_read_1',
    operation: 'instagram.media.list',
    fields: ['id', 'timestamp'],
    query: { limit: 2, published: true },
    limits: { maxPages: 2, maxItems: 4 },
    ...overrides,
  };
}

function credentialBackend(onCall?: () => void): CredentialBackend {
  return {
    async withCredential(_lookup, consume) {
      onCall?.();
      await consume(CREDENTIAL);
    },
  };
}

test('W08-C reads bounded pages with transient credentials and normalized observation metadata', async () => {
  const calls: ProviderReadTransportRequest[] = [];
  const adapter: ProviderReadAdapter = {
    async readPage(input, credential) {
      assert.equal(credential, CREDENTIAL);
      calls.push(input);
      if (calls.length === 1) {
        return {
          ok: true,
          page: {
            items: [{ id: 'media-1' }],
            observedAt: OBSERVED,
            nextCursorToken: 'cursor-2',
            providerRevision: 'rev-10',
            rateLimit: { remaining: 9, limit: 10 },
          },
        };
      }
      return {
        ok: true,
        page: {
          items: [{ id: 'media-2' }],
          observedAt: OBSERVED,
          providerRevision: 'rev-11',
        },
      };
    },
  };

  const result = await executeProviderRead(request(), {
    credentials: credentialBackend(),
    adapter,
  });

  assert.equal(result.ok, true);
  assert.equal(result.authorizesExecution, false);
  if (!result.ok) return;
  assert.equal(result.pagesRead, 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.provider, 'META');
  assert.equal(result.accountReference, ACCOUNT);
  assert.equal(result.bindingReference, 'provider-binding-meta-account-1');
  assert.equal(result.providerRevision, 'rev-11');
  assert.equal(result.continuationCursor, undefined);
  assert.equal(calls[0]?.cursorToken, undefined);
  assert.equal(calls[1]?.cursorToken, 'cursor-2');
  assert.equal(
    calls.every((call) => call.itemBudget <= 4),
    true,
  );
  assert.equal(JSON.stringify(result).includes(CREDENTIAL), false);
});

test('W08-C stops at page budget and scopes continuation cursor to the exact request', async () => {
  const adapter: ProviderReadAdapter = {
    async readPage() {
      return {
        ok: true,
        page: {
          items: [{ id: 'media-1' }],
          observedAt: OBSERVED,
          nextCursorToken: 'cursor-next',
        },
      };
    },
  };

  const first = await executeProviderRead(request({ limits: { maxPages: 1, maxItems: 10 } }), {
    credentials: credentialBackend(),
    adapter,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const continuationCursor = first.continuationCursor;
  assert.ok(continuationCursor);
  if (continuationCursor === undefined) return;

  let resumedCursor: string | undefined;
  const resumed = await executeProviderRead(
    request({
      cursor: continuationCursor,
      limits: { maxPages: 1, maxItems: 10 },
    }),
    {
      credentials: credentialBackend(),
      adapter: {
        async readPage(input) {
          resumedCursor = input.cursorToken;
          return { ok: true, page: { items: [], observedAt: OBSERVED } };
        },
      },
    },
  );
  assert.equal(resumed.ok, true);
  assert.equal(resumedCursor, 'cursor-next');
});

test('W08-C rejects cursor scope reuse across a different query before credential/provider access', async () => {
  let backendCalls = 0;
  let adapterCalls = 0;
  const seed = await executeProviderRead(request({ limits: { maxPages: 1, maxItems: 10 } }), {
    credentials: credentialBackend(),
    adapter: {
      async readPage() {
        return {
          ok: true,
          page: { items: [], observedAt: OBSERVED, nextCursorToken: 'cursor-scope' },
        };
      },
    },
  });
  assert.equal(seed.ok, true);
  if (!seed.ok || seed.continuationCursor === undefined) return;

  const result = await executeProviderRead(
    request({ cursor: seed.continuationCursor, query: { limit: 99 } }),
    {
      credentials: credentialBackend(() => {
        backendCalls += 1;
      }),
      adapter: {
        async readPage() {
          adapterCalls += 1;
          return { ok: true, page: { items: [], observedAt: OBSERVED } };
        },
      },
    },
  );

  assert.deepEqual(result, {
    ok: false,
    error: 'CURSOR_SCOPE_MISMATCH',
    authorizesExecution: false,
  });
  assert.equal(backendCalls, 0);
  assert.equal(adapterCalls, 0);
});

test('W08-C fails closed on wrong tenant/account binding before credential resolution', async () => {
  let backendCalls = 0;
  const dependencies = {
    credentials: credentialBackend(() => {
      backendCalls += 1;
    }),
    adapter: {
      async readPage() {
        throw new Error('must not be called');
      },
    } satisfies ProviderReadAdapter,
  };

  const wrongAccount = await executeProviderRead(
    request({ executionTarget: target({ accountReference: OTHER_ACCOUNT }) }),
    dependencies,
  );
  assert.equal(wrongAccount.ok, false);
  if (!wrongAccount.ok) assert.equal(wrongAccount.error, 'BINDING_UNAVAILABLE');

  const wrongTenant = await executeProviderRead(
    request({ tenant: { tenantId: TENANT_B } }),
    dependencies,
  );
  assert.equal(wrongTenant.ok, false);
  if (!wrongTenant.ok) assert.equal(wrongTenant.error, 'BINDING_UNAVAILABLE');
  assert.equal(backendCalls, 0);
});

test('W08-C rejects incompatible credential metadata before provider adapter access', async () => {
  let adapterCalls = 0;
  const result = await executeProviderRead(
    request({
      secretReference: secretReference({ accountReference: OTHER_ACCOUNT }),
    }),
    {
      credentials: credentialBackend(),
      adapter: {
        async readPage() {
          adapterCalls += 1;
          return { ok: true, page: { items: [], observedAt: OBSERVED } };
        },
      },
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'CREDENTIAL_UNAVAILABLE');
  assert.equal(adapterCalls, 0);
});

test('W08-C rejects over-budget pages and repeated cursors as adapter protocol violations', async () => {
  const overBudget = await executeProviderRead(request({ limits: { maxPages: 1, maxItems: 1 } }), {
    credentials: credentialBackend(),
    adapter: {
      async readPage() {
        return {
          ok: true,
          page: { items: [{ id: 1 }, { id: 2 }], observedAt: OBSERVED },
        };
      },
    },
  });
  assert.equal(overBudget.ok, false);
  if (!overBudget.ok) assert.equal(overBudget.error, 'ADAPTER_PROTOCOL_VIOLATION');

  let call = 0;
  const repeated = await executeProviderRead(request(), {
    credentials: credentialBackend(),
    adapter: {
      async readPage() {
        call += 1;
        return {
          ok: true,
          page: {
            items: [],
            observedAt: OBSERVED,
            nextCursorToken: 'same-cursor',
          },
        };
      },
    },
  });
  assert.equal(repeated.ok, false);
  if (!repeated.ok) assert.equal(repeated.error, 'ADAPTER_PROTOCOL_VIOLATION');
  assert.equal(call, 2);
});

test('W08-C normalizes provider errors without leaking raw credential material', async () => {
  const result = await executeProviderRead(request(), {
    credentials: credentialBackend(),
    adapter: {
      async readPage(_input, credential) {
        assert.equal(credential, CREDENTIAL);
        return { ok: false, error: 'RATE_LIMITED', retryAfterMs: 2_000 };
      },
    },
  });

  assert.deepEqual(result, {
    ok: false,
    error: 'RATE_LIMITED',
    retryAfterMs: 2_000,
    authorizesExecution: false,
  });
  assert.equal(JSON.stringify(result).includes(CREDENTIAL), false);
});

test('W08-C fails closed on malformed query/accessor input and exposes no write/raw-client API', async () => {
  let backendCalls = 0;
  const accessorQuery = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(accessorQuery, 'danger', {
    enumerable: true,
    get() {
      throw new Error('accessor must never execute');
    },
  });

  const result = await executeProviderRead(
    request({ query: accessorQuery as ProviderReadRequest['query'] }),
    {
      credentials: credentialBackend(() => {
        backendCalls += 1;
      }),
      adapter: {
        async readPage() {
          throw new Error('must not run');
        },
      },
    },
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'REQUEST_MALFORMED');
  assert.equal(backendCalls, 0);

  const runtimeExports = Object.keys(readApi).sort();
  assert.deepEqual(runtimeExports, [
    'PROVIDER_READ_ERRORS',
    'PROVIDER_READ_TRANSPORT_ERRORS',
    'executeProviderRead',
  ]);
  assert.equal(
    runtimeExports.some((name) => /write|mutat|client/iu.test(name)),
    false,
  );
});
