import type { CapabilitySeedAdjudication } from './adjudication';

export const LEGACY_CAPABILITY_SEED_CATALOG_SOURCE =
  'AURORA_LEGACY_CAPABILITY_SEED_CATALOG_2026-08-31' as const;

const ACCEPTED_SEEDS = [
  'task.schedule',
  'browser.navigate',
  'browser.view',
  'browser.interact.click',
  'browser.interact.input',
  'browser.pointer.move',
  'browser.key.press',
  'browser.capture.image',
  'browser.select',
  'browser.console.view',
  'browser.console.execute',
  'file.read',
  'file.write',
  'file.append',
  'file.replace',
  'file.open',
  'file.directory.list',
  'file.delete',
  'file.search',
  'search.web',
  'search.api',
  'search.image',
  'media.generate.image',
  'media.generate.speech',
  'user.prompt',
  'notification.show',
  'service.deploy.backend',
  'service.deploy.frontend',
  'service.port.expose',
  'shell.execute',
  'shell.input',
  'shell.terminate',
  'shell.view',
  'shell.wait',
  'presentation.initialize',
  'presentation.present',
  'app.open',
  'app.close',
  'app.focus',
  'app.list_running',
  'system.info.read',
  'system.cpu.read',
  'system.memory.read',
  'audio.volume.set',
  'audio.volume.read',
  'audio.mute.set',
  'device.power.shutdown',
  'device.power.restart',
  'device.power.logout',
  'device.power.sleep',
  'device.power.hibernate',
  'voice.listen.start',
  'voice.listen.stop',
  'voice.wake.detect',
  'voice.transcript.process',
  'voice.speak',
  'presence.state.read',
  'email.send',
  'system.health.read',
  'system.logs.read',
  'system.metrics.read',
  'workspace.settings.read',
  'workspace.settings.update',
] as const;

const REJECTED_SEEDS = [
  'agent.plan.phase.advance',
  'agent.task.complete',
  'agent.plan.update',
  'external.service.invoke',
  'productivity.action.invoke',
] as const;

export const LEGACY_CAPABILITY_SEED_ADJUDICATIONS: readonly CapabilitySeedAdjudication[] = [
  ...ACCEPTED_SEEDS.map(
    (seedId): CapabilitySeedAdjudication => ({
      adjudicationId: `W04-B:${seedId}`,
      seedId,
      sourceRef: `${LEGACY_CAPABILITY_SEED_CATALOG_SOURCE}:${seedId}`,
      decision: 'ACCEPT',
      resultingCapabilityIds: [seedId],
      reason:
        seedId === 'task.schedule'
          ? 'Target-neutral vocabulary accepted; durable timer and dispatch semantics remain W03-owned.'
          : 'Target-neutral vocabulary accepted only; implementation, current authority and execution remain with downstream owner waves.',
    }),
  ),
  ...REJECTED_SEEDS.map(
    (seedId): CapabilitySeedAdjudication => ({
      adjudicationId: `W04-B:${seedId}`,
      seedId,
      sourceRef: `${LEGACY_CAPABILITY_SEED_CATALOG_SOURCE}:${seedId}`,
      decision: 'REJECT',
      resultingCapabilityIds: [],
      reason: seedId.startsWith('agent.')
        ? 'Agent-internal lifecycle or plan mutation belongs to W05 runtime, not the target-neutral capability registry.'
        : 'The seed is too generic to preserve stable capability semantics; require explicit provider-neutral capabilities.',
    }),
  ),
  {
    adjudicationId: 'W04-B:browser.scroll',
    seedId: 'browser.scroll',
    sourceRef: `${LEGACY_CAPABILITY_SEED_CATALOG_SOURCE}:browser.scroll`,
    decision: 'DECOMPOSE',
    resultingCapabilityIds: ['browser.scroll.up', 'browser.scroll.down'],
    reason: 'Direction changes behavior and evidence, so the legacy combined seed is decomposed explicitly.',
  },
];

export const LEGACY_CAPABILITY_SEED_COUNT = 69 as const;
