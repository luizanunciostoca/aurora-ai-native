import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (name) => readFileSync(resolve(repoRoot, 'tools/tablet-devlab', name), 'utf8');

const MAIN_SHA = '77f0f8532197025ee913dd02fcb56878d9d667a9';
const ANDROID_SHA = 'e156668c0b5214aac0a38ef5738dace65656b675';
const LEGACY_V017_ANDROID_SHA = '40246031b2e1b1ef8e232db4d4d2ea6687f8ecf7';
const HOST_SHA = 'df17c9f27a8206f8296f55aa3830667f4742b062';
const PACKAGING_SHA = 'bff72f7e719dcd29c7b7538a91a680c1fa33f060';
const PRESIGN_SHA = 'ba85d4bce67ceca6a9048ae028a9a83ca5ef2850eb4523ef04454a6b909ecde5';
const APK_SHA = '4a9b7485045e94f5e1f729c7b0a876bbb0869b5bd0c5c6535a1ba436c56d11ca';
const CERT_SHA = 'e1745e3d3940fc6b03aef0b609d43aa8c436901965966087c2366108ffe263fb';
const ARTIFACT_ID = '10467107473';
const RUN_ID = '35145610779';
const ZIP_SHA = 'c21aa967e634e82e999619cc2cda515c36a0202a570a00d8c49779b7e8e7e31e';

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
  assert.match(source, /apksigner/);
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
  assert.match(launcher, /AURORA_W15J_BOOTSTRAP_REFRESH_FILE/);
  assert.match(launcher, /AURORA_W15J_BOOTSTRAP_RECONNECT_FILE/);
  assert.match(launcher, /fixed LOCAL ports 8080\/8081 are unavailable/);
  assert.match(launcher, /socket\.SO_REUSEADDR/);
  assert.match(launcher, /check-bootstrap-principal-age\.py/);
  assert.match(launcher, /MAX_BOOTSTRAP_PRINCIPAL_AGE_SECONDS=240/);
  assert.match(provider, /throw new Error/);
  assert.match(provider, /authorizesExecution: false/);
  assert.match(provider, /canGrantPermission: false/);
  assert.doesNotMatch(provider, /postgres(?:ql)?:\/\/[^\s]*:[^\s]*@/i);
});

test('verified host prebuild is opt-in, byte-bound and non-authoritative', () => {
  const launcher = read('run-host.sh');
  const prebuild = read('prebuild-host.sh');
  const verifier = read('verify-host-prebuild.sh');
  const hasher = read('hash-host-prebuild.py');
  assert.match(launcher, /AURORA_W15J_USE_PREBUILT/);
  assert.match(launcher, /W15J_HOST_BUILD_MODE=VERIFIED_PREBUILT/);
  assert.match(launcher, /verify-host-prebuild\.sh/);
  assert.match(prebuild, /W15J_HOST_PREBUILD_V1/);
  assert.match(prebuild, /host_tree_sha/);
  assert.match(prebuild, /package_lock_sha256/);
  assert.match(prebuild, /runtime_tree_sha256/);
  assert.match(verifier, /runtime tree drift/);
  assert.match(verifier, /prebuild manifest stale/);
  assert.match(verifier, /authorizes_execution/);
  assert.match(verifier, /physical_acceptance/);
  assert.match(hasher, /services\/mobile-gateway\/dist/);
  assert.match(hasher, /node_modules/);
  assert.match(hasher, /SYMLINK:/);
});

test('artifact fetch binds the exact presign and final-signing tuple', () => {
  const source = read('fetch-current-artifact.sh');
  for (const key of [
    'packaging_head_sha',
    'packaging_run_id',
    'artifact_id',
    'artifact_name',
    'artifact_zip_sha256',
    'presign_apk_sha256',
    'expected_final_apk_sha256',
    'expected_signer_cert_sha256',
  ]) {
    assert.match(source, new RegExp(`^${key}=`, 'm'));
  }
  for (const value of [
    PACKAGING_SHA,
    ANDROID_SHA,
    HOST_SHA,
    MAIN_SHA,
    PRESIGN_SHA,
    APK_SHA,
    CERT_SHA,
    ARTIFACT_ID,
    RUN_ID,
    ZIP_SHA,
  ]) {
    assert.match(source, new RegExp(escaped(value)));
  }
  assert.doesNotMatch(source, /^apk_sha256=.*>.*ARTIFACT_METADATA/m);
  assert.match(source, /embedded packaging head drift/);
  assert.match(source, /embedded packaging run drift/);
  assert.match(source, /embedded Android SHA drift/);
  assert.match(source, /embedded host SHA drift/);
  assert.match(source, /embedded main SHA drift/);
  assert.match(source, /LOCAL_TABLET_LOOPBACK/);
  assert.match(source, /gateway_origin/);
  assert.match(source, /127\.0\.0\.1:8080/);
  assert.match(source, /BUILD_IDENTITY must contain exactly 24 lines/);
  assert.match(source, /canonical_acceptance=false/);
  assert.match(source, /dp5_status=INCOMPLETE/);
  assert.match(source, /PHYSICAL_DEV_STABLE_LOCAL/);
  assert.match(source, /local_signing_required=true/);
});

