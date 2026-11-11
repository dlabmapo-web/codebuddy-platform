#!/usr/bin/env bash
# Real local C/C++ browser acceptance. No shared DB, provider or Redis is used.
set -euo pipefail
cpp_repo="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$cpp_repo"
cpp_evidence="$cpp_repo/test-results/c-cpp-local"
cpp_pid_file="$cpp_evidence/playground.pid"
cpp_mode=test
if [[ "${1:-}" == --stop ]]; then
  [[ -f "$cpp_pid_file" ]] || { echo 'The local C/C++ playground is not running.'; exit 0; }
  cpp_pid="$(cat "$cpp_pid_file")"
  [[ "$cpp_pid" =~ ^[0-9]+$ ]] || { echo 'Invalid playground PID file' >&2; exit 2; }
  case "$(ps -p "$cpp_pid" -o command= 2>/dev/null || true)" in
    *test-c-cpp-local.sh*--playground*) kill -TERM "$cpp_pid"; echo 'Stopping the local C/C++ playground.';;
    *) echo 'The local C/C++ playground is not running.';;
  esac
  exit 0
fi
if [[ "${1:-}" == --playground ]]; then cpp_mode=playground; shift; fi
cpp_image="${COVE_CPP_NATIVE_IMAGE:-cove-native-node:cpp-local-verification}"
cpp_endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
case "$cpp_endpoint" in unix:///*) ;; *) echo 'Local Docker required' >&2; exit 2;; esac
docker() { command docker --host "$cpp_endpoint" "$@"; }
for cpp_port in 3317 4317 4327; do
  if lsof -nP -iTCP:"$cpp_port" -sTCP:LISTEN >/dev/null 2>&1; then echo "Test port $cpp_port is in use" >&2; exit 2; fi
