// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import test from 'node:test';

import { TransientLocalHostInstanceProbe } from '../local-host-instance-probe.js';

test('creates one bounded non-authoritative identity per live host start', () => {
  const probe = new TransientLocalHostInstanceProbe();
  assert.equal(probe.current('DEVICE_GATEWAY'), null);

  const first = probe.start();
  assert.match(first, /^whi_[a-f0-9]{64}$/u);
  assert.throws(() => probe.start(), /already started/u);

  const gateway = probe.current('DEVICE_GATEWAY');
  const bootstrap = probe.current('BOOTSTRAP_EXCHANGE');
  assert.deepEqual(gateway, {
    kind: 'LOCAL_HOST_INSTANCE',
    hostInstanceId: first,
    listenerRole: 'DEVICE_GATEWAY',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
    physicalEvidenceStatus: 'NOT_RUN',
  });
  assert.deepEqual(bootstrap, {
    ...gateway,
    listenerRole: 'BOOTSTRAP_EXCHANGE',
  });
  assert.equal(Object.isFrozen(gateway), true);
  assert.equal(Object.isFrozen(bootstrap), true);

  assert.throws(() => probe.stop(`whi_${'0'.repeat(64)}`), /changed before stop/u);
  assert.equal(probe.current('DEVICE_GATEWAY')?.hostInstanceId, first);
  probe.stop(first);
  assert.equal(probe.current('BOOTSTRAP_EXCHANGE'), null);

  const second = probe.start();
  assert.match(second, /^whi_[a-f0-9]{64}$/u);
  assert.notEqual(second, first);
  probe.stop(second);
});
