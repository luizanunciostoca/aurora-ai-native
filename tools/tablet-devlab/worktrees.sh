#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora Tablet-Only worktree setup failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
command -v git >/dev/null 2>&1 || fail "git is missing"

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
REPO="$DEVLAB_ROOT/repos/aurora-ai-native"
WORKTREES="$DEVLAB_ROOT/worktrees"
REPOSITORY_URL="${AURORA_REPOSITORY_URL:-https://github.com/luizanunciostoca/aurora-ai-native.git}"

MAIN_SHA="${AURORA_MAIN_SHA:-d2089407e88480686b879928cf2863c0dc81718e}"
ANDROID_SHA="${AURORA_ANDROID_SHA:-6d44480eae9b99467b20df44290b5c9b17626c3e}"
HOST_SHA="${AURORA_HOST_SHA:-32f1056ea154eab5b9b85ec83038caf87c4227f8}"
DEVLAB_BRANCH="${AURORA_DEVLAB_BRANCH:-tooling/tablet-only-devlab}"

mkdir -p "$DEVLAB_ROOT/repos" "$WORKTREES"
if [[ ! -d "$REPO/.git" ]]; then
  git clone "$REPOSITORY_URL" "$REPO"
fi

git -C "$REPO" fetch --all --prune
for ref in "$MAIN_SHA" "$ANDROID_SHA" "$HOST_SHA" "origin/$DEVLAB_BRANCH"; do
  git -C "$REPO" rev-parse --verify "$ref^{commit}" >/dev/null 2>&1 || fail "required ref missing: $ref"
done

ensure_detached_worktree() {
  local path="$1"
  local sha="$2"
  if [[ -d "$path/.git" || -f "$path/.git" ]]; then
    local actual
    actual="$(git -C "$path" rev-parse HEAD)"
    [[ "$actual" == "$sha" ]] || fail "existing worktree $path is $actual, expected $sha"
    [[ -z "$(git -C "$path" status --porcelain)" ]] || fail "existing exact worktree is dirty: $path"
    return
  fi
  [[ ! -e "$path" ]] || fail "path exists but is not a Git worktree: $path"
  git -C "$REPO" worktree add --detach "$path" "$sha"
}

ensure_branch_worktree() {
  local path="$1"
  if [[ -d "$path/.git" || -f "$path/.git" ]]; then
    local branch
    branch="$(git -C "$path" branch --show-current)"
    [[ "$branch" == "$DEVLAB_BRANCH" ]] || fail "existing devlab worktree is on $branch, expected $DEVLAB_BRANCH"
    return
  fi
  [[ ! -e "$path" ]] || fail "path exists but is not a Git worktree: $path"
  if git -C "$REPO" show-ref --verify --quiet "refs/heads/$DEVLAB_BRANCH"; then
    git -C "$REPO" worktree add "$path" "$DEVLAB_BRANCH"
  else
    git -C "$REPO" worktree add -b "$DEVLAB_BRANCH" "$path" "origin/$DEVLAB_BRANCH"
  fi
}

ensure_detached_worktree "$WORKTREES/android" "$ANDROID_SHA"
ensure_detached_worktree "$WORKTREES/host" "$HOST_SHA"
ensure_detached_worktree "$WORKTREES/main" "$MAIN_SHA"
ensure_branch_worktree "$WORKTREES/devlab"

cat >"$DEVLAB_ROOT/state/worktrees.txt" <<EOF
main=$MAIN_SHA
android=$ANDROID_SHA
host=$HOST_SHA
devlab_branch=$DEVLAB_BRANCH
repo=$REPO
android_worktree=$WORKTREES/android
host_worktree=$WORKTREES/host
main_worktree=$WORKTREES/main
devlab_worktree=$WORKTREES/devlab
configured_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
chmod 600 "$DEVLAB_ROOT/state/worktrees.txt"

cat <<EOF
Tablet DevLab worktrees: READY

main    $MAIN_SHA
android $ANDROID_SHA
host    $HOST_SHA
devlab  $DEVLAB_BRANCH

Exact Android/host/main worktrees are detached and must remain clean.
Do development changes only under:
  $WORKTREES/devlab
EOF
