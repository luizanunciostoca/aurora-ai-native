#!/usr/bin/env bash
set -euo pipefail

is_forbidden_path() {
  local path="$1"
  local lower="${path,,}"
  local base="${lower##*/}"

  if [[ "$base" == ".env.example" ]]; then
    return 1
  fi

  if [[ "$base" == ".env" || "$base" == .env.* ]]; then
    return 0
  fi

  case "$base" in
    credentials.json|service-account.json|service-account-key.json|.netrc|.pypirc|auth.json|id_rsa|id_ed25519)
      return 0
      ;;
  esac

  case "$lower" in
    *.pem|*.key|*.p8|*.p12|*.pfx|*.jks|*.keystore|*.kdbx)
      return 0
      ;;
    *.zip|*.7z|*.rar|*.tar|*.tgz|*.tar.gz|*.tar.bz2|*.tar.xz)
      return 0
      ;;
  esac

  if [[ "$lower" == */manus/config/settings.py ]]; then
    return 0
  fi

  return 1
}

self_test() {
  local failed=0
  local forbidden_cases=(
    ".env"
    ".env.production"
    "secrets/private.pem"
    "reference/source-archives/provenance.zip"
    "reference/original-manus/manus/config/settings.py"
  )

  for path in "${forbidden_cases[@]}"; do
    if ! is_forbidden_path "$path"; then
      echo "Sensitive-file self-test failed for a prohibited path class." >&2
      failed=1
    fi
  done

  if is_forbidden_path ".env.example"; then
    echo "Sensitive-file self-test failed: .env.example must be allowed." >&2
    failed=1
  fi

  if (( failed != 0 )); then
    exit 1
  fi

  echo "Sensitive-file self-test passed."
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
  exit 0
fi

violations=0
while IFS= read -r -d '' path; do
  if is_forbidden_path "$path"; then
    echo "ERROR: prohibited sensitive file class is tracked at: $path" >&2
    violations=$((violations + 1))
  fi
done < <(git ls-files -z)

if (( violations != 0 )); then
  echo "Sensitive-file gate failed with ${violations} prohibited tracked path(s)." >&2
  exit 1
fi

echo "Sensitive-file gate passed."
