#!/usr/bin/env bash
# Isolated, reproducible API and localhost browser verification. Requires Docker and ffmpeg.
set -euo pipefail
web_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$web_root"
for web_port in 3309 4319 4320; do
  if lsof -nP -iTCP:"$web_port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Web-course test port $web_port is already in use." >&2; exit 1
  fi
done
web_run="$(date +%s)-$$"
web_pg="cove-web-courses-pg-$web_run"
web_redis="cove-web-courses-redis-$web_run"
web_build="$(mktemp -d "$web_root/packages/api/.web-courses-e2e-XXXXXX")"
web_media="$(mktemp -d -t cove-web-courses-media)"
cleanup() {
  docker rm -f "$web_pg" "$web_redis" >/dev/null 2>&1 || true
  rm -rf -- "$web_build" "$web_media"
}
trap cleanup EXIT
docker run -d --name "$web_pg" -e POSTGRES_PASSWORD=web-local-only -e POSTGRES_DB=cove_dlab_test -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
docker run -d --name "$web_redis" -p 127.0.0.1::6379 redis:7-alpine >/dev/null
for web_attempt in {1..120}; do
  if docker exec "$web_pg" pg_isready -h 127.0.0.1 -U postgres -d cove_dlab_test >/dev/null 2>&1; then break; fi
  sleep 0.5
done
web_pg_port="$(docker port "$web_pg" 5432/tcp | sed 's/.*://')"
web_redis_port="$(docker port "$web_redis" 6379/tcp | sed 's/.*://')"
export COVE_DLAB_TEST_DATABASE_URL="postgresql://postgres:web-local-only@127.0.0.1:$web_pg_port/cove_dlab_test"
export COVE_DLAB_TEST_REDIS_URL="redis://127.0.0.1:$web_redis_port/0"
export COVE_INTEGRATION_DATABASE_URL="$COVE_DLAB_TEST_DATABASE_URL"
export DATABASE_URL="$COVE_DLAB_TEST_DATABASE_URL" DIRECT_URL="$COVE_DLAB_TEST_DATABASE_URL"
export COVE_DLAB_API_BUILD_DIR="file://$web_build" COVE_WEB_COURSES_E2E=1 COVE_OBSERVATION_MEDIA_DIR="$web_media"
docker exec -i "$web_pg" psql -U postgres -d cove_dlab_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS 'SELECT NULL::uuid';
CREATE SCHEMA storage;
CREATE TABLE storage.objects (id UUID, bucket_id TEXT, name TEXT);
SQL
pnpm --filter @cove/shared --filter @cove/i18n --filter @cove/grading-runtime build
pnpm --filter @cove/api db:generate
pnpm --filter @cove/api db:migrate:deploy
pnpm --filter @cove/api exec vitest run src/explanations src/content/navigation-performance.integration.spec.ts src/learn/curriculum-read.integration.spec.ts src/learn/learn.service.spec.ts src/learn/learn-class.service.spec.ts src/learn/student-overview.service.spec.ts src/teach/teacher-progress --maxWorkers=1 --testTimeout=30000
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=0x1b64da:s=640x360:r=24 -vf "drawbox=x=60:y=70:w=520:h=220:color=white:t=fill,drawbox=x=90:y=110:w=300:h=30:color=0xfc5004:t=fill" -t 10 -c:v libx264 -pix_fmt yuv420p -movflags +faststart -y "$web_media/video.mp4"
ffmpeg -hide_banner -loglevel error -i "$web_media/video.mp4" -c copy -hls_time 2 -hls_list_size 0 -hls_segment_filename "$web_media/segment-%03d.ts" -y "$web_media/master.m3u8"
ffmpeg -hide_banner -loglevel error -i "$web_media/video.mp4" -frames:v 1 -y "$web_media/poster.jpg"
pnpm --filter @cove/api exec tsc -p tsconfig.build.json --outDir "$web_build" --incremental false --declaration false --sourceMap false
if [[ "${COVE_WEB_COURSES_PRODUCTION:-0}" == "1" ]]; then
  export COVE_DLAB_E2E=1 DLAB_SSO_ENABLED=true BFF_SHARED_SECRET=local-e2e-bff-secret-only-never-production
  export NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3309 NEXT_PUBLIC_API_URL=http://127.0.0.1:4319/api/rpc
  export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4320 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-e2e-publishable-key NEXT_PUBLIC_TURNSTILE_SITE_KEY=''
  export NEXT_PUBLIC_MULTIPLE_CHOICE_ENABLED=true NEXT_PUBLIC_VIDEO_LESSONS_ENABLED=true
  pnpm --filter @cove/web build
fi
pnpm exec playwright test --config e2e/web-courses.playwright.config.ts "$@"
