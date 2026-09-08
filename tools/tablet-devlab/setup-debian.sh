#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora Tablet-Only Debian setup failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
command -v proot-distro >/dev/null 2>&1 || fail "proot-distro is missing; run bootstrap-termux.sh first"

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
TERMUX_UID="$(id -u)"
TERMUX_GID="$(id -g)"

proot-distro login debian -- bash -lc "
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y git curl ca-certificates build-essential python3 python3-pip jq unzip zip openssh-client postgresql postgresql-client procps lsof

# Android app UIDs/GIDs are high numeric values. A freshly created Debian/PRoot
# may already contain an unrelated group with the same numeric GID. Reuse the
# numeric GID instead of failing because the group name `aurora` is absent.
if ! getent group $TERMUX_GID >/dev/null 2>&1; then
  groupadd -g $TERMUX_GID aurora
fi

if ! id aurora >/dev/null 2>&1; then
  if getent passwd $TERMUX_UID >/dev/null 2>&1; then
    useradd -o -m -u $TERMUX_UID -g $TERMUX_GID -s /bin/bash aurora
  else
    useradd -m -u $TERMUX_UID -g $TERMUX_GID -s /bin/bash aurora
  fi
fi

[[ \"\$(id -u aurora)\" == \"$TERMUX_UID\" ]] || { echo 'aurora UID does not match Termux UID' >&2; exit 2; }
[[ \"\$(id -g aurora)\" == \"$TERMUX_GID\" ]] || { echo 'aurora GID does not match Termux GID' >&2; exit 2; }
install -d -m 0700 -o $TERMUX_UID -g $TERMUX_GID /home/aurora/.nvm
"

proot-distro login debian --user aurora -- bash -lc '
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  rm -rf "$NVM_DIR"/*
  git clone --filter=blob:none --branch v0.40.3 https://github.com/nvm-sh/nvm.git "$NVM_DIR"
fi
# shellcheck disable=SC1090
source "$NVM_DIR/nvm.sh"
nvm install 22
nvm alias default 22
nvm use 22
node -e '\''const [major,minor]=process.versions.node.split(".").map(Number); if (major!==22 || minor<16) { console.error(`Node ${process.versions.node} is outside >=22.16 <23`); process.exit(2); }'\''
npm --version
'

proot-distro login debian -- bash -lc '
set -euo pipefail
[[ -x /usr/bin/git ]] || { echo "/usr/bin/git missing" >&2; exit 2; }
[[ "$(stat -c %u /usr/bin/git)" == "0" ]] || { echo "/usr/bin/git must be root-owned" >&2; exit 2; }
mode=$(stat -c %a /usr/bin/git)
other=$((10#$mode % 10))
group=$(((10#$mode / 10) % 10))
(( (group & 2) == 0 && (other & 2) == 0 )) || { echo "/usr/bin/git must not be group/other writable" >&2; exit 2; }
'

mkdir -p "$DEVLAB_ROOT/state"
cat >"$DEVLAB_ROOT/state/debian.txt" <<EOF
termux_uid=$TERMUX_UID
termux_gid=$TERMUX_GID
debian_user=aurora
node_requirement=>=22.16.0 <23
configured_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
chmod 600 "$DEVLAB_ROOT/state/debian.txt"

cat <<'EOF'
Debian/PRoot setup: READY

The host will run as Debian user `aurora`, whose UID/GID mirrors the Termux app.
If Debian already owns the numeric Termux GID under another group name, that numeric GID is reused safely instead of creating a conflicting duplicate group.
This lets W15-J readiness directories live in the shared Termux workspace while `/usr/bin/git` remains root-owned in Debian.

Next: enable Wireless debugging and run self-adb.sh.
EOF
