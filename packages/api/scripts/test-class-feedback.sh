#!/usr/bin/env bash
set -euo pipefail
feedback_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$feedback_root"
for feedback_port in 3309 4319 4320; do
  if lsof -nP -iTCP:"$feedback_port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Class feedback test port $feedback_port is already in use." >&2
    exit 1
  fi
done
feedback_run="$(date +%s)-$$"
feedback_pg="cove-class-feedback-pg-$feedback_run"
feedback_redis="cove-class-feedback-redis-$feedback_run"
cleanup() { docker rm -f "$feedback_pg" "$feedback_redis" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$feedback_pg" -e POSTGRES_PASSWORD=cove-feedback-local -e POSTGRES_DB=cove_dlab_test -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
docker run -d --name "$feedback_redis" -p 127.0.0.1::6379 redis:7-alpine >/dev/null
for feedback_attempt in {1..120}; do
  if docker exec "$feedback_pg" pg_isready -h 127.0.0.1 -U postgres -d cove_dlab_test >/dev/null 2>&1; then break; fi
  sleep 0.5
done
feedback_pg_port="$(docker port "$feedback_pg" 5432/tcp | sed 's/.*://')"
feedback_redis_port="$(docker port "$feedback_redis" 6379/tcp | sed 's/.*://')"
export COVE_DLAB_TEST_DATABASE_URL="postgresql://postgres:cove-feedback-local@127.0.0.1:$feedback_pg_port/cove_dlab_test"
export COVE_INTEGRATION_DATABASE_URL="$COVE_DLAB_TEST_DATABASE_URL"
export COVE_DLAB_TEST_REDIS_URL="redis://127.0.0.1:$feedback_redis_port/0"
docker exec -i "$feedback_pg" psql -U postgres -d cove_dlab_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS 'SELECT NULL::uuid';
CREATE SCHEMA storage;
CREATE TABLE storage.objects (id UUID, bucket_id TEXT, name TEXT);
SQL
DATABASE_URL="$COVE_DLAB_TEST_DATABASE_URL" DIRECT_URL="$COVE_DLAB_TEST_DATABASE_URL" pnpm --filter @cove/api db:migrate:deploy
pnpm --filter @cove/shared build
pnpm --filter @cove/i18n build
pnpm --filter @cove/api build
pnpm --filter @cove/api exec vitest run src/classes/class-feedback.integration.spec.ts
pnpm exec playwright test --config e2e/class-feedback.playwright.config.ts "$@"
