#!/usr/bin/env bash
#
# Nudges club prices up/down so you can watch Market and Portfolio react in
# the app, without waiting for a real match to settle. Talks to the
# already-running dev server's dev-only /internal/simulate endpoint.
#
# Usage:
#   ./scripts/simulate-market.sh                  # jitter EVERY club by a random +/-8%
#   ./scripts/simulate-market.sh ARS               # jitter just Arsenal by a random +/-8%
#   ./scripts/simulate-market.sh ARS 15            # move Arsenal up 15%
#   ./scripts/simulate-market.sh ARS -15            # move Arsenal down 15%
#   ./scripts/simulate-market.sh --loop             # jitter every club every 3s, forever (Ctrl+C to stop)
#   ./scripts/simulate-market.sh --loop 5           # same, every 5s
#   ./scripts/simulate-market.sh --loop 5 ARS       # loop, only moving Arsenal each tick
#
# Club can be given as its 3-letter code (ARS, LIV, MCI, ...) or full club_id.
# The app polls every ~2.2s, so changes show up almost immediately.

set -euo pipefail

API="${TICKER_API_URL:-http://localhost:4000}"

usage() {
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
}

run_once() {
  local club="$1" pct="$2"
  local body="{}"
  if [[ -n "$club" && -n "$pct" ]]; then
    body="{\"club\":\"$club\",\"pct\":$pct}"
  elif [[ -n "$club" ]]; then
    body="{\"club\":\"$club\"}"
  elif [[ -n "$pct" ]]; then
    body="{\"pct\":$pct}"
  fi

  local resp
  if ! resp=$(curl -sf -X POST "$API/internal/simulate" -H "Content-Type: application/json" -d "$body"); then
    echo "Request failed — is the backend running? (npm run dev in server/)" >&2
    exit 1
  fi

  echo "$resp" | python3 -c '
import json, sys
d = json.load(sys.stdin)
for m in d["moves"]:
    code = m["code"]
    name = m["name"]
    old_price = m["oldPrice"]
    new_price = m["newPrice"]
    pct = m["impactPct"]
    arrow = "up" if pct >= 0 else "down"
    print(f"  {code:>4} {name:<20} ${old_price:.2f} -> ${new_price:.2f}  ({arrow} {pct:+.1f}%)")
'
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "${1:-}" == "--loop" ]]; then
  shift
  interval="3"
  if [[ "${1:-}" =~ ^[0-9]+$ ]]; then
    interval="$1"
    shift
  fi
  club="${1:-}"
  echo "Jittering ${club:-every club} every ${interval}s. Ctrl+C to stop."
  while true; do
    echo "--- $(date '+%H:%M:%S') ---"
    run_once "$club" ""
    sleep "$interval"
  done
else
  club="${1:-}"
  pct="${2:-}"
  run_once "$club" "$pct"
fi
