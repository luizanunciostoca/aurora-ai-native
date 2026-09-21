#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'DP5_SAFE_BATCH_BLOCKED: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in adb apksigner git jq node python3 sha256sum; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"
done

ROOT="${AURORA_REPO_ROOT:-$HOME/aurora-devlab/worktrees/devlab}"
DEVLAB="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
EVID="${AURORA_EVIDENCE_DIR:-$DEVLAB/evidence/w15j-dp5}"
CAMPAIGN="$EVID/harness/dp5-campaign.json"
PREFLIGHT="$EVID/preflight-metadata.txt"
MATERIAL="$DEVLAB/config/w15j-dp5-material.json"
ANDROID="$DEVLAB/worktrees/android"
HOST="$DEVLAB/worktrees/host"
STATE="$DEVLAB/state"
PKG="ai.aurora.device.local"
MAIN="$PKG/ai.aurora.device.MainActivity"
cd "$ROOT"
[[ -f "$CAMPAIGN" ]] || fail "campaign is missing"
[[ -f "$PREFLIGHT" ]] || fail "collector preflight is missing"
[[ -f "$MATERIAL" ]] || fail "DP5 material is missing"

mapfile -t DEVICES < <(adb devices | awk 'NR>1 && $2=="device"{print $1}')
[[ "${#DEVICES[@]}" -eq 1 ]] || fail "exactly one authorized self-ADB device is required"
SERIAL="${DEVICES[0]}"
[[ "$SERIAL" != emulator-* ]] || fail "emulator is not physical evidence"
[[ "$(adb -s "$SERIAL" shell getprop ro.kernel.qemu | tr -d '\r')" != "1" ]] ||
  fail "qemu device is not physical evidence"
[[ "$(adb -s "$SERIAL" shell getprop ro.product.model | tr -d '\r')" == "SM-X820" ]] ||
  fail "unexpected physical tablet model"

DEVLAB_SHA="$(git rev-parse HEAD)"
ANDROID_SHA="$(git -C "$ANDROID" rev-parse HEAD)"
HOST_SHA="$(git -C "$HOST" rev-parse HEAD)"
[[ -z "$(git status --porcelain)" ]] || fail "DevLab worktree is dirty"
[[ -z "$(git -C "$ANDROID" status --porcelain)" ]] || fail "Android worktree is dirty"
[[ -z "$(git -C "$HOST" status --porcelain)" ]] || fail "Host worktree is dirty"
CAMPAIGN_ANDROID="$(jq -r '.tuple.candidateSha' "$CAMPAIGN")"
CAMPAIGN_APK_SHA="$(jq -r '.tuple.apk.sha256' "$CAMPAIGN")"
CAMPAIGN_APP_ID="$(jq -r '.tuple.apk.applicationId' "$CAMPAIGN")"
[[ "$CAMPAIGN_ANDROID" == "$ANDROID_SHA" ]] || fail "campaign Android SHA drifted"
[[ "$CAMPAIGN_APP_ID" == "$PKG" ]] || fail "campaign applicationId drifted"

SUPERVISOR="$STATE/safe-batch-supervisor-status.json"
node tools/tablet-devlab/dp5-host-supervisor-client.mjs status > "$SUPERVISOR" ||
  fail "Host supervisor is unavailable"
jq -e --arg ds "$DEVLAB_SHA" --arg hs "$HOST_SHA" '
  .ok==true and .value.active==true and
  .value.supervisorSourceSha==$ds and .value.hostSha==$hs and
  .value.authorizesExecution==false and .value.retryAuthorized==false
' "$SUPERVISOR" >/dev/null || fail "Host/supervisor provenance mismatch"

HOST_INSTANCE="$(jq -r '.value.hostInstanceId' "$SUPERVISOR")"
PREFLIGHT_HOST="$(awk -F= '$1=="host_instance_id"{print $2}' "$PREFLIGHT")"
[[ "$HOST_INSTANCE" == "$PREFLIGHT_HOST" ]] || fail "collector Host instance continuity mismatch"
RAW_XML="$STATE/safe-batch-session.xml"
trap 'rm -f "$RAW_XML" "$STATE/safe-batch-id002.xml" "$STATE/safe-batch-installed.apk"' EXIT
adb -s "$SERIAL" exec-out run-as "$PKG" sh -c   'cat shared_prefs/aurora_device_session_metadata.xml' > "$RAW_XML"
chmod 600 "$RAW_XML"
python3 - "$RAW_XML" "$MATERIAL" <<'PY'
import json,sys,time,xml.etree.ElementTree as ET
xp,mp=sys.argv[1:3]
root=ET.parse(xp).getroot()
v={}
for e in root:
    n=e.attrib.get("name")
    if n: v[n]=e.text if e.tag=="string" else e.attrib.get("value")
