import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (name) => readFileSync(resolve(repoRoot, 'tools/tablet-devlab', name), 'utf8');

const MAIN_SHA = 'd2089407e88480686b879928cf2863c0dc81718e';
const ANDROID_SHA = '6d44480eae9b99467b20df44290b5c9b17626c3e';
const HOST_SHA = 'e280e742321638a852c68346b26cd0cdd69010eb';
const PACKAGING_SHA = 'c2375e555caf719130755979b69a57e3133246f6';
const APK_SHA = '7e09c3473fa235a8f442f275ed99f33a136ceb2c63bd80c5a2eb03cbfaa6eb82';
const ARTIFACT_ID = '10030765116';
const RUN_ID = '34155218889';
const ZIP_SHA = '785668c03552c66f2dcfecca71ac961afe1f96f77ceb4739816d2b42f9094afe';

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
  for (const value of [PACKAGING_SHA, ANDROID_SHA, HOST_SHA, MAIN_SHA, APK_SHA, ARTIFACT_ID, RUN_ID, ZIP_SHA]) {
    assert.match(source, new RegExp(escaped(value)));
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

test('worktrees default to the exact current tablet-loopback tuple', () => {
  const source = read('worktrees.sh');
  assert.match(source, new RegExp(escaped(ANDROID_SHA)));
  assert.match(source, new RegExp(escaped(HOST_SHA)));
  assert.match(source, new RegExp(escaped(MAIN_SHA)));
});

test('tablet loopback preflight refuses reverse-port ambiguity and binds current exact tuple', () => {
  const source = read('tablet-preflight.sh');
  assert.match(source, /LOCAL_TABLET_LOOPBACK/);
  assert.match(source, /requires direct host listeners with no reverse/);
  assert.match(source, /TABLET_LOOPBACK_PREFLIGHT_READY_NOT_ACCEPTED/);
  assert.doesNotMatch(source, /PRE_ACCEPTANCE_ONLY_TRANSPORT_CONTRACT_RECONCILIATION_REQUIRED/);
  assert.match(source, /embedded transport scope must be LOCAL_TABLET_LOOPBACK/);
  assert.match(source, new RegExp(escaped(APK_SHA)));
  assert.match(source, new RegExp(escaped(ANDROID_SHA)));
  assert.match(source, new RegExp(escaped(HOST_SHA)));
  assert.match(source, new RegExp(escaped(MAIN_SHA)));
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

test('physical effect consent requires an interactive exact-tuple operator challenge', () => {
  const source = read('authorize-dp5-effect.sh');
  assert.match(source, /\[\[ -t 0 && -t 1 \]\]/);
  assert.match(source, /APPROVE W15J DP5 \$CHALLENGE/);
  assert.match(source, /ONE_BOUNDED_MEDIA_VOLUME_STEP_UP/);
  assert.match(source, /timedelta\(minutes=10\)/);
  assert.match(source, /'authorizesExecution': False/);
  assert.match(source, /'retryAuthorized': False/);
  assert.match(source, /'physicalAcceptance': False/);
  assert.match(source, /os\.open\(temporary, os\.O_WRONLY \| os\.O_CREAT \| os\.O_EXCL, 0o600\)/);
  assert.match(source, /unconsumed DP5 effect consent already exists/);
});

test('DP5 provider material requires both explicit opt-in and fresh interactive consent', () => {
  const source = read('prepare-dp5-provider.sh');
  assert.match(source, /AURORA_DP5_EFFECT_APPROVED:-/);
  assert.match(source, /AURORA_DP5_EFFECT_APPROVED=YES/);
  assert.match(source, /dp5-effect-consent\.json/);
  assert.match(source, /W15J_DP5_PHYSICAL_EFFECT_CONSENT/);
  assert.match(source, /ONE_BOUNDED_MEDIA_VOLUME_STEP_UP/);
  assert.match(source, /timedelta\(minutes=10\)/);
  assert.match(source, /consent\['approvalReference'\]/);
  assert.match(source, /'authorizesExecution': False/);
  assert.match(source, /'canGrantPermission': False/);
  assert.match(source, /effect_approval=INTERACTIVE_EXACT_TUPLE_OPERATOR_WINDOW/);
  assert.match(source, /dp5-effect-consent\.consumed-/);
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

test('live control-tower tuple capture revalidates GitHub and cannot self-accept DP5', () => {
  const source = read('capture-control-tower-tuple.sh');
  assert.match(source, /branches\/main/);
  assert.match(source, /pulls\/\$number/);
  assert.match(source, /compare\/\$MAIN_SHA\.\.\.\$expected_head/);
  assert.match(source, /actions\/runs\/\$RUN_ID/);
  assert.match(source, /actions\/artifacts\/\$ARTIFACT_ID/);
  assert.match(source, /sha256:\$ZIP_SHA/);
  assert.match(source, /open\/draft\/unmerged/);
  for (const value of [MAIN_SHA, ANDROID_SHA, HOST_SHA, PACKAGING_SHA, APK_SHA, ARTIFACT_ID, RUN_ID, ZIP_SHA]) {
    assert.match(source, new RegExp(escaped(value)));
  }
  assert.match(source, /CONTROL_TOWER_TUPLE_CAPTURED_READY_NOT_ACCEPTED/);
  assert.match(source, /authorizes_execution=false/);
  assert.match(source, /physical_acceptance=false/);
  assert.match(source, /retry_authorized=false/);
});

test('dossier doctor requires finalized reviewer-bound evidence and remains non-accepting', () => {
  const source = read('dossier-doctor.sh');
  assert.match(source, /evidence-manifest\.sha256/);
  assert.match(source, /reviewer-attestation\.json/);
  assert.match(source, /operator-attestation\.json/);
  assert.match(source, /wake-evidence\.json/);
  assert.match(source, /capture-control-tower-tuple\.sh/);
  assert.match(source, /w15j-tablet-loopback-trusted-preflight\.mjs/);
  assert.match(source, /w15j-governed-execution-binding\.mjs/);
  assert.match(source, /semantic_binding=PASS_7_ROLES_NOT_ACCEPTED/);
  assert.match(source, /physicallyAccepted/);
  assert.match(source, /EXTERNAL_REQUIRED_IMMEDIATELY_BEFORE_ACCEPTANCE/);
  assert.match(source, /LINT_READY_FOR_INDEPENDENT_CONTROL_TOWER_REVIEW_NOT_ACCEPTED/);
  assert.match(source, /authorizes_execution=false/);
  assert.match(source, /physical_acceptance=false/);
  assert.match(source, /w16_build_unblocked=false/);
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
  assert.match(source, /authorize-dp5-effect\.sh/);
  assert.match(source, /prepare-dp5-provider\.sh/);
  assert.match(source, /provider-doctor\.sh/);
  assert.match(source, /AURORA_DP5_EFFECT_APPROVED=YES/);
  assert.match(source, /clean uninstall\/install/i);
  assert.match(source, /install-exact-apk\.sh/);
});
