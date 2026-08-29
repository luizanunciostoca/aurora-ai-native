#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./tools/migration/import-v03-baseline.sh /path/to/AURORA_AI_NATIVE_v0.3
#
# Run from the root of a local clone of luizanunciostoca/aurora-ai-native.
# This script copies the repository-safe portion of the v0.3 baseline while
# deliberately excluding secret-bearing or oversized provenance artifacts.

SOURCE_DIR="${1:-}"
if [[ -z "$SOURCE_DIR" || ! -d "$SOURCE_DIR" ]]; then
  echo "Usage: $0 /path/to/AURORA_AI_NATIVE_v0.3" >&2
  exit 2
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

rsync -a --delete-delay \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='venv/' \
  --exclude='.venv/' \
  --exclude='__pycache__/' \
  --exclude='reference/source-archives/Nova aurora.zip' \
  --exclude='**/config/settings.py' \
  "$SOURCE_DIR/" "$REPO_ROOT/"

cat <<'EOF'
Baseline copied.

Before committing:
1. Run a secret scan.
2. Review reference/source-archives and other binaries deliberately.
3. Verify docs/migration/FILE_MAPPING.csv and STRUCTURE_STATUS.csv.
4. Compare the resulting tree with the baseline inventory.
5. Do not restore the legacy hardcoded Manus credential.
EOF

git status --short
