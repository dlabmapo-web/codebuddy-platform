#!/usr/bin/env bash
set -euo pipefail
stream_repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$stream_repo"
stream_fixture_id="$(date +%s)-$$"
stream_container="cove-practice-stream-test-$stream_fixture_id"
cleanup() {
  if [ "$(docker inspect -f '{{index .Config.Labels "cove.practice-stream.task4"}}' "$stream_container" 2>/dev/null || true)" = "$stream_fixture_id" ]; then
    docker rm -f "$stream_container" >/dev/null
  fi
}
trap cleanup EXIT
export DOTENV_CONFIG_PATH=/dev/null
docker run -d --name "$stream_container" --label "cove.practice-stream.task4=$stream_fixture_id" --memory=128m --cpus=.25 --pids-limit=64 -p 127.0.0.1::6379 redis:7-alpine --save '' --appendonly no --maxmemory 64mb --maxmemory-policy noeviction >/dev/null
for stream_try in {1..40}; do
  if docker exec "$stream_container" redis-cli ping >/dev/null 2>&1; then break; fi
  sleep .25
done
stream_port="$(docker port "$stream_container" 6379/tcp | sed 's/.*://')"
export COVE_PRACTICE_STREAM_TEST_REDIS_URL="redis://127.0.0.1:$stream_port/0"
export COVE_PRACTICE_STREAM_FIXTURE_ID="$stream_fixture_id"
pnpm --filter @cove/api exec vitest run src/learn/submission-stream-startup.integration.spec.ts
