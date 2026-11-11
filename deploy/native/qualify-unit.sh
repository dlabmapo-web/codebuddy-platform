#!/usr/bin/env bash
set -euo pipefail
native_work="$1"; native_repo="$2"; native_artifact="${3:?Explicit immutable artifact directory required}"
native_cgroup="/sys/fs/cgroup$(sed -n 's/^0:://p' /proc/self/cgroup)"
case "$native_cgroup" in /sys/fs/cgroup/system.slice/cove-native-*.service) ;; *) echo 'Refusing nonfixture delegated unit' >&2; exit 78;; esac
mkdir "$native_cgroup/service"
echo $$ > "$native_cgroup/service/cgroup.procs"
echo '+cpu +memory +pids' > "$native_cgroup/cgroup.subtree_control"
[ "$(cat "$native_cgroup/pids.max")" = 256 ] || exit 78
native_node="$native_artifact/node"
export LD_LIBRARY_PATH="$native_artifact/launcher-lib"
"$native_node" "$native_artifact/tools/manifest.mjs" "$native_artifact" "$native_cgroup" "$native_work/config.json" > "$native_work/evidence/manifest.json"
"$native_node" "$native_artifact/tools/validate-deployment.mjs" "$native_work/config.json" "$native_work/config.json.deployment.json"
# Same UID for the 0600 socket, worker capabilities explicitly dropped below.
"$native_node" "$native_repo/deploy/native/kernel-qualification.mjs" "$native_artifact" "$native_work/config.json" > "$native_work/evidence/kernel.jsonl" 2>&1
if [ "${4:-full}" = kernel-only ]; then exit 0; fi
# Crash probe leaves empty stale groups intentionally. Unit-wide stop/kill reaps all descendants.
"$native_node" "$native_artifact/worker/node_modules/@cove/grading-runtime/dist/main.js" "$native_work/config.json" > "$native_work/evidence/launcher.log" 2>&1 & native_launcher=$!
native_next=''
cleanup() { [ -z "${native_next:-}" ] || kill -- -"$native_next" 2>/dev/null || true; [ -z "${native_fixture:-}" ] || kill "$native_fixture" 2>/dev/null || true; [ -z "${native_launcher:-}" ] || kill "$native_launcher" 2>/dev/null || true; wait || true; }
trap cleanup EXIT
for native_try in {1..100}; do [ -S "$native_work/socket/executor.sock" ] && break; kill -0 "$native_launcher"; sleep .1; done
setpriv --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs \
 "$native_node" --max-old-space-size=512 "$native_artifact/tools/application-fixture.mjs" "$native_artifact" "$native_work/config.json" "$native_work/authority.json" > "$native_work/evidence/application.log" 2>&1 & native_fixture=$!
for native_try in {1..150}; do [ -f "$native_work/authority.json" ] && break; kill -0 "$native_fixture"; sleep .2; done
# The Next server and the browser stand in for production's separate web
# containers and visitors, so they run beside the node's service leaf, not in
# it: the launcher holds that leaf to serviceOverheadMb on every health probe
# and withdraws readiness above it. Created after the launcher's envelope check.
native_fixture_group="$native_cgroup/fixture-browser"
mkdir "$native_fixture_group"
in_fixture_group() { echo "$BASHPID" > "$native_fixture_group/cgroup.procs"; exec "$@"; }
# Real sanitized Next app, real Nest API and synthetic auth provider all share the owned fixture.
( in_fixture_group setsid setpriv --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs \
 bash "$native_artifact/tools/next-fixture-start.sh" "$native_work/next-source" "http://127.0.0.1:$COVE_NATIVE_AUTH_PORT" "http://127.0.0.1:$COVE_NATIVE_API_PORT" "$COVE_NATIVE_NEXT_ORIGIN" "$native_node" ) > "$native_work/evidence/next-server.log" 2>&1 & native_next=$!
for native_try in {1..100}; do if curl -fsS "$COVE_NATIVE_NEXT_ORIGIN/login" >/dev/null; then break; fi; kill -0 "$native_next"; sleep .2; done
# Strict growth stops after the first correctness/resource failure. Never run 200 here.
for native_clients in 1 2 4 10; do
 for native_cases in 1 5 10; do
  setpriv --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs \
   "$native_node" --max-old-space-size=256 "$native_repo/packages/api/scripts/benchmark-native-classroom.mjs" \
   --fixture "$native_work/authority.json" --output "$native_work/evidence/application-$native_clients-$native_cases.json" \
   --clients "$native_clients" --cases "$native_cases" --generator-concurrency "$native_clients" --max-seconds 60 --authorize-isolated-load
 done
 done
# Bounded actual Next smoke; mixed 2-client subset does not satisfy full-corpus/fleet SLO.
# Chromium's crash reporter requires writable profile/config directories. Keep
# them inside the owned fixture rather than the intentionally nonexistent unit home.
mkdir -m 700 "$native_work/browser-home" "$native_work/browser-home/config" "$native_work/browser-home/cache"
# One student first: the plain Submit-to-visible-score path, before two arrive together.
for native_clients in 1 2; do
( in_fixture_group setpriv --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs \
 env HOME="$native_work/browser-home" XDG_CONFIG_HOME="$native_work/browser-home/config" XDG_CACHE_HOME="$native_work/browser-home/cache" \
 xvfb-run -a "$native_node" --max-old-space-size=512 "$native_repo/packages/api/scripts/benchmark-native-classroom.mjs" --mode next-browser --fixture "$native_work/authority.json" --output "$native_work/evidence/next-browser-$native_clients-10.json" --clients "$native_clients" --cases 10 --max-seconds 120 )
done
kill -- -"$native_next"; wait "$native_next" || true; native_next=''
# Empty and remove the browser group: the crash test's launcher refuses an
# envelope holding a populated group it does not own.
echo 1 > "$native_fixture_group/cgroup.kill"
for native_try in {1..100}; do grep -q '^populated 0$' "$native_fixture_group/cgroup.events" && break; sleep .1; done
rmdir "$native_fixture_group"
kill "$native_fixture"; wait "$native_fixture" || true; native_fixture=''
kill "$native_launcher"; wait "$native_launcher"; native_launcher=''
# Crash test is last because retained empty case evidence intentionally prevents readiness.
"$native_node" "$native_repo/deploy/native/kernel-qualification.mjs" "$native_artifact" "$native_work/config.json" --crash > "$native_work/evidence/crash.jsonl" 2>&1
