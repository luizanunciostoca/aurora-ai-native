// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import assert from 'node:assert/strict';
// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import test from 'node:test';
import { validateSeedAdjudication } from '../../registries/src/capabilities/adjudication.ts';
import {
  LEGACY_CAPABILITY_SEED_ADJUDICATIONS,
  LEGACY_CAPABILITY_SEED_COUNT,
} from '../../registries/src/capabilities/legacy-seed-adjudications.ts';

test('W04-B explicitly adjudicates the complete 69-seed legacy catalog exactly once', () => {
  assert.equal(LEGACY_CAPABILITY_SEED_ADJUDICATIONS.length, LEGACY_CAPABILITY_SEED_COUNT);
  const seedIds = LEGACY_CAPABILITY_SEED_ADJUDICATIONS.map((entry) => entry.seedId);
  assert.equal(new Set(seedIds).size, LEGACY_CAPABILITY_SEED_COUNT);

  for (const adjudication of LEGACY_CAPABILITY_SEED_ADJUDICATIONS) {
    assert.deepEqual(validateSeedAdjudication(adjudication), { status: 'VALID' });
  }
});

test('W04-B rejects agent-internal/generic seeds and decomposes combined browser scroll', () => {
  const bySeed = new Map(
    LEGACY_CAPABILITY_SEED_ADJUDICATIONS.map((entry) => [entry.seedId, entry]),
  );

  assert.equal(bySeed.get('agent.plan.phase.advance')?.decision, 'REJECT');
  assert.equal(bySeed.get('agent.task.complete')?.decision, 'REJECT');
  assert.equal(bySeed.get('agent.plan.update')?.decision, 'REJECT');
  assert.equal(bySeed.get('external.service.invoke')?.decision, 'REJECT');
  assert.equal(bySeed.get('productivity.action.invoke')?.decision, 'REJECT');
  assert.deepEqual(bySeed.get('browser.scroll')?.resultingCapabilityIds, [
    'browser.scroll.up',
    'browser.scroll.down',
  ]);
});

test('W04-B accepts high-risk vocabulary without turning it into implementation or authority', () => {
  const bySeed = new Map(
    LEGACY_CAPABILITY_SEED_ADJUDICATIONS.map((entry) => [entry.seedId, entry]),
  );

  for (const seedId of [
    'browser.console.execute',
    'file.delete',
    'service.deploy.backend',
    'shell.execute',
    'device.power.shutdown',
  ]) {
    const entry = bySeed.get(seedId);
    assert.equal(entry?.decision, 'ACCEPT');
    assert.match(entry?.reason ?? '', /implementation|authority|execution|downstream/i);
  }
});
