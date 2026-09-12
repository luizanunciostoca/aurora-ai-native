// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import assert from 'node:assert/strict';
// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import test from 'node:test';
import type { CorrelationId, TenantId } from '../../contracts/src/ids/types.ts';
import {
  createCapabilityRegistry,
  type CapabilityDescriptor,
} from '../../registries/src/capabilities/registry.ts';
import {
  createUserShortcutRegistry,
  normalizeShortcutAlias,
  resolveUserShortcut,
  type UserShortcutEntry,
} from '../src/shortcut-registry/index.ts';

const tenant = 'ten_01J00000000000000000000000' as TenantId;
const otherTenant = 'ten_01J00000000000000000000001' as TenantId;
const correlation = 'cor_01J00000000000000000000000' as CorrelationId;
const now = Date.parse('2026-09-12T19:00:00.000Z');

function capability(overrides: Partial<CapabilityDescriptor> = {}): CapabilityDescriptor {
  return {
    capabilityId: 'device.app.launch',
    semanticVersion: '1.0.0',
    name: 'Launch installed application',
    description: 'Target-neutral Android application launch capability.',
    supportedTargetKinds: ['DEVICE'],
    compatibilityKeys: ['android.app.launch.v1'],
    requiredPermissionClaims: ['device.app.launch'],
    preconditions: ['app-installed', 'launchable'],
    riskClass: 'LOW',
    sideEffectClass: 'LOCAL_SIDE_EFFECT',
    readbackStrategy: 'STATE_COMPARE',
    evidenceStrategy: 'REQUIRED',
    availability: {
      state: 'AVAILABLE',
      observedAt: '2026-09-12T18:59:00.000Z',
      maxAgeMs: 600_000,
      source: 'android-app-discovery',
    },
    bindings: [
      {
        bindingId: 'android-package:com.spotify.music',
        targetKind: 'DEVICE',
        compatibilityKey: 'android.app.launch.v1',
        tenantId: tenant,
        availability: {
          state: 'AVAILABLE',
          observedAt: '2026-09-12T18:59:00.000Z',
          maxAgeMs: 600_000,
          source: 'android-app-discovery',
        },
      },
    ],
    provenance: {
      sourceKind: 'AURORA_NATIVE',
      sourceRef: 'W15:android-app-discovery',
    },
    ...overrides,
  };
}

function shortcut(overrides: Partial<UserShortcutEntry> = {}): UserShortcutEntry {
  return {
    shortcutId: 'shortcut:spotify',
    tenantId: tenant,
    aliases: ['Spotify', ' abrir   spotify '],
    target: {
      kind: 'CAPABILITY_BINDING',
      capabilityId: 'device.app.launch',
      bindingId: 'android-package:com.spotify.music',
    },
    enabled: true,
    provenance: {
      sourceKind: 'USER',
      sourceRef: 'settings:voice-shortcuts',
    },
    ...overrides,
  };
}

test('normalizes aliases deterministically without fuzzy execution matching', () => {
  assert.equal(normalizeShortcutAlias('  ABRIR   Spotify  '), 'abrir spotify');
  assert.equal(normalizeShortcutAlias('Ｓｐｏｔｉｆｙ'), 'spotify');
});

test('resolves an exact normalized alias to a capability candidate without authority', () => {
  const capabilities = createCapabilityRegistry('w04-shortcuts.1', [capability()]);
  assert.equal(capabilities.status, 'CREATED');
  if (capabilities.status !== 'CREATED') return;
  const shortcuts = createUserShortcutRegistry('shortcuts.1', [shortcut()], capabilities.registry);
  assert.equal(shortcuts.status, 'CREATED');
  if (shortcuts.status !== 'CREATED') return;

  const resolved = resolveUserShortcut(
    shortcuts.registry,
    capabilities.registry,
    tenant,
    correlation,
    'ABRIR    SPOTIFY',
    now,
  );
  assert.equal(resolved.status, 'RESOLVED');
  if (resolved.status !== 'RESOLVED') return;
  assert.equal(resolved.capabilityId, 'device.app.launch');
  assert.equal(resolved.bindingId, 'android-package:com.spotify.music');
  assert.equal(resolved.currentAvailability, 'CURRENT_AVAILABLE');
  assert.equal(resolved.authorizesExecution, false);
  assert.equal(resolved.provesExecutionSuccess, false);
  assert.equal(resolved.retryAuthorized, false);
});

test('rejects duplicate normalized aliases and unknown capability targets', () => {
  const capabilities = createCapabilityRegistry('w04-shortcuts.1', [capability()]);
  assert.equal(capabilities.status, 'CREATED');
  if (capabilities.status !== 'CREATED') return;

  const duplicate = createUserShortcutRegistry(
    'shortcuts.1',
    [shortcut(), shortcut({ shortcutId: 'shortcut:spotify-2', aliases: [' spotify '] })],
    capabilities.registry,
  );
  assert.equal(duplicate.status, 'REJECTED');
  if (duplicate.status === 'REJECTED') assert.equal(duplicate.code, 'DUPLICATE_ALIAS');

  const unknown = createUserShortcutRegistry(
    'shortcuts.1',
    [shortcut({ target: { kind: 'CAPABILITY', capabilityId: 'shell.execute' } })],
    capabilities.registry,
  );
  assert.equal(unknown.status, 'REJECTED');
  if (unknown.status === 'REJECTED') assert.equal(unknown.code, 'UNKNOWN_CAPABILITY');
});

test('preserves tenant isolation and never falls through to a cross-tenant binding', () => {
  const capabilities = createCapabilityRegistry('w04-shortcuts.1', [capability()]);
  assert.equal(capabilities.status, 'CREATED');
  if (capabilities.status !== 'CREATED') return;
  const shortcuts = createUserShortcutRegistry('shortcuts.1', [shortcut()], capabilities.registry);
  assert.equal(shortcuts.status, 'CREATED');
  if (shortcuts.status !== 'CREATED') return;

  const result = resolveUserShortcut(
    shortcuts.registry,
    capabilities.registry,
    otherTenant,
    correlation,
    'spotify',
    now,
  );
  assert.deepEqual(result, { status: 'NOT_FOUND', authorizesExecution: false });
});

test('rejects a shortcut whose capability binding belongs to another tenant', () => {
  const foreign = capability({
    bindings: [
      {
        bindingId: 'android-package:com.spotify.music',
        targetKind: 'DEVICE',
        compatibilityKey: 'android.app.launch.v1',
        tenantId: otherTenant,
        availability: {
          state: 'AVAILABLE',
          observedAt: '2026-09-12T18:59:00.000Z',
          maxAgeMs: 600_000,
          source: 'android-app-discovery',
        },
      },
    ],
  });
  const capabilities = createCapabilityRegistry('w04-shortcuts.1', [foreign]);
  assert.equal(capabilities.status, 'CREATED');
  if (capabilities.status !== 'CREATED') return;

  const result = createUserShortcutRegistry('shortcuts.1', [shortcut()], capabilities.registry);
  assert.equal(result.status, 'REJECTED');
  if (result.status === 'REJECTED') assert.equal(result.code, 'TENANT_MISMATCH');
});
