#!/usr/bin/env bash
# Copies the server's variables from .env to the Railway service (default "server").
# Run it yourself, from a shell where `railway login` and `railway link` are done.
#
#   bash scripts/railway/sync-env.sh [--dry-run] [--env <file>] [--service <name>] [--environment <name>] [--real]
#
#   --dry-run       list what would be set; never calls railway
#   --env <file>    env file to read (default: .env at the repo root)
#   --real          force MOCK_GEMINI=0 and MOCK_DIAL=0 on Railway, whatever .env says
#
# Values are never printed: only the names of the variables set. Empty variables are skipped.
# DB_PATH is always /data/backpack.db (the Railway volume). Variables are set with --skip-deploys;
# deploy afterwards with `railway up`.
set -euo pipefail
cd "$(dirname "$0")/../.."

ENV_FILE=".env"
SERVICE="server"
ENVIRONMENT=""
DRY_RUN=0
REAL=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --real) REAL=1 ;;
    --env) ENV_FILE="${2:?--env needs a file}"; shift ;;
    --service) SERVICE="${2:?--service needs a name}"; shift ;;
    --environment) ENVIRONMENT="${2:?--environment needs a name}"; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

[[ -f "$ENV_FILE" ]] || { echo "no env file at $ENV_FILE" >&2; exit 1; }

# Which .env keys go to the server. Exact names, or a prefix ending in *.
WANTED=(MOCK_DIAL MOCK_GEMINI 'DIAL_*' GEMINI_API_KEY GEMINI_NPC_MODEL VOICE_MODE 'ELEVENLABS_*' DIAL_SELF_HOSTED_SECRET)

wanted() {
  local k="$1" w
  for w in "${WANTED[@]}"; do
    if [[ "$w" == *'*' ]]; then [[ "$k" == "${w%\*}"* ]] && return 0
    else [[ "$k" == "$w" ]] && return 0; fi
  done
  return 1
}

# Parse KEY=VALUE lines without evaluating them: comments, blank lines and `export ` are allowed,
# one level of matching single or double quotes is stripped. Later lines win.
declare -a KEYS=()
declare -a VALS=()
set_kv() {
  local i
  for i in "${!KEYS[@]}"; do
    if [[ "${KEYS[$i]}" == "$1" ]]; then VALS[$i]="$2"; return; fi
  done
  KEYS+=("$1"); VALS+=("$2")
}
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line#export }"
  [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]] || continue
  key="${BASH_REMATCH[1]}"
  val="${BASH_REMATCH[2]}"
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  if [[ "$val" =~ ^\"(.*)\"$ || "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"
  else val="${val%%[[:space:]]#*}"; fi  # unquoted: drop a trailing " # comment"
  wanted "$key" && set_kv "$key" "$val"
done < "$ENV_FILE"

if [[ $REAL -eq 1 ]]; then set_kv MOCK_GEMINI 0; set_kv MOCK_DIAL 0; fi
set_kv DB_PATH /data/backpack.db

ARGS=()
NAMES=()
SKIPPED=()
for i in "${!KEYS[@]}"; do
  if [[ -z "${VALS[$i]}" ]]; then SKIPPED+=("${KEYS[$i]}"); continue; fi
  ARGS+=(--set "${KEYS[$i]}=${VALS[$i]}")
  NAMES+=("${KEYS[$i]}")
done

for m in MOCK_GEMINI MOCK_DIAL; do
  for i in "${!KEYS[@]}"; do
    if [[ "${KEYS[$i]}" == "$m" && "${VALS[$i]}" != "0" ]]; then
      echo "warning: $m is not 0, so the deployed server will use the mock. Rerun with --real to force real services." >&2
    fi
  done
done

[[ ${#NAMES[@]} -gt 0 ]] || { echo "nothing to set" >&2; exit 1; }

target="service '$SERVICE'${ENVIRONMENT:+, environment '$ENVIRONMENT'}"
if [[ $DRY_RUN -eq 1 ]]; then
  echo "[dry-run] would set on Railway $target from $ENV_FILE:"
else
  command -v railway > /dev/null || { echo "railway CLI not found (brew install railway)" >&2; exit 1; }
  RW=(railway variables --service "$SERVICE" --skip-deploys)
  [[ -n "$ENVIRONMENT" ]] && RW+=(--environment "$ENVIRONMENT")
  # The CLI's own output can echo values; keep it off the terminal and show only errors' exit status.
  if ! "${RW[@]}" "${ARGS[@]}" > /dev/null 2>&1; then
    echo "railway variables failed (is the project linked? run: railway link). Nothing printed to avoid leaking values." >&2
    exit 1
  fi
  echo "set on Railway $target:"
fi
printf '  %s\n' "${NAMES[@]}"
[[ ${#SKIPPED[@]} -eq 0 ]] || echo "skipped (empty): ${SKIPPED[*]}"
echo "Also set PUBLIC_URL on Railway to the service's public https URL (not copied: .env usually holds a local tunnel)."
[[ $DRY_RUN -eq 1 ]] || echo "Next: railway up"
