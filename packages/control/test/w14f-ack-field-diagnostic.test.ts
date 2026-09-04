import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as prettier from 'prettier';

const TARGET = 'services/mobile-gateway/src/device-command-delivery/manager.ts';
const BEFORE =
  "...(record.acknowledgedAtMs === undefined ? {} : { acknowlededAtMs: record.acknowlededAtMs }),";
const AFTER =
  "...(record.acknowledgedAtMs === undefined ? {} : { acknowledgedAtMs: record.acknowledgedAtMs }),";

test('W14-F diagnostic emits the exact formatted ACK snapshot correction', async () => {
  const source = readFileSync(TARGET, 'utf8');
  assert.equal(source.includes(BEFORE), true);
  const corrected = source.replace(BEFORE, AFTER);
  assert.equal(corrected.includes(BEFORE), false);
  assert.equal(corrected.includes(AFTER), true);
  const formatted = await prettier.format(corrected, { filepath: TARGET });
  console.log(`W14F_FINAL_MANAGER_BASE64 ${Buffer.from(formatted, 'utf8').toString('base64')}`);
});
