#!/usr/bin/env bash
# Level-order testing: runs levels 0..N in order and stops at the first failing level.
# Usage: scripts/test-level.sh <N> [--only-unit|--only-e2e]
set -euo pipefail
N="${1:?usage: test-level.sh <level> [--only-unit|--only-e2e]}"
MODE="${2:-all}"
cd "$(dirname "$0")/.."

for ((i = 0; i <= N; i++)); do
  dir="tests/level$i"
  echo "━━━ Level $i ━━━"
  if [[ "$MODE" != "--only-e2e" ]] && compgen -G "$dir/*.test.ts" > /dev/null; then
    pnpm exec vitest run "$dir" || { echo "✗ Level $i unit tests failed"; exit 1; }
  fi
  if [[ "$MODE" != "--only-unit" ]] && compgen -G "$dir/*.e2e.ts" > /dev/null; then
    pnpm exec playwright test "$dir" || { echo "✗ Level $i e2e tests failed"; exit 1; }
  fi
  echo "✓ Level $i green"
done
echo "All levels 0..$N green."
