#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

MAIN="$ROOT/app/src/main/kotlin/ai/aurora/device"

kotlinc \
  "$MAIN/config/RuntimeEnvironmentConfig.kt" \
  "$MAIN/lifecycle/PresenceModel.kt" \
  "$MAIN/lifecycle/PresenceReducer.kt" \
  "$MAIN/lifecycle/PresenceEngine.kt" \
  "$MAIN/session/SessionLifecycleHooks.kt" \
  "$ROOT/verification/W15AFundamentalsVerification.kt" \
  -include-runtime \
  -d "$OUT/w15a-verification.jar"

java -jar "$OUT/w15a-verification.jar"
