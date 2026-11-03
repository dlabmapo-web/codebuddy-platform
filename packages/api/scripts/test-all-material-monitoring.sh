#!/usr/bin/env bash
set -euo pipefail
observation_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$observation_root"
for observation_port in 3309 4319 4320 4339 4029; do
  if lsof -nP -iTCP:"$observation_port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Local monitoring test port $observation_port is already in use." >&2
    exit 1
  fi
done
observation_run="$(date +%s)-$$"
observation_pg="cove-observation-pg-$observation_run"
observation_redis="cove-observation-redis-$observation_run"
observation_gui_pid=''
observation_media="$(mktemp -d -t cove-observation-media)"
cleanup() {
  if [[ -n "$observation_gui_pid" ]]; then kill "$observation_gui_pid" 2>/dev/null || true; fi
  docker rm -f "$observation_pg" "$observation_redis" >/dev/null 2>&1 || true
  rm -rf -- "$observation_media"
}
trap cleanup EXIT
docker image inspect cove-turtle-trial:dev >/dev/null
docker run -d --name "$observation_pg" -e POSTGRES_PASSWORD=cove-observation-local-only -e POSTGRES_DB=cove_dlab_test -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
docker run -d --name "$observation_redis" -p 127.0.0.1::6379 redis:7-alpine >/dev/null
for observation_attempt in {1..60}; do
  if docker exec "$observation_pg" pg_isready -h 127.0.0.1 -U postgres -d cove_dlab_test >/dev/null 2>&1; then break; fi
  sleep 0.5
done
observation_pg_port="$(docker port "$observation_pg" 5432/tcp | sed 's/.*://')"
observation_redis_port="$(docker port "$observation_redis" 6379/tcp | sed 's/.*://')"
export COVE_DLAB_TEST_DATABASE_URL="postgresql://postgres:cove-observation-local-only@127.0.0.1:$observation_pg_port/cove_dlab_test"
export COVE_DLAB_TEST_REDIS_URL="redis://127.0.0.1:$observation_redis_port/0"
export COVE_OBSERVATION_E2E=1 COVE_OBSERVATION_MEDIA_DIR="$observation_media"
docker exec -i "$observation_pg" psql -U postgres -d cove_dlab_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS 'SELECT NULL::uuid';
CREATE SCHEMA storage;
CREATE TABLE storage.objects (id UUID, bucket_id TEXT, name TEXT);
SQL
DATABASE_URL="$COVE_DLAB_TEST_DATABASE_URL" DIRECT_URL="$COVE_DLAB_TEST_DATABASE_URL" pnpm --filter @cove/api db:migrate:deploy
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=blue:s=320x180:r=24 -t 10 -c:v libx264 -pix_fmt yuv420p -movflags +faststart -y "$observation_media/video.mp4"
ffmpeg -hide_banner -loglevel error -i "$observation_media/video.mp4" -c copy -hls_time 2 -hls_list_size 0 -hls_segment_filename "$observation_media/segment-%03d.ts" -y "$observation_media/master.m3u8"
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=blue:s=320x180 -frames:v 1 -y "$observation_media/poster.jpg"
NODE_ENV=test GUI_INSTANCE_ID="observation-$observation_run" GUI_SERVICE_SECRET=local-observation-runtime-secret-never-production GUI_RUNTIME_IMAGE=cove-turtle-trial:dev GUI_ALLOWED_ORIGINS=http://127.0.0.1:3309 GUI_PORT=4029 GUI_SESSION_CAPACITY=2 GUI_BIND_ADDRESS=127.0.0.1 node packages/gui-runtime/src/server.mjs &
observation_gui_pid=$!
for observation_attempt in {1..60}; do
  if curl --fail --silent -H 'Authorization: Bearer local-observation-runtime-secret-never-production' http://127.0.0.1:4029/health >/dev/null; then break; fi
  sleep 0.5
done
curl --fail --silent -H 'Authorization: Bearer local-observation-runtime-secret-never-production' http://127.0.0.1:4029/health >/dev/null
pnpm --filter @cove/shared build
pnpm --filter @cove/api build
pnpm exec playwright test --config e2e/all-material-monitoring.playwright.config.ts "$@"
