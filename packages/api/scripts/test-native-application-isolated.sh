#!/usr/bin/env bash
set -euo pipefail
if [ "${COVE_NATIVE_SANITIZED:-}" != 1 ]; then
  exec env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" COVE_NATIVE_SANITIZED=1 bash "$0" "$@"
fi
native_repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$native_repo"
native_docker_endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
case "$native_docker_endpoint" in unix:///*) ;; *) echo "Refusing non-local Docker fixture endpoint" >&2; exit 1;; esac
docker() { command docker --host "$native_docker_endpoint" "$@"; }
native_id="$(date +%s)-$$-$(openssl rand -hex 4)"
export COVE_NATIVE_FIXTURE_ID="$native_id"
native_pg="cove-native-app-pg-$native_id"
native_redis="cove-native-app-redis-$native_id"
cleanup() {
  for native_container in "$native_pg" "$native_redis"; do
    if [ "$(docker inspect -f '{{index .Config.Labels "cove.native.task2"}}' "$native_container" 2>/dev/null || true)" = "$native_id" ]; then docker rm -fv "$native_container" >/dev/null; fi
  done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
export DOTENV_CONFIG_PATH=/dev/null
docker run -d --name "$native_pg" --label "cove.native.task2=$native_id" --memory=384m --cpus=.5 --pids-limit=128 --tmpfs /var/lib/postgresql/data:rw,nosuid,nodev,size=256m -e POSTGRES_PASSWORD=native-fixture -e POSTGRES_DB=cove_native_test -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
docker run -d --name "$native_redis" --label "cove.native.task2=$native_id" --memory=128m --cpus=.25 --pids-limit=64 --tmpfs /data:rw,nosuid,nodev,size=64m -p 127.0.0.1::6379 redis:7-alpine redis-server --save "" --appendonly no --maxmemory 64mb --maxmemory-policy noeviction >/dev/null
for native_try in {1..40}; do
  if docker exec "$native_pg" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep .5
done
native_pg_port="$(docker port "$native_pg" 5432/tcp | sed 's/.*://')"
native_redis_port="$(docker port "$native_redis" 6379/tcp | sed 's/.*://')"
export COVE_INTEGRATION_DATABASE_URL="postgresql://postgres:native-fixture@127.0.0.1:$native_pg_port/cove_native_test"
export COVE_INTEGRATION_REDIS_URL="redis://127.0.0.1:$native_redis_port/0"
export DATABASE_URL="$COVE_INTEGRATION_DATABASE_URL" DIRECT_URL="$COVE_INTEGRATION_DATABASE_URL"
docker exec -i "$native_pg" psql -U postgres -d cove_native_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS 'SELECT NULL::uuid';
CREATE SCHEMA storage;
CREATE TABLE storage.objects (id UUID, bucket_id TEXT, name TEXT);
SQL
pnpm --filter @cove/shared build
pnpm --filter @cove/grading-runtime build
pnpm --filter @cove/api db:generate
pnpm --filter @cove/api exec prisma migrate deploy
# Real DB/Redis/Unix transport, deterministic launcher backend: no containment/performance claim.
pnpm --filter @cove/api exec vitest run --maxWorkers=1 src/judge/native-application.integration.spec.ts "$@"
