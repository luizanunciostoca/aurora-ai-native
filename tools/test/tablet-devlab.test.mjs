import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (name) => readFileSync(resolve(repoRoot, 'tools/tablet-devlab', name), 'utf8');

test('tablet devlab bootstrap installs external control plane prerequisites', () => {
  const source = read('bootstrap-termux.sh');
  assert.match(source, /android-tools/);
  assert.match(source, /proot-distro/);
  assert.match(source, /Android 11 \/ API 30 or newer/);
  assert.doesNotMatch(source, /sudo\s/);
});

test('Debian setup pins W15-J host to Node 22 and preserves fixed git boundary', () => {
  const source = read('setup-debian.sh');
  assert.match(source, /nvm install 22/);
  assert.match(source, /major!==22 \|\| minor<16/);
  assert.match(source, /\/usr\/bin\/git/);
  assert.match(source, /root-owned/);
});

test('self adb exposes physical observation without publishing raw serial', () => {
  const source = read('self-adb.sh');
  assert.match(source, /exactly one self-ADB device/);
  assert.match(source, /ro\.kernel\.qemu/);
  assert.match(source, /serial_sha256/);
  assert.doesNotMatch(source, /serial=\$serial/);
});

test('tablet host remains fail closed until trusted provider is configured', () => {
  const launcher = read('run-host.sh');
  const provider = read('trusted-w15j-provider.template.mjs');
  assert.match(launcher, /TABLET_DEVLAB_PROVIDER_NOT_CONFIGURED/);
  assert.match(launcher, /AURORA_W15J_PROVIDER_MODULE/);
  assert.match(provider, /throw new Error/);
  assert.match(provider, /authorizesExecution: false/);
  assert.match(provider, /canGrantPermission: false/);
  assert.doesNotMatch(provider, /postgres(?:ql)?:\/\/[^\s]*:[^\s]*@/i);
});

test('artifact fetch emits five-key metadata and binds the exact tablet-loopback tuple', () => {
  const source = read('fetch-current-artifact.sh');
  for (const key of [
    'packaging_head_sha',
    'packaging_run_id',
    'artifact_id',
    'artifact_name',
    'artifact_zip_sha256',
  ]) {
    assert.match(source, new RegExp(`^${key}=`, 'm'));
  }
  assert.doesNotMatch(source, /^apk_sha256=.*>.*ARTIFACT_METADATA/m);
  assert.match(source, /embedded packaging head drift/);
  assert.match(source, /embedded packaging run drift/);
  assert.match(source, /embedded Android SHA drift/);
  assert.match(source, /embedded host SHA drift/);
  assert.match(source, /embedded main SHA drift/);
  assert.match(source, /LOCAL_TABLET_LOOPBACK/);
  assert.match(source, /canonical_acceptance=false/);
  assert.match(source, /dp5_status=INCOMPLETE/);
});

test('worktrees default to the exact tablet-loopback Android candidate', () => {
  const source = read('worktrees.sh');
  assert.match(source, /5c955eac4cdcd92bc2e0604d50f9feb339095d6a/);
  assert.match(source, /3c7c3aa917c00d91d738121dee5fd32ed07b5444/);
  assert.match(source, /d2089407e88480686b879928cf2863c0dc81718e/);
});

test('tablet loopback preflight refuses reverse-port ambiguity and remains non-accepting', () => {
  const source = read('tablet-preflight.sh');
  assert.match(source, /LOCAL_TABLET_LOOPBACK/);
  assert.match(source, /requires direct host listeners with no reverse/);
  assert.match(source, /TABLET_LOOPBACK_PREFLIGHT_READY_NOT_ACCEPTED/);
  assert.doesNotMatch(source, /PRE_ACCEPTANCE_ONLY_TRANSPORT_CONTRACT_RECONCILIATION_REQUIRED/);
  assert.match(source, /embedded transport scope must be LOCAL_TABLET_LOOPBACK/);
  assert.match(source, /authorizesExecution.*false/);
  assert.match(source, /provesExecutionSuccess.*false/);
  assert.match(source, /retryAuthorized.*false/);
});

test('tablet devlab documentation keeps independent reviewer and exact tuple requirements', () => {
  const source = read('README.md');
  assert.match(source, /no PC/i);
  assert.match(source, /independent reviewer/i);
  assert.match(source, /INTELLIGENCE != AUTHORITY != EXECUTION/);
  assert.match(source, /LOCAL_TABLET_LOOPBACK/);
  assert.match(source, /da605b277fb4c7f9a3820c417fe126a5b617b7c34d9e7f2b48f67da40114cb9a/);
  assert.match(source, /clean uninstall\/install/i);
});
