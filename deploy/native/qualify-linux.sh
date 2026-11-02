#!/usr/bin/env bash
# Operates only on a disposable, explicitly approved supported Linux CI host.
set -euo pipefail
if [ "${1:-}" != --isolated-host ] || [ "${2:-}" = '' ] || [ "${3:-}" = '' ]; then echo 'Usage: qualify-linux.sh --isolated-host IMMUTABLE_LOCAL_IMAGE_ID NEW_EVIDENCE_DIR' >&2; exit 2; fi
if [ "$(uname -s)" != Linux ] || [ "$(id -u)" != 0 ] || ! command -v systemd-run >/dev/null; then echo 'UNSUPPORTED: Linux root with disposable systemd delegation required' >&2; exit 78; fi
case "$2" in sha256:????????????????????????????????????????????????????????????????) ;; *) echo 'Immutable local image ID required' >&2; exit 2;; esac
native_image="$2"; native_evidence="$(realpath -m "$3")"
mkdir -m 700 "$native_evidence"
native_repo="$(cd "$(dirname "$0")/../.." && pwd)"
native_service_uid="$(stat -c '%u' "$native_repo")"
native_service_gid="$(stat -c '%g' "$native_repo")"
native_endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
case "$native_endpoint" in unix:///*) ;; *) echo 'Local Docker only' >&2; exit 2;; esac
docker() { command docker --host "$native_endpoint" "$@"; }
export COVE_NATIVE_FIXTURE_ID="native-$(date +%s)-$$-$(openssl rand -hex 4)"
native_project="$COVE_NATIVE_FIXTURE_ID"
native_unit="cove-$native_project"
native_work="$(mktemp -d /run/cove-native-qualification-XXXXXXXX)"
# Static credential-free assets must be traversable by the mapped host UID while
# NsJail builds mounts. Secret configuration/socket/case work stays under0700.
native_assets="$(mktemp -d /run/cove-native-assets-XXXXXXXX)"
chmod 0711 "$native_assets"
native_artifact="$native_assets/artifact"
native_container=''
compose() { docker compose -p "$native_project" -f "$native_repo/deploy/native/fixture.compose.yml" "$@"; }
cleanup() {
 systemctl stop "$native_unit.service" >/dev/null 2>&1 || true
 journalctl -u "$native_unit.service" --no-pager > "$native_evidence/journal.log" || true
 # Compose ownership and unique project label are both required before deleting fixture resources.
 for native_c in $(compose ps -aq); do
  if [ "$(docker inspect -f '{{index .Config.Labels "cove.native.qualification"}}' "$native_c")" != "$COVE_NATIVE_FIXTURE_ID" ]; then echo 'Refusing foreign fixture cleanup' >&2; return; fi
 done
 compose down --volumes --remove-orphans > "$native_evidence/cleanup.log" 2>&1 || true
 if [ -n "$native_container" ] && [ "$(docker inspect -f '{{index .Config.Labels "cove.native.qualification"}}' "$native_container" 2>/dev/null || true)" = "$COVE_NATIVE_FIXTURE_ID" ]; then docker rm "$native_container" >/dev/null; fi
 cp -a "$native_work/evidence/." "$native_evidence/" 2>/dev/null || true
 rm -rf -- "$native_work"
 rm -rf -- "$native_assets"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker image inspect "$native_image" > "$native_evidence/image.json"
native_container="$(docker create --label "cove.native.qualification=$COVE_NATIVE_FIXTURE_ID" "$native_image")"
docker cp "$native_container:/opt/cove" "$native_artifact"
setpriv --reuid=65534 --regid=65534 --clear-groups --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs \
 /usr/bin/test -r "$native_artifact/rootfs/opt/cove/bootstrap.py"
mkdir -m 700 "$native_work/evidence"
# Prove the real kernel boundary before preparing DB/browser resources. Both
# phases use this same protected unit configuration and resource envelope.
run_native_unit() {
# Keep all trusted socket clients on the same UID, with read access to their own
# checkout/dependency/browser paths. Never relax a host home directory's mode.
chown -R --no-dereference -- "$native_service_uid:$native_service_gid" "$native_work"
systemd-run --unit="$native_unit" --wait --pipe --collect \
 --property="User=$native_service_uid" --property="Group=$native_service_gid" \
 --property='Delegate=cpu memory pids' --property=MemoryMax=2560M --property=MemorySwapMax=0 \
 --property=CPUQuota=200% --property=TasksMax=256 --property=RuntimeMaxSec=900 \
 --property=KillMode=control-group --property=TimeoutStopSec=25 \
 --property=CapabilityBoundingSet='CAP_SYS_ADMIN CAP_SYS_PTRACE CAP_SETUID CAP_SETGID CAP_SYS_RESOURCE CAP_DAC_OVERRIDE CAP_CHOWN CAP_SETPCAP' \
 --property=AmbientCapabilities='CAP_SYS_ADMIN CAP_SYS_PTRACE CAP_SETUID CAP_SETGID CAP_SYS_RESOURCE CAP_DAC_OVERRIDE CAP_CHOWN CAP_SETPCAP' \
 --property=ProtectSystem=strict --property="ReadOnlyPaths=$native_artifact $native_repo" \
 --property="ReadWritePaths=$native_work /sys/fs/cgroup/system.slice/$native_unit.service" \
 --property=NoNewPrivileges=yes --property=PrivateTmp=yes \
 /usr/bin/env -i PATH="$PATH" HOME=/nonexistent DOTENV_CONFIG_PATH=/dev/null \
 "PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:?Explicit fixture browser installation path required}" "COVE_NATIVE_AUTH_PORT=${native_auth_port:-}" "COVE_NATIVE_API_PORT=${native_api_port:-}" "COVE_NATIVE_NEXT_ORIGIN=${native_web_origin:-}" "COVE_NATIVE_NEXT_BUILD_ID=${native_next_id:-}" "COVE_NATIVE_FIXTURE_ID=$COVE_NATIVE_FIXTURE_ID" "DATABASE_URL=${native_db:-}" "REDIS_URL=${native_redis_url:-}" \
 /bin/bash "$native_repo/deploy/native/qualify-unit.sh" "$native_work" "$native_repo" "$native_artifact" "$1" \
 2>&1 | tee "$native_evidence/unit-$1.log"
}
native_unit="cove-$native_project-kernel"
native_kernel_started="$(date --iso-8601=seconds)"
if ! run_native_unit kernel-only; then
 # Private denial metadata plus a fixed trusted interpreter startup trace. This
 # never executes learner source and cannot certify containment/performance.
 journalctl -k --since "$native_kernel_started" --no-pager | grep -E 'SECCOMP|seccomp|type=1326' | tail -30 > "$native_evidence/kernel-denials.log" || true
 if command -v strace >/dev/null; then
  timeout 5s env -i PATH="$PATH" HOME=/nonexistent \
   strace -f -qq -s 80 -o "$native_evidence/trusted-startup.strace" \
   chroot --userspec=65534:65534 "$native_artifact/rootfs" \
   /usr/local/bin/python3.12 -I -B -c 'import json, sys; print(sys.version.split()[0])' \
   > "$native_evidence/trusted-startup.log" 2>&1 || true
 fi
 exit 78
fi
native_unit="cove-$native_project"
compose up -d --wait --wait-timeout 60
native_pg="$(compose ps -q postgres)"; native_redis="$(compose ps -q redis)"
for native_try in {1..60}; do if docker exec "$native_pg" pg_isready -U postgres >/dev/null 2>&1; then break; fi; sleep .5; done
native_pg_port="$(docker port "$native_pg" 5432/tcp | sed 's/.*://')"; native_redis_port="$(docker port "$native_redis" 6379/tcp | sed 's/.*://')"
native_db="postgresql://postgres:native-fixture@127.0.0.1:$native_pg_port/cove_native_test"
native_redis_url="redis://127.0.0.1:$native_redis_port/0"
docker exec "$native_redis" redis-cli SET cove-native-qualification-owner "$COVE_NATIVE_FIXTURE_ID" >/dev/null
# Migration runs on the controller with only this owned synthetic URL.
bash "$native_repo/deploy/native/prepare-fixture-db.sh" "$native_pg" "$COVE_NATIVE_FIXTURE_ID" > "$native_evidence/migrations.log" 2>&1
# Allocate loopback fixture ports without touching any existing listener.
read -r native_auth_port native_api_port native_web_port < <(python3 - <<'PYPORT'
import socket
sockets=[socket.socket() for _ in range(3)]
for sock in sockets:sock.bind(('127.0.0.1',0))
print(' '.join(str(sock.getsockname()[1]) for sock in sockets))
PYPORT
)
native_auth_origin="http://127.0.0.1:$native_auth_port";native_api_origin="http://127.0.0.1:$native_api_port";native_web_origin="http://127.0.0.1:$native_web_port"
env -i PATH="$PATH" HOME="$HOME" DOTENV_CONFIG_PATH=/dev/null pnpm --dir "$native_repo" --filter @cove/shared --filter @cove/i18n build > "$native_evidence/i18n-build.log" 2>&1
bash "$native_repo/deploy/native/build-next-fixture.sh" "$native_work/next-source" "$native_auth_origin" "$native_api_origin" "$native_web_origin" > "$native_evidence/next-build.log" 2>&1
native_next_id="sha256:$(sha256sum "$native_work/next-source/packages/web/.next/BUILD_ID" | cut -d' ' -f1)"
# Unit source/learner artifacts are immutable. Only this owned cgroup subtree and work dir are writable.
run_native_unit full
