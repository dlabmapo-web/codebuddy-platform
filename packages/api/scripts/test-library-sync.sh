#!/usr/bin/env bash
# Library course sync integration specs against a disposable PostgreSQL.
#
# Never the shared Supabase databases: DATABASE_URL, DIRECT_URL and
# COVE_INTEGRATION_DATABASE_URL all point at a labelled throwaway container
# that is removed on exit. Pass spec paths to run a subset; with none, every
# `src/library-sync/**/*.integration.spec.ts` runs.
#
# KEEP_DB=1 leaves the container running and prints its URL, for iterating.
set -euo pipefail
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$repo_root"

run_id="$(date +%s)-$$"
pg_name="cove-library-sync-pg-$run_id"
redis_name="cove-library-sync-redis-$run_id"
sync_build=""
if [[ "${COVE_LIBRARY_SYNC_BROWSER:-0}" == "1" ]]; then
  for sync_port in 3342 4342 4343; do
    if lsof -nP -iTCP:"$sync_port" -sTCP:LISTEN >/dev/null 2>&1; then echo "Sync browser port $sync_port is already occupied" >&2; exit 1; fi
  done
fi
cleanup() {
  docker rm -f "$redis_name" >/dev/null 2>&1 || true
  if [[ -n "$sync_build" ]]; then rm -rf -- "$sync_build"; fi
  if [[ "${KEEP_DB:-0}" != "1" ]]; then
    docker rm -f "$pg_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

docker run -d --name "$pg_name" --label cove.purpose=library-sync-test \
  -e POSTGRES_PASSWORD=library-sync-local-only -e POSTGRES_DB=cove_library_sync \
  -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
for _ in {1..120}; do
  if docker exec "$pg_name" pg_isready -h 127.0.0.1 -U postgres -d cove_library_sync >/dev/null 2>&1; then break; fi
  sleep 0.5
done
pg_port="$(docker port "$pg_name" 5432/tcp | sed 's/.*://')"
url="postgresql://postgres:library-sync-local-only@127.0.0.1:$pg_port/cove_library_sync"

# The migrations assume Supabase's roles and schemas exist.
docker exec -i "$pg_name" psql -q -U postgres -d cove_library_sync -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS 'SELECT NULL::uuid';
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN);
CREATE TABLE storage.objects (id UUID, bucket_id TEXT, name TEXT);
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
SQL

# DIRECT_URL is what prisma.config.ts reads; setting only DATABASE_URL would
# migrate the shared database from .env instead.
export DATABASE_URL="$url" DIRECT_URL="$url" COVE_INTEGRATION_DATABASE_URL="$url"
pnpm --filter @cove/shared --filter @cove/i18n --filter @cove/grading-runtime build >/dev/null
pnpm --filter @cove/api db:generate >/dev/null
pnpm --filter @cove/api db:migrate:deploy

if [[ "${KEEP_DB:-0}" == "1" ]]; then
  echo "KEEP_DB=1: container $pg_name left running"
  echo "COVE_INTEGRATION_DATABASE_URL=$url"
fi

if [[ $# -gt 0 ]]; then
  specs=("$@")
else
  mapfile_specs() { find packages/api/src/library-sync -name '*.integration.spec.ts' | sed 's#^packages/api/##' | sort; }
  specs=()
  while IFS= read -r spec; do specs+=("$spec"); done < <(mapfile_specs)
fi
if [[ ${#specs[@]} -gt 0 ]]; then
  pnpm --filter @cove/api exec vitest run "${specs[@]}" --maxWorkers=1 --testTimeout=60000
fi

if [[ "${COVE_LIBRARY_SYNC_BROWSER:-0}" == "1" ]]; then
  docker run -d --name "$redis_name" -p 127.0.0.1::6379 redis:7-alpine >/dev/null
  redis_port="$(docker port "$redis_name" 6379/tcp | sed 's/.*://')"
  export REDIS_URL="redis://127.0.0.1:$redis_port/0" DOTENV_CONFIG_PATH=/dev/null
  sync_build="$(mktemp -d "$repo_root/packages/api/.library-sync-e2e-XXXXXX")"
  export COVE_LIBRARY_SYNC_BUILD_DIR="$sync_build"
  pnpm --filter @cove/api exec tsc -p tsconfig.build.json --outDir "$sync_build" --incremental false --declaration false --sourceMap false
  pnpm exec playwright test --config e2e/library-sync.playwright.config.ts
fi