test('physical signing tool is deterministic, local-only and certificate-bound', () => {
  const source = read('sign-current-artifact.sh');
  for (const value of [PRESIGN_SHA, APK_SHA, CERT_SHA]) {
    assert.match(source, new RegExp(escaped(value)));
  }
  assert.match(source, /PKCS12/);
  assert.match(source, /--v2-signing-enabled true/);
  assert.match(source, /--v3-signing-enabled true/);
  assert.match(source, /--v1-signing-enabled false/);
  assert.match(source, /cmp -s .*DET_APK/);
  assert.match(source, /signer_count=1/);
  assert.match(source, /deterministic_signing=true/);
  assert.match(source, /private_key_exported=false/);
  assert.doesNotMatch(source, /pass:<password>/);
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
  assert.match(source, /embedded gateway origin must be physical loopback/);
  assert.match(source, /127\.0\.0\.1:8080/);
  assert.match(source, new RegExp(escaped(APK_SHA)));
  assert.match(source, new RegExp(escaped(ANDROID_SHA)));
  assert.match(source, new RegExp(escaped(HOST_SHA)));
  assert.match(source, new RegExp(escaped(MAIN_SHA)));
  assert.match(source, /authorizesExecution.*false/);
  assert.match(source, /provesExecutionSuccess.*false/);
  assert.match(source, /retryAuthorized.*false/);
  assert.match(source, new RegExp(escaped(CERT_SHA)));
  assert.match(source, /PHYSICAL_DEV_STABLE_LOCAL/);
});

