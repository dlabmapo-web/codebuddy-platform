#!/usr/bin/env bash

set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
result_dir="${LOAD_RESULT_DIR:-$script_dir/results}"
mkdir -p "$result_dir"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
docker run --rm \
  -e HOME_URL="${HOME_URL:-https://coveedu.com}" \
  -e STUDIO_URL="${STUDIO_URL:-https://cs.coveedu.com}" \
  -e API_URL="${API_URL:-https://api.coveedu.com}" \
  -e AUTHENTICATED_PATH="${AUTHENTICATED_PATH:-}" \
  -e AUTHENTICATED_COOKIE="${AUTHENTICATED_COOKIE:-}" \
  -v "$script_dir:/scripts:ro" \
  -v "$result_dir:/results" \
  grafana/k6:0.57.0 run \
    --summary-export "/results/summary-${timestamp}.json" \
    /scripts/k6.js

printf 'Load-test evidence: %s/summary-%s.json\n' "$result_dir" "$timestamp"
