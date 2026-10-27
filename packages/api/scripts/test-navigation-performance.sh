#!/usr/bin/env bash
set -Eeuo pipefail
navigation_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$navigation_root"
# Disposable local fixture only: never reads the deployment's DATABASE_URL.
navigation_pg_id="$(docker run -d --label cove.navigation-fixture=true --memory 512m --cpus 2 --pids-limit 128 \
  -p 127.0.0.1::5432 -e POSTGRES_USER=cove_nav -e POSTGRES_PASSWORD=fixture-only-password \
  -e POSTGRES_DB=cove_navigation --tmpfs /var/lib/postgresql/data:rw,nosuid,size=384m postgres:17-alpine)"
cleanup_navigation() { docker rm -f "$navigation_pg_id" >/dev/null 2>&1 || true; }
trap cleanup_navigation EXIT
for navigation_attempt in {1..40}; do
  if docker exec "$navigation_pg_id" pg_isready -U cove_nav >/dev/null 2>&1; then break; fi
  sleep 0.5
done
navigation_pg_port="$(docker port "$navigation_pg_id" 5432/tcp | sed 's/.*://')"
navigation_database_url="postgresql://cove_nav:fixture-only-password@127.0.0.1:$navigation_pg_port/cove_navigation"
docker exec -i "$navigation_pg_id" psql -U cove_nav -d cove_navigation -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS 'SELECT NULL::uuid';
CREATE SCHEMA storage;
CREATE TABLE storage.objects (id UUID, bucket_id TEXT, name TEXT);
SQL
DATABASE_URL="$navigation_database_url" DIRECT_URL="$navigation_database_url" pnpm --filter @cove/api db:migrate:deploy
pnpm --filter @cove/shared build
pnpm --filter @cove/api db:generate
COVE_INTEGRATION_DATABASE_URL="$navigation_database_url" pnpm --filter @cove/api exec vitest run \
  src/content/navigation-performance.integration.spec.ts src/content/course-move.integration.spec.ts \
  src/classes/manager-academy-access.integration.spec.ts --maxWorkers=1