done
cpp_owner="native-cpp-$(date +%s)-$$"
# A template, not BSD's `-t prefix`: GNU mktemp (Linux CI) needs the X's.
cpp_work="$(mktemp -d "${TMPDIR:-/tmp}/cove-cpp-browser.XXXXXXXX")"
cpp_pg="$cpp_owner-pg"; cpp_redis="$cpp_owner-redis"; cpp_native="$cpp_owner-grader"
cpp_playground_pid=''
mkdir -p "$cpp_evidence" "$cpp_work/shared"
chmod 700 "$cpp_work"
cleanup() {
  if [[ -n "$cpp_playground_pid" ]]; then
    kill -TERM "$cpp_playground_pid" 2>/dev/null || true
    wait "$cpp_playground_pid" 2>/dev/null || true
  fi
  [[ ! -f "$cpp_work/api.log" ]] || cp "$cpp_work/api.log" "$cpp_evidence/api.log"
  for cpp_container in "$cpp_native" "$cpp_pg" "$cpp_redis"; do
    if [[ "$(docker inspect -f '{{index .Config.Labels "cove.native.qualification"}}' "$cpp_container" 2>/dev/null || true)" == "$cpp_owner" ]]; then
      docker logs "$cpp_container" > "$cpp_evidence/$cpp_container.log" 2>&1 || true
      docker rm -f "$cpp_container" >/dev/null
    fi
  done
  docker network rm "$cpp_owner" >/dev/null 2>&1 || true
  rm -rf -- "$cpp_work"
  if [[ "$cpp_mode" == playground && -f "$cpp_pid_file" && "$(cat "$cpp_pid_file")" == "$$" ]]; then rm -f "$cpp_pid_file"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cpp_image="$(docker image inspect -f '{{.Id}}' "$cpp_image")"
docker image inspect "$cpp_image" > "$cpp_evidence/image.json"
pnpm --filter @cove/shared --filter @cove/i18n --filter @cove/grading-runtime build > "$cpp_evidence/packages-build.log" 2>&1
pnpm --filter @cove/api build > "$cpp_evidence/api-build.log" 2>&1
docker network create --label "cove.native.qualification=$cpp_owner" "$cpp_owner" >/dev/null
cpp_pg_id="$(docker run -d --name "$cpp_pg" --label "cove.native.qualification=$cpp_owner" --network "$cpp_owner" --memory 256m -e POSTGRES_PASSWORD=native-fixture -e POSTGRES_DB=cove_native_test -p 127.0.0.1::5432 postgres:16-alpine)"
docker run -d --name "$cpp_redis" --label "cove.native.qualification=$cpp_owner" --network "$cpp_owner" --memory 96m -p 127.0.0.1::6379 redis:8-alpine redis-server --save '' --appendonly no >/dev/null
bash deploy/native/prepare-fixture-db.sh "$cpp_pg_id" "$cpp_owner" > "$cpp_evidence/migrations.log" 2>&1
cpp_pg_port="$(docker port "$cpp_pg" 5432/tcp | sed 's/.*://')"
cpp_redis_port="$(docker port "$cpp_redis" 6379/tcp | sed 's/.*://')"
docker run -d --name "$cpp_native" --label "cove.native.qualification=$cpp_owner" --network "$cpp_owner" \
  --cgroupns=private --read-only --security-opt no-new-privileges:true --security-opt apparmor=unconfined --security-opt seccomp=unconfined \
  --cap-drop ALL --cap-add SYS_ADMIN --cap-add SYS_PTRACE --cap-add SETUID --cap-add SETGID --cap-add SYS_RESOURCE --cap-add DAC_OVERRIDE --cap-add CHOWN --cap-add SETPCAP \
  --cpus 2 --memory 2560m --memory-swap 2560m --pids-limit 256 \
  --tmpfs /run/cove-native:rw,nosuid,nodev,noexec,size=64m,mode=0700 --tmpfs /tmp:rw,nosuid,nodev,noexec,size=64m \
  --tmpfs /var/lib/cove-native/artifacts:rw,nosuid,nodev,exec,size=256m,mode=0700 \
  --tmpfs /var/lib/cove-native/staging:rw,nosuid,nodev,noexec,size=192m,mode=0700 \
  --mount "type=bind,src=$cpp_work/shared,dst=/run/cove-native-shared" \
  -e "DATABASE_URL=postgresql://postgres:native-fixture@$cpp_pg:5432/cove_native_test" -e "REDIS_URL=redis://$cpp_redis:6379/0" \
  -e 'NATIVE_ELIGIBILITY=[{"contexts":["live","preview"],"kinds":["official","staff-practice","sample","regrade","run"],"maxCaseTimeLimitMs":60000,"languages":["PYTHON","C","CPP"]}]' \
  --entrypoint /bin/sh "$cpp_image" /opt/cove/tools/container-node.sh serve >/dev/null
for cpp_try in {1..120}; do
  [[ "$(docker inspect -f '{{.State.Running}}' "$cpp_native")" == true ]] || { docker logs "$cpp_native"; exit 1; }
  # Do not exec a probe into the container while its root cgroup is being
  # emptied/delegated. A new probe process there can race controller setup.
  if [[ -s "$cpp_work/shared/manifest.json" ]] && docker exec "$cpp_native" /opt/cove/node -e "fetch('http://127.0.0.1:4102/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$cpp_native" /opt/cove/node -e "fetch('http://127.0.0.1:4102/ready').then(async r=>{console.log(await r.text());process.exit(r.ok?0:1)}).catch(()=>process.exit(1))" > "$cpp_evidence/native-ready.json"
export COVE_CPP_FIXTURE_DIR="$cpp_work" COVE_NATIVE_FIXTURE_ID="$cpp_owner" DOTENV_CONFIG_PATH=/dev/null
export DATABASE_URL="postgresql://postgres:native-fixture@127.0.0.1:$cpp_pg_port/cove_native_test"
export DIRECT_URL="$DATABASE_URL" REDIS_URL="redis://127.0.0.1:$cpp_redis_port/0"
if [[ "$cpp_mode" == playground ]]; then
  printf '%s\n' "$$" > "$cpp_pid_file"
  node packages/api/scripts/c-cpp-playground.mjs & cpp_playground_pid=$!
  wait "$cpp_playground_pid"
  exit 0
fi
# Only explicit isolated specs: several legacy specs still discover dev dotenv.
COVE_INTEGRATION_DATABASE_URL="$DATABASE_URL" COVE_INTEGRATION_REDIS_URL="$REDIS_URL" \
  pnpm --filter @cove/api exec vitest run src/judge/compiled-exercises.integration.spec.ts
pnpm exec playwright test --config e2e/c-cpp.playwright.config.ts "$@"
