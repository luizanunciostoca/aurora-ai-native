#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora Tablet-Only DevLab bootstrap failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || \
  fail "run this script inside the Termux app"
command -v pkg >/dev/null 2>&1 || fail "Termux pkg command is unavailable"

SDK="$(getprop ro.build.version.sdk 2>/dev/null || true)"
[[ "$SDK" =~ ^[0-9]+$ ]] || fail "could not read Android API level"
(( SDK >= 30 )) || fail "Android 11 / API 30 or newer is required for Wireless Debugging"

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
PACKAGES=(
  git
  gh
  curl
  wget
  openssh
  jq
  python
  proot-distro
  android-tools
  postgresql
  coreutils
  findutils
  grep
  sed
  gawk
  tar
  unzip
  zip
  openssl
  rsync
)

printf 'Installing tablet development packages in Termux...\n'
pkg install -y "${PACKAGES[@]}"

mkdir -p \
  "$DEVLAB_ROOT/repos" \
  "$DEVLAB_ROOT/worktrees" \
  "$DEVLAB_ROOT/artifacts" \
  "$DEVLAB_ROOT/evidence" \
  "$DEVLAB_ROOT/host-readiness" \
  "$DEVLAB_ROOT/config" \
  "$DEVLAB_ROOT/state" \
  "$DEVLAB_ROOT/screenshots"
chmod 700 "$DEVLAB_ROOT" "$DEVLAB_ROOT/config" "$DEVLAB_ROOT/state"

# `proot-distro list --installed` output varies across Termux releases. Probe the
# named distro directly so an already-working Debian is never reinstalled.
if ! proot-distro login debian -- /usr/bin/true >/dev/null 2>&1; then
  printf 'Installing Debian PRoot userland...\n'
  proot-distro install debian
fi

cat >"$DEVLAB_ROOT/state/platform.txt" <<EOF
android_api=$SDK
termux_prefix=$PREFIX
termux_uid=$(id -u)
architecture=$(uname -m)
created_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
chmod 600 "$DEVLAB_ROOT/state/platform.txt"

cat <<EOF
Aurora Tablet-Only DevLab Termux bootstrap: READY

Root: $DEVLAB_ROOT
Android API: $SDK
Architecture: $(uname -m)
PostgreSQL runtime: native Termux/Android

Next:
  bash tools/tablet-devlab/setup-debian.sh

Then enable Android Settings > Developer options > Wireless debugging and use:
  bash tools/tablet-devlab/self-adb.sh discover
EOF
