#!/usr/bin/env bash
set -euo pipefail
explanation_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$explanation_root"
for explanation_port in 3309 4319 4320; do
  if lsof -nP -iTCP:"$explanation_port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Explanation test port $explanation_port is already in use." >&2
    exit 1
  fi
done
explanation_run="$(date +%s)-$$"
explanation_pg="cove-explanation-pg-$explanation_run"
explanation_redis="cove-explanation-redis-$explanation_run"
explanation_build="$(mktemp -d "$explanation_root/packages/api/.explanation-e2e-XXXXXX")"
cleanup() {
  docker rm -f "$explanation_pg" "$explanation_redis" >/dev/null 2>&1 || true
  rm -rf -- "$explanation_build"
}
trap cleanup EXIT
docker run -d --name "$explanation_pg" -e POSTGRES_PASSWORD=explanation-local-only -e POSTGRES_DB=cove_dlab_test -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
docker run -d --name "$explanation_redis" -p 127.0.0.1::6379 redis:7-alpine >/dev/null
for explanation_attempt in {1..120}; do
  if docker exec "$explanation_pg" pg_isready -h 127.0.0.1 -U postgres -d cove_dlab_test >/dev/null 2>&1; then break; fi
  sleep 0.5
done
explanation_pg_port="$(docker port "$explanation_pg" 5432/tcp | sed 's/.*://')"
explanation_redis_port="$(docker port "$explanation_redis" 6379/tcp | sed 's/.*://')"
export COVE_DLAB_TEST_DATABASE_URL="postgresql://postgres:explanation-local-only@127.0.0.1:$explanation_pg_port/cove_dlab_test"
export COVE_DLAB_TEST_REDIS_URL="redis://127.0.0.1:$explanation_redis_port/0"
export COVE_INTEGRATION_DATABASE_URL="$COVE_DLAB_TEST_DATABASE_URL"
export DIRECT_URL="$COVE_DLAB_TEST_DATABASE_URL"
export DATABASE_URL="$COVE_DLAB_TEST_DATABASE_URL"
export COVE_DLAB_API_BUILD_DIR="file://$explanation_build"
docker exec -i "$explanation_pg" psql -U postgres -d cove_dlab_test -v ON_ERROR_STOP=1 <<'SQL'
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
pnpm --filter @cove/api exec vitest run src/explanations src/content/navigation-performance.integration.spec.ts src/content/course-move.integration.spec.ts src/learn/curriculum-read.integration.spec.ts --maxWorkers=1 --testTimeout=30000
pnpm --filter @cove/api exec tsc -p tsconfig.build.json --outDir "$explanation_build" --incremental false --declaration false --sourceMap false
pnpm exec playwright test --config e2e/explanation-materials.playwright.config.ts
