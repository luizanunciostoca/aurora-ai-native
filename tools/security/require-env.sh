#!/usr/bin/env bash
set -euo pipefail

validate_required_env() {
  if (( $# == 0 )); then
    echo "Usage: $0 ENV_NAME [ENV_NAME ...]" >&2
    return 2
  fi

  local missing=0
  local name
  for name in "$@"; do
    if [[ ! "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      echo "ERROR: invalid environment variable name: $name" >&2
      missing=1
      continue
    fi

    if [[ -z "${!name:-}" ]]; then
      echo "ERROR: required environment variable is missing or blank: $name" >&2
      missing=1
    fi
  done

  if (( missing != 0 )); then
    return 1
  fi

  return 0
}

self_test() {
  unset AURORA_SECURITY_SELF_TEST_REQUIRED
  if validate_required_env AURORA_SECURITY_SELF_TEST_REQUIRED >/dev/null 2>&1; then
    echo "Required-env self-test failed: missing configuration was accepted." >&2
    return 1
  fi

  export AURORA_SECURITY_SELF_TEST_REQUIRED="present"
  validate_required_env AURORA_SECURITY_SELF_TEST_REQUIRED >/dev/null
  unset AURORA_SECURITY_SELF_TEST_REQUIRED
  echo "Required-env self-test passed."
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
  exit 0
fi

validate_required_env "$@"
