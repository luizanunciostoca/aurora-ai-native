#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora tablet app control failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
command -v adb >/dev/null 2>&1 || fail "adb is missing"

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
PACKAGE_ID="${AURORA_PACKAGE_ID:-ai.aurora.device.local}"
ACTIVITY="${AURORA_MAIN_ACTIVITY:-ai.aurora.device.MainActivity}"
SCREENS="$DEVLAB_ROOT/screenshots"
EVIDENCE="$DEVLAB_ROOT/evidence/manual"
mkdir -p "$SCREENS" "$EVIDENCE"

mapfile -t DEVICES < <(adb devices | awk 'NR > 1 && $2 == "device" {print $1}')
[[ "${#DEVICES[@]}" -eq 1 ]] || fail "exactly one self-ADB device required; found ${#DEVICES[@]}"
SERIAL="${DEVICES[0]}"
ADB=(adb -s "$SERIAL")

cmd="${1:-status}"
case "$cmd" in
  status)
    "${ADB[@]}" shell dumpsys package "$PACKAGE_ID" | sed -n '1,120p'
    ;;
  launch)
    "${ADB[@]}" shell am start -W -n "$PACKAGE_ID/$ACTIVITY"
    ;;
  force-stop)
    "${ADB[@]}" shell am force-stop "$PACKAGE_ID"
    ;;
  grant-mic)
    "${ADB[@]}" shell pm grant "$PACKAGE_ID" android.permission.RECORD_AUDIO
    ;;
  revoke-mic)
    "${ADB[@]}" shell pm revoke "$PACKAGE_ID" android.permission.RECORD_AUDIO
    ;;
  background)
    "${ADB[@]}" shell input keyevent KEYCODE_HOME
    ;;
  screen-off)
    "${ADB[@]}" shell input keyevent KEYCODE_SLEEP
    ;;
  screen-on)
    "${ADB[@]}" shell input keyevent KEYCODE_WAKEUP
    ;;
  battery-saver-on)
    "${ADB[@]}" shell settings put global low_power 1
    ;;
  battery-saver-off)
    "${ADB[@]}" shell settings put global low_power 0
    ;;
  resources)
    ts="$(date -u +%Y%m%dT%H%M%SZ)"
    "${ADB[@]}" shell dumpsys meminfo "$PACKAGE_ID" >"$EVIDENCE/$ts-meminfo.txt"
    "${ADB[@]}" shell dumpsys cpuinfo >"$EVIDENCE/$ts-cpuinfo.txt"
    "${ADB[@]}" shell dumpsys battery >"$EVIDENCE/$ts-battery.txt"
    "${ADB[@]}" shell dumpsys activity services "$PACKAGE_ID" >"$EVIDENCE/$ts-services.txt"
    "${ADB[@]}" shell dumpsys package "$PACKAGE_ID" >"$EVIDENCE/$ts-package.txt"
    printf 'Resource captures written under %s\n' "$EVIDENCE"
    ;;
  screenshot)
    ts="$(date -u +%Y%m%dT%H%M%SZ)"
    "${ADB[@]}" exec-out screencap -p >"$SCREENS/$ts.png"
    printf '%s\n' "$SCREENS/$ts.png"
    ;;
  pm-path)
    "${ADB[@]}" shell pm path "$PACKAGE_ID"
    ;;
  logcat)
    shift
    "${ADB[@]}" logcat "$@"
    ;;
  reboot)
    "${ADB[@]}" reboot
    ;;
  shell)
    shift
    "${ADB[@]}" shell "$@"
    ;;
  *)
    fail "usage: app-control.sh {status|launch|force-stop|grant-mic|revoke-mic|background|screen-off|screen-on|battery-saver-on|battery-saver-off|resources|screenshot|pm-path|logcat|reboot|shell ...}"
    ;;
esac
