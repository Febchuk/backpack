#!/usr/bin/env bash
# Finishes the Level 2 gate once GEMINI_API_KEY is in .env. Stops at the first failure.
#   bash scripts/l2-finish.sh
# See docs/L2_FINISH.md for what each step proves.
set -euo pipefail
cd "$(dirname "$0")/.."

# Non-empty value of KEY in .env, without printing it.
has_env() {
  [[ -f .env ]] && grep -Eq "^[[:space:]]*(export[[:space:]]+)?$1[[:space:]]*=[[:space:]]*[\"']?[^\"'[:space:]#]" .env
}

has_env GEMINI_API_KEY || { echo "✗ GEMINI_API_KEY is empty or missing in .env. Add it and rerun." >&2; exit 1; }
echo "✓ GEMINI_API_KEY present in .env"
has_env DIAL_API_KEY || echo "! DIAL_API_KEY is empty: the Dial live test will be skipped, not passed."

step() {
  echo
  echo "━━━ $1 ━━━"
  shift
  "$@" || { echo "✗ failed: $*" >&2; exit 1; }
}

step "1/4 live contract tests (real Gemini + Dial)" \
  env LIVE=1 pnpm exec vitest run tests/level2/gemini.live.test.ts tests/level2/dial.live.test.ts
step "2/4 Gemini latency (writes docs/LATENCY.md)" \
  pnpm exec tsx scripts/gemini/latency.ts
step "3/4 Gemini art into staging (art/gemini/)" \
  pnpm exec tsx scripts/assets/gen-gemini.ts
step "4/4 levels 0-2 unit tests in mock mode" \
  bash scripts/test-level.sh 2 --only-unit

cat <<'EOF'

✓ L2 automated checks done. A human still has to:
  1. Review art/gemini/contact.png, then promote the approved art:
       pnpm exec tsx scripts/assets/promote-gemini.ts <key...>    (or --all)
     Regenerate a bad one with: pnpm exec tsx scripts/assets/gen-gemini.ts --only <key> [--seed <n>]
  2. Push the env to Railway:   bash scripts/railway/sync-env.sh --real   (try --dry-run first)
  3. Deploy:                    railway up
  4. Ring a phone: TEST_PHONE=<teammate's E.164> pnpm exec tsx scripts/dial/smoke-call.ts https://<railway-domain>
     (the phone must ring in < 30 s).
EOF