m=json.load(open(mp))
checks={
 "active": v.get("device_state")=="ACTIVE",
 "device": v.get("device_id")==m.get("deviceId"),
 "session": v.get("device_session_id")==m.get("deviceSessionId"),
 "registration": int(v.get("registration_version","0"))>0,
 "generation": int(v.get("gateway_generation","0"))>0,
 "auth_not_expired": int(v.get("gateway_auth_expires_at_ms","0"))>int(time.time()*1000),
}
bad=[k for k,val in checks.items() if not val]
if bad: raise SystemExit("W14 binding invalid: "+",".join(bad))
PY
rm -f "$RAW_XML"
ACTIVE_ATTEMPTS="$(jq '[.scenarios[].attempts[]? | select(.status=="STARTED")] | length' "$CAMPAIGN")"
PENDING_CAPTURES="$(jq '[.scenarios[].attempts[]? | select(.status=="CAPTURED_AWAITING_VERDICT")] | length' "$CAMPAIGN")"
[[ "$ACTIVE_ATTEMPTS" == "0" ]] || fail "another scenario attempt is STARTED"
[[ "$PENDING_CAPTURES" == "0" ]] || fail "captured attempts already await verdict"

for id in DP5-LIFE-001 DP5-LIFE-003 DP5-ID-002 DP5-APP-001; do
  status="$(jq -r --arg id "$id" '.scenarios[]|select(.id==$id)|.status' "$CAMPAIGN")"
  attempts="$(jq -r --arg id "$id" '.scenarios[]|select(.id==$id)|(.attempts|length)' "$CAMPAIGN")"
  [[ "$status" == "NOT_RUN" && "$attempts" == "0" ]] ||
    fail "$id is not pristine NOT_RUN"
done

start_scenario() {
  local id="$1"
  node tools/tablet-devlab/dp5-campaign.mjs start "$id" >/dev/null
  local dir
  dir="$(find "$EVID/harness/$id" -maxdepth 1 -type d -name 'attempt-*' | sort | tail -1)"
  [[ -n "$dir" && -d "$dir" ]] || fail "$id attempt directory missing"
  printf '%s\n' "$dir"
}
capture_scenario() {
  local id="$1"
  node tools/tablet-devlab/dp5-campaign.mjs capture "$id" >/dev/null
  jq -e --arg id "$id" '
    .scenarios[]|select(.id==$id)|
    (.attempts[-1].status=="CAPTURED_AWAITING_VERDICT")
  ' "$CAMPAIGN" >/dev/null || fail "$id did not enter captured-awaiting-verdict"
}

