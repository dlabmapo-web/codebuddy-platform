#!/usr/bin/env bash
set -euo pipefail
if [ "${COVE_NATIVE_SANITIZED:-}" != 1 ]; then
  exec env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" COVE_NATIVE_SANITIZED=1 bash "$0" "$@"
fi
native_repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$native_repo"
# A loopback port on a remote Docker host is not a local fixture. Pin the
# verified Unix endpoint so a context change cannot redirect later cleanup/run.
native_docker_endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
case "$native_docker_endpoint" in unix:///*) ;; *) echo "Refusing non-local Docker fixture endpoint" >&2; exit 1;; esac
docker() { command docker --host "$native_docker_endpoint" "$@"; }
native_id="$(date +%s)-$$-$(openssl rand -hex 4)"
export COVE_NATIVE_FIXTURE_ID="$native_id"
native_pg="cove-native-test-pg-$native_id"
native_redis="cove-native-test-redis-$native_id"
cleanup() {
  for native_container in "$native_pg" "$native_redis"; do
    if [ "$(docker inspect -f '{{index .Config.Labels "cove.native.task3"}}' "$native_container" 2>/dev/null || true)" = "$native_id" ]; then docker rm -fv "$native_container" >/dev/null; fi
  done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
export DOTENV_CONFIG_PATH=/dev/null
pnpm prepare:grading
docker run -d --name "$native_pg" --label "cove.native.task3=$native_id" --memory=384m --cpus=.5 --pids-limit=128 --tmpfs /var/lib/postgresql/data:rw,nosuid,nodev,size=256m -e POSTGRES_PASSWORD=native-fixture -e POSTGRES_DB=cove_native_test -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
docker run -d --name "$native_redis" --label "cove.native.task3=$native_id" --memory=128m --cpus=.25 --pids-limit=64 --tmpfs /data:rw,nosuid,nodev,size=64m -p 127.0.0.1::6379 redis:7-alpine redis-server --save "" --appendonly no --maxmemory 64mb --maxmemory-policy noeviction >/dev/null
for native_try in {1..40}; do
  if docker exec "$native_pg" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep .5
done
native_pg_port="$(docker port "$native_pg" 5432/tcp | sed 's/.*://')"
native_redis_port="$(docker port "$native_redis" 6379/tcp | sed 's/.*://')"
export COVE_NATIVE_TEST_DATABASE_URL="postgresql://postgres:native-fixture@127.0.0.1:$native_pg_port/cove_native_test"
export COVE_NATIVE_TEST_REDIS_URL="redis://127.0.0.1:$native_redis_port/0"
export DATABASE_URL="$COVE_NATIVE_TEST_DATABASE_URL" DIRECT_URL="$COVE_NATIVE_TEST_DATABASE_URL"
if [ "${1:-}" = "--acceptance-contracts" ]; then
  native_ts_loader="$(node -p 'require.resolve("tsx", {paths: [process.cwd()+"/packages/api"]})')"
  COVE_NATIVE_BROKER_TEST_IMAGE="${2:-}" COVE_NATIVE_DOCKER_ENDPOINT="$native_docker_endpoint" node --import "$native_ts_loader" --test --test-concurrency=1 e2e/native-grading-acceptance-authority.test.mjs packages/api/scripts/native-grading-e2e-timings.test.mjs
  exit
fi
if [ "${1:-}" = "--timing-contracts" ]; then
  native_ts_loader="$(node -p 'require.resolve("tsx", {paths: [process.cwd()+"/packages/api"]})')"
  node --import "$native_ts_loader" --test packages/api/scripts/native-grading-e2e-timings.test.mjs
  exit
fi
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
if [ "${1:-}" = "--fixture-contracts" ]; then
  pnpm --filter @cove/api build
  node --test packages/api/scripts/native-grading-e2e-seed.test.mjs
  exit
fi
if [ "${1:-}" = "--browser" ] || [ "${1:-}" = "--production-browser" ]; then
  if [ "$1" = "--production-browser" ]; then export COVE_NATIVE_WEB_PRODUCTION=1; fi
  shift
  # Next loads dotenv itself: refuse to run in a checkout containing one.
  for native_dir in . packages/api packages/web; do
    for native_env in "$native_dir"/.env "$native_dir"/.env.local "$native_dir"/.env.test "$native_dir"/.env.test.local "$native_dir"/.env.development "$native_dir"/.env.development.local "$native_dir"/.env.production "$native_dir"/.env.production.local; do
      if [ -e "$native_env" ]; then echo "Refusing dotenv-bearing checkout: $native_env" >&2; exit 1; fi
    done
  done
  export COVE_NATIVE_EVIDENCE_DIR="$native_repo/test-results/native-$native_id"
  export COVE_NATIVE_TIMINGS_FILE="$COVE_NATIVE_EVIDENCE_DIR/commit-acks.jsonl"
  mkdir -p "$COVE_NATIVE_EVIDENCE_DIR"
  : > "$COVE_NATIVE_TIMINGS_FILE"
  pnpm --filter @cove/i18n build
  pnpm --filter @cove/api build
  if [ "${COVE_NATIVE_WEB_PRODUCTION:-}" = 1 ]; then
    node --input-type=module -e 'import {cp,access} from "node:fs/promises"; await access("packages/web/.next/standalone/packages/web/server.js"); await cp("packages/web/public","packages/web/.next/standalone/packages/web/public",{recursive:true}); await cp("packages/web/.next/static","packages/web/.next/standalone/packages/web/.next/static",{recursive:true});'
  fi
  pnpm exec playwright test --config e2e/native-grading.playwright.config.ts "$@"
  exit
fi
pnpm --filter @cove/api exec vitest run src/judge/native-grading.integration.spec.ts "$@"
COVE_INTEGRATION_REDIS_URL="$COVE_NATIVE_TEST_REDIS_URL" pnpm --filter @cove/api exec vitest run src/judge/sample-check.store.spec.ts