test('exact APK installer binds the current APK and requires explicit destructive replacement opt-in', () => {
  const source = read('install-exact-apk.sh');
  assert.match(source, /AURORA_ALLOW_CLEAN_INSTALL:-NO/);
  assert.match(source, /AURORA_ALLOW_CLEAN_INSTALL=YES/);
  assert.match(source, /install -r/);
  assert.match(source, /EXACT_APK_UPDATED_IN_PLACE_READY_NOT_ACCEPTED/);
  assert.match(source, new RegExp(escaped(CERT_SHA)));
  assert.match(source, /installed APK readback failed before any mutation/);
  assert.match(source, /installed package is split\/non-canonical/);
  assert.match(source, new RegExp(escaped(APK_SHA)));
  assert.match(source, new RegExp(escaped(ANDROID_SHA)));
  assert.match(source, new RegExp(escaped(HOST_SHA)));
  assert.match(source, /LOCAL_TABLET_LOOPBACK/);
  assert.match(source, /BUILD_IDENTITY must contain exactly 24 lines/);
  assert.match(source, /embedded gateway origin must be physical loopback/);
  assert.match(source, /127\.0\.0\.1:8080/);
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
  assert.match(source, /BOUNDED_VOLUME_STEP_AND_AURORA_SELF_LAUNCH/);
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
  assert.match(source, /BOUNDED_VOLUME_STEP_AND_AURORA_SELF_LAUNCH/);
  assert.match(source, /timedelta\(minutes=10\)/);
  assert.match(source, /consent\['approvalReference'\]/);
  assert.match(source, /'authorizesExecution': False/);
  assert.match(source, /'canGrantPermission': False/);
  assert.match(source, /'appAction': \{/);
  assert.match(source, /trustedSignerSha256/);
  assert.match(source, /effect_approval=INTERACTIVE_EXACT_TUPLE_OPERATOR_WINDOW/);
  assert.match(source, /dp5-effect-consent\.consumed-/);
  assert.match(source, /authorizes_execution=false/);
  assert.match(source, /physical_acceptance=false/);
});

test('DP5 provider preserves an existing ACTIVE Android W14 binding', () => {
  const source = read('prepare-dp5-provider.sh');
  assert.match(source, /aurora_device_session_metadata\.xml/);
  assert.match(source, /exactly one authorized self-ADB device is required/);
  assert.match(source, /physical tablet required/);
  assert.match(source, /state != 'ACTIVE'/);
  assert.match(source, /Android W14 binding is incomplete or not ACTIVE/);
  assert.match(source, /binding\['tenantId'\] if binding\['mode'\] == 'BOUND'/);
  assert.match(source, /binding\['deviceId'\] if binding\['mode'\] == 'BOUND'/);
  assert.match(source, /binding\['deviceSessionId'\] if binding\['mode'\] == 'BOUND'/);
  assert.match(source, /return \{'mode': 'FRESH_INSTALL'\}/);
  assert.match(source, /rm -f -- "\$BINDING_XML"/);
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

test('live control-tower tuple capture retries transient GitHub reads and cannot self-accept DP5', () => {
  const source = read('capture-control-tower-tuple.sh');
  assert.match(source, /branches\/main/);
  assert.match(source, /pulls\/\$number/);
  assert.match(source, /compare\/\$MAIN_SHA\.\.\.\$expected_head/);
  assert.match(source, /actions\/runs\/\$RUN_ID/);
  assert.match(source, /actions\/artifacts\/\$ARTIFACT_ID/);
  assert.match(source, /for attempt in 1 2 3 4/);
  assert.match(source, /GitHub API unavailable after bounded retries/);
  assert.match(source, /sha256:\$ZIP_SHA/);
  assert.match(source, /open\/draft\/unmerged/);
  for (const value of [
    MAIN_SHA,
    ANDROID_SHA,
    HOST_SHA,
    PACKAGING_SHA,
    PRESIGN_SHA,
    APK_SHA,
    CERT_SHA,
    ARTIFACT_ID,
    RUN_ID,
    ZIP_SHA,
  ]) {
    assert.match(source, new RegExp(escaped(value)));
  }
  assert.match(source, /CONTROL_TOWER_TUPLE_CAPTURED_READY_NOT_ACCEPTED/);
  assert.match(source, /authorizes_execution=false/);
  assert.match(source, /physical_acceptance=false/);
  assert.match(source, /retry_authorized=false/);
});

test('same-host bootstrap refresh is protected, current-instance-bound and non-authoritative', () => {
  const source = read('refresh-bootstrap.sh');
  assert.match(source, /last-readiness-termux\.txt/);
  assert.match(source, /host-ready-announcement\.txt/);
  assert.match(source, /kill -USR2/);
  assert.match(source, /DEVICE_GATEWAY/);
  assert.match(source, /BOOTSTRAP_EXCHANGE/);
  assert.match(source, /W15J_LOCAL_BOOTSTRAP_REFRESH_READY/);
  assert.match(source, /REMAINING_MS > 30000/);
  assert.match(source, /check-bootstrap-principal-age\.py/);
  assert.match(source, /MAX_BOOTSTRAP_PRINCIPAL_AGE_SECONDS=240/);
  assert.doesNotMatch(source, /REMAINING_MS > 30_000/);
  assert.match(source, /authorizes_execution=false/);
  assert.match(source, /proves_execution_success=false/);
  assert.match(source, /retry_authorized=false/);
  assert.match(source, /physical_acceptance=false/);
});

test('bootstrap principal age guard fails closed before the W14 five-minute stale boundary', () => {
  const source = read('check-bootstrap-principal-age.py');
  assert.match(source, /W15J_LOCAL_DP5_OPERATOR_MATERIAL/);
  assert.match(source, /generatedAt/);
  assert.match(source, /age >= maximum/);
  assert.match(source, /W15J_BOOTSTRAP_PRINCIPAL_AGE=STALE/);
  assert.match(source, /W15J_BOOTSTRAP_PRINCIPAL_AGE=PASS/);
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
  assert.match(source, /required_semantic_evidence_roles=7/);
  assert.match(source, /semantic_binding_lint=PASS_NOT_ACCEPTED/);
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
  assert.match(source, /refresh-bootstrap\.sh/);
  assert.match(source, /refresh-reconnect\.sh/);
  assert.match(source, /AURORA_DP5_EFFECT_APPROVED=YES/);
  assert.match(source, /clean (?:uninstall|replacement)/i);
  assert.match(source, /sign-current-artifact\.sh/);
  assert.match(source, /install-exact-apk\.sh/);
});

test('v0.17 transport reconciliation freezes direct tablet loopback without moving Android candidate', () => {
  const source = read('DP5_TRANSPORT_RECONCILIATION.md');
  assert.match(source, /LOCAL_TABLET_LOOPBACK/);
  assert.match(source, /adbReversePort=null/);
  assert.match(source, /SELF_ADB_WIRELESS_DEBUGGING/);
  assert.match(source, /no `adb reverse` mapping may exist/);
  assert.match(source, new RegExp(escaped(LEGACY_V017_ANDROID_SHA)));
  assert.match(source, /does not authorize execution/i);
  assert.match(source, /unblock W16/i);
});

test('stale W14 recovery preserves the Android key while clearing only stale binding metadata', () => {
  const source = read('recover-stale-w14-binding.sh');
  assert.match(source, /AURORA_W14_STALE_BINDING_RECOVERY/);
  assert.match(source, /unconsumed physical-effect consent must be absent/);
  assert.match(source, /PORT|port/);
  assert.match(source, /am force-stop/);
  assert.match(source, /w14-stale-binding-recovery/);
  assert.match(source, /key_alias/);
  assert.match(source, /key_generation/);
  assert.match(source, /ACTIVE_REGISTRATION_ONLY/);
  assert.match(source, /session metadata is partial/);
  assert.match(source, /set\(after\) == \{'key_alias', 'key_generation'\}/);
  assert.match(source, /KEY_MATERIAL=NOT_DELETED/);
  assert.match(source, /AUTHORIZES_EXECUTION=false/);
  assert.match(source, /PHYSICAL_ACCEPTANCE=false/);
  assert.doesNotMatch(source, /uninstall/);
});
