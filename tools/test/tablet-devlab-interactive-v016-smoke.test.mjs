import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const script = readFileSync(
  new URL('../tablet-devlab/prepare-interactive-v016-smoke.sh', import.meta.url),
  'utf8',
);

test('interactive v0.16 smoke tooling pins the final exact release tuple', () => {
  for (const expected of [
    'bd9081d1016bdf83af0a0ef0959ae97f59e0dc49',
    '294e8754a568838ade40f1907546339385d7e599',
    '4924956abde3e0e312c54e97ac94191b8949679c',
    'd2089407e88480686b879928cf2863c0dc81718e',
    '4234fd9d904d3cfc015e2087f4e00639c916c8fb',
    '34692024379',
    '10297460992',
    'aurora-interactive-v016-physical-bd9081d1-host-294e8754',
    'efacae2cd43165dd81c176e085f58bbd0ec32525318a82aa5efc8dec42116d01',
    'a9169ad4f9b9548924a8c17373f18ae48915c323acd82dbad1734236caab92e8',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:8081',
    'LOCAL_TABLET_LOOPBACK',
    'SM-X820',
  ]) {
    assert.ok(script.includes(expected), `missing exact binding ${expected}`);
  }
});

test('interactive smoke tooling rejects every superseded v0.16 physical tuple', () => {
  for (const stale of [
    '3a342c2ff0302d12cffe58e567e5ee1cd24f5f61',
    '6f5e5155a20fe4454dbc9b96114933e8b322e1b8',
    '34690878049',
    '10296778999',
    '953906d1be7af612811e45e221971cbe2dca5a10086ea953a5829cb1e10ed25f',
    '0988d9dbc23eb9c26dce4c73248f621a3f50a6e3259ac8d5cd10f3aa00d1b7d6',
  ]) {
    assert.ok(!script.includes(stale), `superseded binding remains in installer: ${stale}`);
  }
});

test('interactive smoke tooling preserves destructive and authority boundaries', () => {
  assert.match(script, /AURORA_ALLOW_CLEAN_INSTALL:-NO/);
  assert.match(script, /No mutation was performed/);
  assert.match(script, /canonical_dp5_acceptance_artifact=false/);
  assert.match(script, /physical_acceptance_status=SMOKE_PENDING/);
  assert.match(script, /dp5_status=INCOMPLETE/);
  assert.match(script, /"authorizesExecution": false/);
  assert.match(script, /"provesExecutionSuccess": false/);
  assert.match(script, /"retryAuthorized": false/);
  assert.match(script, /ADB reverse on 8080\/8081 is forbidden/);
  assert.doesNotMatch(script, /adb reverse tcp:8080/);
  assert.doesNotMatch(script, /adb reverse tcp:8081/);
});
