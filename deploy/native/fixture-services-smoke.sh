#!/usr/bin/env bash
# Real host-to-fixture connectivity, using only disposable labelled services.
set -euo pipefail
cd "$(dirname "$0")/../.."
native_endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
case "$native_endpoint" in unix:///*) ;; *) echo 'Local Docker required' >&2; exit 2;; esac
docker() { command docker --host "$native_endpoint" "$@"; }
export COVE_NATIVE_FIXTURE_ID="native-network-$(date +%s)-$$-$(openssl rand -hex 4)"
native_project="$COVE_NATIVE_FIXTURE_ID"
compose() { docker compose -p "$native_project" -f deploy/native/fixture.compose.yml "$@"; }
cleanup() {
  for native_c in $(compose ps -aq); do
    if [ "$(docker inspect -f '{{index .Config.Labels "cove.native.qualification"}}' "$native_c")" != "$COVE_NATIVE_FIXTURE_ID" ]; then
      echo 'Refusing foreign fixture cleanup' >&2; return 1
    fi
  done
  compose down --volumes --remove-orphans
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
compose up -d --wait --wait-timeout 60
native_pg="$(compose ps -q postgres)"; native_redis="$(compose ps -q redis)"
native_pg_mapping="$(docker port "$native_pg" 5432/tcp)"
native_redis_mapping="$(docker port "$native_redis" 6379/tcp)"
python3 - "$native_pg_mapping" "$native_redis_mapping" <<'PY'
import re, socket, struct, sys, time
ports=[]
for mapping in sys.argv[1:]:
    match=re.fullmatch(r'127\.0\.0\.1:([0-9]+)', mapping)
    if not match or not 1 <= int(match[1]) <= 65535:
        raise RuntimeError(f'Expected exactly one loopback mapping, got {mapping!r}')
    ports.append(int(match[1]))
for port, request, replies in [(ports[0], struct.pack('!II',8,80877103), (b'N',b'S')),
                              (ports[1], b'*1\r\n$4\r\nPING\r\n', (b'+PONG\r\n',))]:
    deadline=time.monotonic()+20
    while True:
        try:
            with socket.create_connection(('127.0.0.1',port), timeout=1) as connection:
                connection.sendall(request)
                reply=connection.recv(64)
                if reply not in replies: raise RuntimeError(f'Unexpected service response: {reply!r}')
            break
        except (OSError, RuntimeError):
            if time.monotonic() >= deadline: raise
            time.sleep(.2)
print('PostgreSQL/Redis real host loopback connectivity PASS')
PY
bash deploy/native/prepare-fixture-db.sh "$native_pg" "$COVE_NATIVE_FIXTURE_ID"
