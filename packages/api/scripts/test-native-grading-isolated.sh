#!/usr/bin/env bash
set -euo pipefail
native_repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$native_repo"
native_id="$(date +%s)-$$"
native_pg="cove-native-test-pg-$native_id"
native_redis="cove-native-test-redis-$native_id"
cleanup() {
  for native_container in "$native_pg" "$native_redis"; do
    if [ "$(docker inspect -f '{{index .Config.Labels "cove.native.task3"}}' "$native_container" 2>/dev/null || true)" = "$native_id" ]; then docker rm -f "$native_container" >/dev/null; fi
  done
}
trap cleanup EXIT
export DOTENV_CONFIG_PATH=/dev/null
docker run -d --name "$native_pg" --label "cove.native.task3=$native_id" --memory=384m --cpus=.5 --pids-limit=128 -e POSTGRES_PASSWORD=native-fixture -e POSTGRES_DB=cove_native_test -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
docker run -d --name "$native_redis" --label "cove.native.task3=$native_id" --memory=128m --cpus=.25 --pids-limit=64 -p 127.0.0.1::6379 redis:7-alpine >/dev/null
for native_try in {1..40}; do
  if docker exec "$native_pg" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep .5
done
native_pg_port="$(docker port "$native_pg" 5432/tcp | sed 's/.*://')"
native_redis_port="$(docker port "$native_redis" 6379/tcp | sed 's/.*://')"
export COVE_NATIVE_TEST_DATABASE_URL="postgresql://postgres:native-fixture@127.0.0.1:$native_pg_port/cove_native_test"
export COVE_NATIVE_TEST_REDIS_URL="redis://127.0.0.1:$native_redis_port/0"
export DATABASE_URL="$COVE_NATIVE_TEST_DATABASE_URL" DIRECT_URL="$COVE_NATIVE_TEST_DATABASE_URL"
docker exec -i "$native_pg" psql -U postgres -d cove_native_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS 'SELECT NULL::uuid';
CREATE SCHEMA storage;
CREATE TABLE storage.objects (id UUID, bucket_id TEXT, name TEXT);
SQL
pnpm --filter @cove/api exec prisma migrate deploy
pnpm --filter @cove/api exec vitest run src/judge/native-grading.integration.spec.ts
COVE_INTEGRATION_REDIS_URL="$COVE_NATIVE_TEST_REDIS_URL" pnpm --filter @cove/api exec vitest run src/judge/sample-check.store.spec.ts
