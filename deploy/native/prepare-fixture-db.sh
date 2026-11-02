#!/usr/bin/env bash
# Prepare only a uniquely labelled local disposable PostgreSQL container.
set -euo pipefail
native_pg="${1:?Owned PostgreSQL container ID required}"
native_fixture="${2:?Fixture owner required}"
native_repo="$(cd "$(dirname "$0")/../.." && pwd)"
native_endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
case "$native_endpoint" in unix:///*) ;; *) echo 'Local Docker required' >&2; exit 2;; esac
docker() { command docker --host "$native_endpoint" "$@"; }
[[ "$native_pg" =~ ^[a-f0-9]{64}$ && "$native_fixture" =~ ^native-[a-zA-Z0-9-]+$ ]] || exit 2
[ "$(docker inspect -f '{{index .Config.Labels "cove.native.qualification"}}' "$native_pg")" = "$native_fixture" ] || exit 2
native_mapping="$(docker port "$native_pg" 5432/tcp)"
[[ "$native_mapping" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || exit 2
native_port="${BASH_REMATCH[1]}"
native_db="postgresql://postgres:native-fixture@127.0.0.1:$native_port/cove_native_test"
native_ready=''
for native_try in {1..60}; do
 if docker exec "$native_pg" pg_isready -h 127.0.0.1 -U postgres -d cove_native_test >/dev/null 2>&1; then native_ready=1; break; fi
 sleep .5
done
[ "$native_ready" = 1 ] || { echo 'Fixture PostgreSQL TCP readiness timed out' >&2; exit 1; }
docker exec -i "$native_pg" psql -U postgres -d cove_native_test -v ON_ERROR_STOP=1 -v fixture_id="$native_fixture" <<'SQL'
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS 'SELECT NULL::uuid';
CREATE SCHEMA storage; CREATE TABLE storage.objects (id UUID, bucket_id TEXT, name TEXT);
SQL
# Prisma must see an empty public schema; the auth/storage compatibility schemas
# are separate. Create the ownership sentinel only after migration succeeds.
env -i PATH="$PATH" HOME="$HOME" DOTENV_CONFIG_PATH=/dev/null DATABASE_URL="$native_db" DIRECT_URL="$native_db" \
 pnpm --dir "$native_repo/packages/api" exec prisma migrate deploy
docker exec -i "$native_pg" psql -U postgres -d cove_native_test -v ON_ERROR_STOP=1 -v fixture_id="$native_fixture" <<'SQL'
CREATE TABLE native_qualification_fixture (fixture_id TEXT PRIMARY KEY);
INSERT INTO native_qualification_fixture VALUES (:'fixture_id');
SQL
echo 'Owned fixture schema migrations and ownership sentinel PASS'