run_lifecycle() {
  local id="$1" dir before after launch
  dir="$(start_scenario "$id")"
  before="$(adb -s "$SERIAL" shell pidof "$PKG" 2>/dev/null | tr -d '\r' || true)"
  adb -s "$SERIAL" shell am force-stop "$PKG"
  sleep 0.7
  [[ -z "$(adb -s "$SERIAL" shell pidof "$PKG" 2>/dev/null | tr -d '\r' || true)" ]] ||
    fail "$id process survived force-stop"
  launch="$(adb -s "$SERIAL" shell am start -W -n "$MAIN")"
  printf '%s\n' "$launch" > "$dir/batch-launch.txt"
  chmod 600 "$dir/batch-launch.txt"
  grep -q '^Status: ok$' "$dir/batch-launch.txt" || fail "$id launch did not return Status: ok"
  grep -q '^LaunchState: COLD$' "$dir/batch-launch.txt" || fail "$id launch was not COLD"
  sleep 1
  after="$(adb -s "$SERIAL" shell pidof "$PKG" | tr -d '\r')"
  [[ -n "$after" ]] || fail "$id has no process after relaunch"
  printf 'pid_before=%s\npid_after=%s\ntechnical_disposition=CAPTURE_ONLY_NOT_VERDICT\n'     "${before:-NONE}" "$after" > "$dir/batch-action.txt"
  chmod 600 "$dir/batch-action.txt"
  capture_scenario "$id"
}
run_id002() {
  local id="DP5-ID-002" dir tmp
  dir="$(start_scenario "$id")"
  tmp="$STATE/safe-batch-id002.xml"
  adb -s "$SERIAL" exec-out run-as "$PKG" sh -c     'cat shared_prefs/aurora_device_session_metadata.xml' > "$tmp"
  chmod 600 "$tmp"
  python3 - "$tmp" "$MATERIAL" > "$dir/id002-binding.txt" <<'PY'
import hashlib,json,sys,time,xml.etree.ElementTree as ET
xp,mp=sys.argv[1:3]
root=ET.parse(xp).getroot(); v={}
for e in root:
    n=e.attrib.get("name")
    if n: v[n]=e.text if e.tag=="string" else e.attrib.get("value")
m=json.load(open(mp))
def h(x): return hashlib.sha256(str(x).encode()).hexdigest()
checks={
 "device_match": v.get("device_id")==m.get("deviceId"),
 "session_match": v.get("device_session_id")==m.get("deviceSessionId"),
 "active": v.get("device_state")=="ACTIVE",
 "auth_not_expired": int(v.get("gateway_auth_expires_at_ms","0"))>int(time.time()*1000),
}
for k,val in checks.items(): print(f"{k}={'PASS' if val else 'FAIL'}")
print("device_id_sha256="+h(v.get("device_id","")))
print("device_session_id_sha256="+h(v.get("device_session_id","")))
if not all(checks.values()): raise SystemExit(3)
PY
  chmod 600 "$dir/id002-binding.txt"; rm -f "$tmp"
  capture_scenario "$id"
}
run_app001() {
  local id="DP5-APP-001" dir apk_path tmp digest expected_signer actual_signer
  dir="$(start_scenario "$id")"
  apk_path="$(adb -s "$SERIAL" shell pm path "$PKG" | tr -d '\r' | sed -n 's/^package://p' | head -1)"
  [[ -n "$apk_path" ]] || fail "APP-001 package is missing"
  tmp="$STATE/safe-batch-installed.apk"
  adb -s "$SERIAL" exec-out cat "$apk_path" > "$tmp"
  chmod 600 "$tmp"
  digest="$(sha256sum "$tmp" | awk '{print $1}')"
  [[ "$digest" == "$CAMPAIGN_APK_SHA" ]] || fail "APP-001 installed APK bytes drifted"
  expected_signer="$(jq -r '.appAction.trustedSignerSha256' "$MATERIAL")"
  actual_signer="$(apksigner verify --print-certs "$tmp" |
    sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | head -1)"
  [[ "$actual_signer" == "$expected_signer" ]] || fail "APP-001 signer mismatch"
  {
    echo "package_name=$PKG"
    echo "installed_apk_sha256=$digest"
    echo "trusted_signer_sha256=$actual_signer"
    echo "package_present=PASS"
    echo "exact_bytes=PASS"
    echo "trusted_signer=PASS"
    echo "technical_disposition=CAPTURE_ONLY_NOT_VERDICT"
  } > "$dir/app001-package-readback.txt"
  chmod 600 "$dir/app001-package-readback.txt"; rm -f "$tmp"
  capture_scenario "$id"
}
run_lifecycle DP5-LIFE-001
run_lifecycle DP5-LIFE-003
run_id002
run_app001

SUMMARY="$EVID/harness/SAFE_BATCH_01_CAPTURE_SUMMARY.json"
jq '{
  schemaVersion:"dp5-safe-batch-capture-v1",
  batchId:"SAFE_BATCH_01",
  scenarioIds:["DP5-LIFE-001","DP5-LIFE-003","DP5-ID-002","DP5-APP-001"],
  states: [
    .scenarios[]
    | select(.id=="DP5-LIFE-001" or .id=="DP5-LIFE-003" or .id=="DP5-ID-002" or .id=="DP5-APP-001")
    | {id,status,attemptStatus:.attempts[-1].status,capturedAtUtc:.attempts[-1].capturedAtUtc}
  ],
  automationDisposition:"EVIDENCE_CAPTURE_ONLY_NOT_VERDICT",
  authorizesExecution:false,
  physicalAcceptance:false
}' "$CAMPAIGN" > "$SUMMARY"
chmod 600 "$SUMMARY"
sha256sum "$SUMMARY" > "$SUMMARY.sha256"
chmod 600 "$SUMMARY.sha256"

printf 'DP5_SAFE_BATCH_01=CAPTURED_AWAITING_OPERATOR_VERDICTS\n'
printf 'summary=%s\n' "$SUMMARY"
printf 'authorizes_execution=false\nphysical_acceptance=false\n'
