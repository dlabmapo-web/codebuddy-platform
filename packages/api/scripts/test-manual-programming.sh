#!/usr/bin/env bash
set -Eeuo pipefail
manual_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$manual_root"
export COVE_DLAB_TEST_WEB_PORT=3312 COVE_DLAB_TEST_API_PORT=4329 COVE_DLAB_TEST_PROVIDER_PORT=4330
for manual_port in 3312 4329 4330; do
  if lsof -nP -iTCP:"$manual_port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Manual assessment test port $manual_port is already in use." >&2; exit 1
  fi
done
manual_run="$(date +%s)-$$"
manual_pg="cove-manual-pg-$manual_run"
manual_redis="cove-manual-redis-$manual_run"
manual_build="$(mktemp -d "$manual_root/packages/api/.manual-e2e-XXXXXX")"
cleanup_manual() {
  docker rm -f "$manual_pg" "$manual_redis" >/dev/null 2>&1 || true
  rm -rf -- "$manual_build"
}
trap cleanup_manual EXIT
docker run -d --name "$manual_pg" -e POSTGRES_PASSWORD=manual-local-only -e POSTGRES_DB=cove_dlab_test -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
docker run -d --name "$manual_redis" -p 127.0.0.1::6379 redis:7-alpine >/dev/null
for manual_attempt in {1..100}; do
  if docker exec "$manual_pg" pg_isready -h 127.0.0.1 -U postgres -d cove_dlab_test >/dev/null 2>&1; then break; fi
  sleep 0.5
done
manual_pg_port="$(docker port "$manual_pg" 5432/tcp | sed 's/.*://')"
manual_redis_port="$(docker port "$manual_redis" 6379/tcp | sed 's/.*://')"
export COVE_DLAB_TEST_DATABASE_URL="postgresql://postgres:manual-local-only@127.0.0.1:$manual_pg_port/cove_dlab_test"
export COVE_DLAB_TEST_REDIS_URL="redis://127.0.0.1:$manual_redis_port/0"
export COVE_INTEGRATION_DATABASE_URL="$COVE_DLAB_TEST_DATABASE_URL"
export DATABASE_URL="$COVE_DLAB_TEST_DATABASE_URL" DIRECT_URL="$COVE_DLAB_TEST_DATABASE_URL"
export COVE_DLAB_API_BUILD_DIR="file://$manual_build"
docker exec -i "$manual_pg" psql -U postgres -d cove_dlab_test -v ON_ERROR_STOP=1 <<'SQL'
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
pnpm --filter @cove/api exec vitest run src/learn/programming-review.integration.spec.ts src/content/navigation-performance.integration.spec.ts src/learn/curriculum-read.integration.spec.ts src/classes/manager-academy-access.integration.spec.ts --maxWorkers=1
pnpm --filter @cove/api exec tsc -p tsconfig.build.json --outDir "$manual_build" --incremental false --declaration false --sourceMap false
pnpm exec playwright test --config e2e/manual-programming.playwright.config.ts
