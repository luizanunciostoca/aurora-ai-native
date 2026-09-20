#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora W15-J runtime Android candidate failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in git adb sha256sum stat; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"; done

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
ANDROID_DIR="$DEVLAB_ROOT/worktrees/android"
ARTIFACT_DIR="$DEVLAB_ROOT/artifacts"
APK="$ARTIFACT_DIR/Aurora-W15J-Physical-localDebug.apk"
IDENTITY="$ARTIFACT_DIR/BUILD_IDENTITY.txt"
SIGNING="$ARTIFACT_DIR/FINAL_SIGNING_IDENTITY.txt"
STATE_DIR="$DEVLAB_ROOT/state"
OUT="$STATE_DIR/w15j-runtime-android-candidate.txt"
PACKAGE_ID="${AURORA_PACKAGE_ID:-ai.aurora.device.local}"

[[ -f "$APK" && ! -L "$APK" ]] || fail "signed runtime APK is missing"
[[ -f "$IDENTITY" && ! -L "$IDENTITY" ]] || fail "BUILD_IDENTITY is missing"
[[ -f "$SIGNING" && ! -L "$SIGNING" ]] || fail "FINAL_SIGNING_IDENTITY is missing"
[[ -d "$ANDROID_DIR/.git" || -f "$ANDROID_DIR/.git" ]] || fail "Android worktree is missing"
ANDROID_SHA="$(git -C "$ANDROID_DIR" rev-parse HEAD)"
[[ "$ANDROID_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "Android SHA is malformed"
[[ -z "$(git -C "$ANDROID_DIR" status --porcelain)" ]] || fail "Android worktree is dirty"
EMBEDDED_ANDROID="$(sed -n 's/^source_candidate_sha=//p' "$IDENTITY")"
[[ "$EMBEDDED_ANDROID" == "$ANDROID_SHA" ]] || fail "artifact source candidate does not match Android worktree"
APK_SHA="$(sha256sum "$APK" | awk '{print $1}')"
[[ "$APK_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "runtime APK SHA is malformed"
[[ "$(sed -n 's/^final_apk_sha256=//p' "$SIGNING")" == "$APK_SHA" ]] || fail "final signing identity does not match runtime APK"

mapfile -t DEVICES < <(adb devices | awk 'NR>1 && $2=="device" {print $1}')
[[ "${#DEVICES[@]}" -eq 1 ]] || fail "exactly one authorized self-ADB device is required"
SERIAL="${DEVICES[0]}"
mapfile -t PACKAGE_PATHS < <(adb -s "$SERIAL" shell pm path "$PACKAGE_ID" 2>/dev/null | tr -d '\r' | sed -n 's/^package://p')
[[ "${#PACKAGE_PATHS[@]}" -eq 1 ]] || fail "exactly one installed Aurora base APK is required"
[[ "${PACKAGE_PATHS[0]}" == */base.apk ]] || fail "installed Aurora package is split/non-canonical"
INSTALLED_SHA="$(adb -s "$SERIAL" shell sha256sum "${PACKAGE_PATHS[0]}" | tr -d '\r' | awk '{print $1}')"
[[ "$INSTALLED_SHA" == "$APK_SHA" ]] || fail "installed APK does not match the signed runtime artifact"

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
umask 077
TMP="$OUT.tmp-$$"
cat >"$TMP" <<EOF
kind=W15J_RUNTIME_ANDROID_CANDIDATE_V1
android_sha=$ANDROID_SHA
apk_sha256=$APK_SHA
package_id=$PACKAGE_ID
source_ref=github-pr-413-head-$ANDROID_SHA
authorizes_execution=false
physical_acceptance=false
EOF
chmod 600 "$TMP"
mv "$TMP" "$OUT"
printf 'W15J_RUNTIME_ANDROID_CANDIDATE=RECORDED_NOT_AUTHORITY\nandroid_sha=%s\napk_sha256=%s\n' "$ANDROID_SHA" "$APK_SHA"
