#!/usr/bin/env bash
# Level-order testing: runs levels 0..N in order and stops at the first failing level.
# Usage: scripts/test-level.sh <N|coach> [--only-unit|--only-e2e]
set -euo pipefail
N="${1:?usage: test-level.sh <level|coach> [--only-unit|--only-e2e]}"
MODE="${2:-all}"
cd "$(dirname "$0")/.."

# The phone coach (apps/coach) is gated on its own, independent of the game levels.
if [[ "$N" == "coach" ]]; then
  echo "━━━ Coach ━━━"
  if [[ "$MODE" != "--only-e2e" ]]; then pnpm exec vitest run tests/coach || { echo "✗ Coach unit tests failed"; exit 1; }; fi
  if [[ "$MODE" != "--only-unit" ]] && compgen -G "tests/coach/*.e2e.ts" > /dev/null; then
    pnpm exec playwright test tests/coach || { echo "✗ Coach e2e tests failed"; exit 1; }
  fi
  echo "✓ Coach green"
  exit 0
fi

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
