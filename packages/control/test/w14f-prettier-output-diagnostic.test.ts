import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const managerUrl = new URL(
  '../../../services/mobile-gateway/src/device-command-delivery/manager.ts',
  import.meta.url,
);
const testUrl = new URL(
  '../../../services/mobile-gateway/src/device-command-delivery/test/w14f-device-command-delivery.test.ts',
  import.meta.url,
);

const prettierOptions = {
  parser: 'typescript' as const,
  arrowParens: 'always' as const,
  endOfLine: 'lf' as const,
  printWidth: 100,
  proseWrap: 'preserve' as const,
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all' as const,
  useTabs: false,
};

const regressionTests = `

test('acknowledgement revalidates current trust and cannot release ordering after trust expiry', () => {
  const manager = new DeviceCommandDeliveryManager(new DurablePort());
  const firstCommand = command(COMMAND_1, EXECUTION_1);
  const secondCommand = command(COMMAND_2, EXECUTION_2);
  assert.equal(
    manager.prepare({
      command: firstCommand,
      deviceSession: trust(),
      idempotencyKey: 'idem-trust-1',
      orderingKey: 'trust-ordered',
      orderingSequence: 1,
      nowMs: 1_100,
    }).ok,
    true,
  );
  assert.equal(
    manager.prepare({
      command: secondCommand,
      deviceSession: trust(),
      idempotencyKey: 'idem-trust-2',
      orderingKey: 'trust-ordered',
      orderingSequence: 2,
      nowMs: 1_100,
    }).ok,
    true,
  );
  const first = manager.claim({ command: firstCommand, deviceSession: trust(), nowMs: 1_200 });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const rejectedAck = manager.acknowledge({
    command: firstCommand,
    deviceSession: { ...trust(), gatewayAuthExpiresAtMs: 1_250 },
    deliveryReference: first.value.delivery.deliveryReference,
    ackReference: 'ack-expired-trust',
    observedAtMs: 1_300,
  });
  assert.equal(rejectedAck.ok, false);
  if (!rejectedAck.ok) assert.equal(rejectedAck.error.code, 'SESSION_EXPIRED');

  const second = manager.claim({
    command: secondCommand,
    deviceSession: trust(),
    nowMs: 1_400,
  });
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.error.code, 'ORDERING_BLOCKED');
});

test('acknowledged eviction advances ordering floor so bounded tracking does not create a gap', () => {
  const manager = new DeviceCommandDeliveryManager(new DurablePort(), {
    maxTrackedDeliveries: 1,
  });
  const firstCommand = command(COMMAND_1, EXECUTION_1);
  const secondCommand = command(COMMAND_2, EXECUTION_2);
  assert.equal(
    manager.prepare({
      command: firstCommand,
      deviceSession: trust(),
      idempotencyKey: 'idem-evict-1',
      orderingKey: 'evict-ordered',
      orderingSequence: 1,
      nowMs: 1_100,
    }).ok,
    true,
  );
  const first = manager.claim({ command: firstCommand, deviceSession: trust(), nowMs: 1_200 });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(
    manager.acknowledge({
      command: firstCommand,
      deviceSession: trust(),
      deliveryReference: first.value.delivery.deliveryReference,
      ackReference: 'ack-evict-1',
      observedAtMs: 1_300,
    }).ok,
    true,
  );

  assert.equal(
    manager.prepare({
      command: secondCommand,
      deviceSession: trust(),
      idempotencyKey: 'idem-evict-2',
      orderingKey: 'evict-ordered',
      orderingSequence: 2,
      nowMs: 1_400,
    }).ok,
    true,
  );
  const second = manager.claim({
    command: secondCommand,
    deviceSession: trust(),
    nowMs: 1_500,
  });
  assert.equal(second.ok, true);
  if (second.ok) assert.equal(second.value.disposition, 'DELIVER');
});
`;

function emitPayload(label: string, output: string): void {
  const digest = createHash('sha256').update(output).digest('hex');
  console.log(`${label}_SHA256=${digest}`);
  console.log(`${label}_GZIP_BASE64=${gzipSync(output).toString('base64')}`);
}

test('W14-F diagnostic emits repository-configured final payloads', async () => {
  const managerInput = readFileSync(fileURLToPath(managerUrl), 'utf8');
  const managerOutput = await format(managerInput, prettierOptions);
  emitPayload('W14F_MANAGER', managerOutput);

  const testInput = readFileSync(fileURLToPath(testUrl), 'utf8');
  const testOutput = await format(`${testInput.trimEnd()}${regressionTests}`, prettierOptions);
  emitPayload('W14F_TEST', testOutput);
});
