import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (name) => readFileSync(resolve(repoRoot, 'tools/tablet-devlab', name), 'utf8');

const MAIN_SHA = 'd2089407e88480686b879928cf2863c0dc81718e';
const ANDROID_SHA = 'a45c349c840b6c5125867fee3c7294ad61998cc3';
const HOST_SHA = 'e280e742321638a852c68346b26cd0cdd69010eb';
const PACKAGING_SHA = '12231a4070178d12c3812e05fa9e3179aefa68ac';
const APK_SHA = '5135a164d551c8f93e0dcfcfdf80ad66b60e69131d51d504ee7c000babbbb993';

const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
  assert.match(source, new RegExp(escaped(PACKAGING_SHA)));
  assert.match(source, new RegExp(escaped(ANDROID_SHA)));
  assert.match(source, new RegExp(escaped(HOST_SHA)));
  assert.match(source, new RegExp(escaped(MAIN_SHA)));
  assert.match(source, new RegExp(escaped(APK_SHA)));
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

test('worktrees default to the exact current tablet-loopback tuple', () => {
  const source = read('worktrees.sh');
  assert.match(source, new RegExp(escaped(ANDROID_SHA)));
  assert.match(source, new RegExp(escaped(HOST_SHA)));
  assert.match(source, new RegExp(escaped(MAIN_SHA)));
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

test('exact APK installer binds the current APK and requires explicit destructive replacement opt-in', () => {
  const source = read('install-exact-apk.sh');
  assert.match(source, /AURORA_ALLOW_CLEAN_INSTALL:-NO/);
  assert.match(source, /AURORA_ALLOW_CLEAN_INSTALL=YES/);
  assert.match(source, /installed APK readback failed before any mutation/);
  assert.match(source, /installed package is split\/non-canonical/);
  assert.match(source, new RegExp(escaped(APK_SHA)));
  assert.match(source, new RegExp(escaped(ANDROID_SHA)));
  assert.match(source, new RegExp(escaped(HOST_SHA)));
  assert.match(source, /LOCAL_TABLET_LOOPBACK/);
  assert.match(source, /adb -s/);
  assert.match(source, /uninstall.*\$PACKAGE_ID/);
  assert.match(source, /installed APK differs byte-for-byte from exact artifact/);
  assert.match(source, /EXACT_APK_INSTALLED_READY_NOT_ACCEPTED/);
  assert.match(source, /authorizesExecution.*false/);
  assert.match(source, /provesExecutionSuccess.*false/);
  assert.match(source, /retryAuthorized.*false/);
  assert.doesNotMatch(source, /device_serial=/);
});

test('PostgreSQL setup is W03-owned, migration-complete and non-authoritative', () => {
  const source = read('setup-postgres.sh');
  for (const migration of [
    '001_w03_postgres_baseline.sql',
    '002_w03_execution_attempt_quota.sql',
    '003_w03_execution_containment_state.sql',
  ]) {
    assert.match(source, new RegExp(escaped(migration)));
  }
  assert.match(source, /w03_idempotency_key/);
  assert.match(source, /w03_execution_attempt_quota/);
  assert.match(source, /w03_execution_containment_state/);
  assert.match(source, /chmod 600 "\$DB_ENV"/);
  assert.match(source, /authorizes_execution=false/);
  assert.match(source, /physical_acceptance=false/);
});

test('DP5 provider material requires explicit operator effect consent and cannot mint authority', () => {
  const source = read('prepare-dp5-provider.sh');
  assert.match(source, /AURORA_DP5_EFFECT_APPROVED:-/);
  assert.match(source, /AURORA_DP5_EFFECT_APPROVED=YES/);
  assert.match(source, /timedelta\(minutes=90\)/);
  assert.match(source, /'authorizesExecution': False/);
  assert.match(source, /'canGrantPermission': False/);
  assert.match(source, /operatorApprovalReference/);
  assert.match(source, /os\.open\(temporary, os\.O_WRONLY \| os\.O_CREAT \| os\.O_EXCL, 0o600\)/);
  assert.match(source, /effect_approval=EXPLICIT_OPERATOR_WINDOW/);
  assert.match(source, /authorizes_execution=false/);
  assert.match(source, /physical_acceptance=false/);
});

test('provider doctor validates owner-backed composition but remains software-only evidence', () => {
  const source = read('provider-doctor.sh');
  assert.match(source, /secure_regular_file/);
  assert.match(source, /databaseUrl,dependencies,executionStateSeed,principal/);
  assert.match(source, /createVoiceIntake/);
  assert.match(source, /createContainmentLifecycle/);
  assert.match(source, /createAttemptLifecycle/);
  assert.match(source, /receiptEvidenceIngress/);
  assert.match(source, /'authorize' in input\.dependencies/);
  assert.match(source, /'mint' in input\.dependencies/);
  assert.match(source, /'approve' in input\.dependencies/);
  assert.match(source, /W15J_DP5_PROVIDER_DOCTOR=PASS/);
  assert.match(source, /status=PASS_SOFTWARE_ONLY/);
  assert.match(source, /authorizes_execution=false/);
  assert.match(source, /proves_execution_success=false/);
  assert.match(source, /physical_acceptance=false/);
});

test('tablet devlab documentation keeps independent reviewer and exact tuple requirements', () => {
  const source = read('README.md');
  assert.match(source, /no PC/i);
  assert.match(source, /independent reviewer/i);
  assert.match(source, /INTELLIGENCE != AUTHORITY != EXECUTION/);
  assert.match(source, /LOCAL_TABLET_LOOPBACK/);
  assert.match(source, new RegExp(escaped(ANDROID_SHA)));
  assert.match(source, new RegExp(escaped(HOST_SHA)));
  assert.match(source, new RegExp(escaped(PACKAGING_SHA)));
  assert.match(source, new RegExp(escaped(APK_SHA)));
  assert.match(source, /setup-postgres\.sh/);
  assert.match(source, /prepare-dp5-provider\.sh/);
  assert.match(source, /provider-doctor\.sh/);
  assert.match(source, /AURORA_DP5_EFFECT_APPROVED=YES/);
  assert.match(source, /clean uninstall\/install/i);
  assert.match(source, /install-exact-apk\.sh/);
});
