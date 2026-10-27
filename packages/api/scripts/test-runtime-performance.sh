#!/usr/bin/env bash
set -Eeuo pipefail
runtime_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$runtime_root"
runtime_pg_id="$(docker run -d --label cove.performance-fixture=true --memory 384m --cpus 1 --pids-limit 128 \
  -p 127.0.0.1::5432 -e POSTGRES_USER=cove_perf -e POSTGRES_PASSWORD=fixture-only-password \
  -e POSTGRES_DB=cove_performance --tmpfs /var/lib/postgresql/data:rw,nosuid,size=256m postgres:17-alpine)"
cleanup_runtime() { docker rm -f "$runtime_pg_id" >/dev/null 2>&1 || true; }
trap cleanup_runtime EXIT
for runtime_attempt in {1..40}; do
  if docker exec "$runtime_pg_id" pg_isready -U cove_perf >/dev/null 2>&1; then break; fi
  sleep 0.5
done
runtime_pg_port="$(docker port "$runtime_pg_id" 5432/tcp | sed 's/.*://')"
runtime_database_url="postgresql://cove_perf:fixture-only-password@127.0.0.1:$runtime_pg_port/cove_performance"
docker exec -i "$runtime_pg_id" psql -U cove_perf -d cove_performance -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS 'SELECT NULL::uuid';
CREATE SCHEMA storage;
CREATE TABLE storage.objects (id UUID, bucket_id TEXT, name TEXT);
SQL
DATABASE_URL="$runtime_database_url" DIRECT_URL="$runtime_database_url" pnpm --filter @cove/api db:migrate:deploy
pnpm --filter @cove/shared build
pnpm --filter @cove/api db:generate
COVE_INTEGRATION_DATABASE_URL= COVE_INTEGRATION_REDIS_URL= pnpm --filter @cove/api exec vitest run src/judge src/manual --exclude '**/*.integration.spec.ts' --maxWorkers=1
COVE_INTEGRATION_DATABASE_URL="$runtime_database_url" pnpm --filter @cove/api exec vitest run src/judge/weighted-grading.integration.spec.ts --maxWorkers=1
