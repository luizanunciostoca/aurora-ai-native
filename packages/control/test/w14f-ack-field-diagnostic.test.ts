import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const TARGET = 'services/mobile-gateway/src/device-command-delivery/manager.ts';
const BEFORE =
  "...(record.acknowledgedAtMs === undefined ? {} : { acknowlededAtMs: record.acknowlededAtMs }),";
const AFTER =
  "...(record.acknowledgedAtMs === undefined ? {} : { acknowledgedAtMs: record.acknowledgedAtMs }),";

test('W14-F diagnostic emits the exact ACK snapshot field correction', () => {
  const source = readFileSync(TARGET, 'utf8');
  assert.equal(source.includes(BEFORE), true);
  const corrected = source.replace(BEFORE, AFTER);
  assert.equal(corrected.includes(BEFORE), false);
  assert.equal(corrected.includes(AFTER), true);
  console.log(`W14F_ACK_FIX_BASE64 ${Buffer.from(corrected, 'utf8').toString('base64')}`);
});
