#!/usr/bin/env bash
set -euo pipefail

is_legacy_path() {
  local path="$1"
  [[ "$path" == reference/* ]] ||
    [[ "$path" == */legacy-reference/* ]] ||
    [[ "$path" == */legacy-manus-reference/* ]]
}

active_package_manifests=()
while IFS= read -r -d '' path; do
  if [[ "${path##*/}" == "package.json" ]] && ! is_legacy_path "$path"; then
    active_package_manifests+=("$path")
  fi
done < <(git ls-files -z)

canonical_root_locks=()
for lock in pnpm-lock.yaml package-lock.json npm-shrinkwrap.json yarn.lock bun.lock bun.lockb; do
  if [[ -f "$lock" ]] && git ls-files --error-unmatch -- "$lock" >/dev/null 2>&1; then
    canonical_root_locks+=("$lock")
  fi
done

if (( ${#active_package_manifests[@]} == 0 )); then
  echo "Dependency hygiene passed: no ACTIVE_RUNTIME Node manifest exists yet; legacy/reference manifests are excluded from runtime authority."
  exit 0
fi

if (( ${#canonical_root_locks[@]} == 0 )); then
  echo "Dependency hygiene failed: ACTIVE_RUNTIME package.json exists without a canonical tracked root lockfile." >&2
  exit 1
fi

if (( ${#canonical_root_locks[@]} > 1 )); then
  echo "Dependency hygiene failed: multiple canonical root lockfiles are tracked; package-manager authority is ambiguous." >&2
  exit 1
fi

echo "Dependency hygiene passed: ACTIVE_RUNTIME Node dependency graph has exactly one canonical root lockfile."
