#!/usr/bin/env bash
set -euo pipefail
# Never select a database from the caller's dotenv files. Every run creates new
# disposable containers, migrates them, and tests against only their loopback ports.
dlab_repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$dlab_repo_root"
dlab_run_id="$(date +%s)-$$"
dlab_pg="cove-dlab-test-pg-$dlab_run_id"
dlab_redis="cove-dlab-test-redis-$dlab_run_id"
cleanup() {
  docker rm -f "$dlab_pg" "$dlab_redis" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker run -d --name "$dlab_pg" -e POSTGRES_PASSWORD=cove-dlab-local-test -e POSTGRES_DB=cove_dlab_test -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
docker run -d --name "$dlab_redis" -p 127.0.0.1::6379 redis:7-alpine >/dev/null
for dlab_attempt in {1..40}; do
  if docker exec "$dlab_pg" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 0.5
done
dlab_pg_port="$(docker port "$dlab_pg" 5432/tcp | sed 's/.*://')"
dlab_redis_port="$(docker port "$dlab_redis" 6379/tcp | sed 's/.*://')"
export COVE_DLAB_TEST_DATABASE_URL="postgresql://postgres:cove-dlab-local-test@127.0.0.1:$dlab_pg_port/cove_dlab_test"
export COVE_DLAB_TEST_REDIS_URL="redis://127.0.0.1:$dlab_redis_port/0"
# Minimal Supabase schema scaffolding needed by existing application migrations.
# These doubles do not validate Supabase provider-side credential guard behavior.
docker exec -i "$dlab_pg" psql -U postgres -d cove_dlab_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS 'SELECT NULL::uuid';
CREATE SCHEMA storage;
CREATE TABLE storage.objects (id UUID, bucket_id TEXT, name TEXT);
SQL
DATABASE_URL="$COVE_DLAB_TEST_DATABASE_URL" DIRECT_URL="$COVE_DLAB_TEST_DATABASE_URL" pnpm --filter @cove/api db:migrate:deploy
pnpm --filter @cove/api build
pnpm --filter @cove/api test src/integrations/dlab src/authorization src/auth src/academies/academy-membership.service.spec.ts
pnpm --filter @cove/shared test src/integrations/dlab src/memberships/people-bulk.spec.ts
pnpm --filter @cove/web test src/lib/dlab-sso.spec.ts
pnpm e2e:dlab "$@"
