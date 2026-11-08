#!/bin/sh
# Production native node, one container per host (deploy/compose.production.yml).
#
# The container's private cgroup namespace root is the node envelope the
# launcher verifies: Compose sizes it with cpus, mem_limit, memswap_limit and
# pids_limit. Every process moves into its `service` leaf before controllers are
# delegated, so learner cases are the envelope's only other groups.
#
#   serve    start the launcher and the native worker (the default)
#   qualify  run the real-kernel containment checks on this host, then exit
set -eu
mode="${1:-serve}"
artifact=/opt/cove
state=/run/cove-native
shared=/run/cove-native-shared
root=/sys/fs/cgroup
node="$artifact/node"
case "$mode" in serve|qualify) ;; *) echo "usage: container-node.sh [serve|qualify]" >&2; exit 2;; esac
[ "$(stat -f -c %T "$root")" = cgroup2fs ] || { echo 'cgroup v2 required' >&2; exit 78; }

# Docker mounts the namespace's cgroup2 read-only. A fresh mount inside this
# container's own mount and cgroup namespaces is the same envelope, writable.
if [ ! -w "$root/cgroup.subtree_control" ]; then
  umount "$root"
  mount -t cgroup2 -o rw,nosuid,nodev,noexec cgroup2 "$root"
fi
mkdir -p "$root/service"
# No internal processes: the root may delegate controllers only once it is empty.
for pid in $(cat "$root/cgroup.procs"); do
  echo "$pid" > "$root/service/cgroup.procs" 2>/dev/null || true
done
echo '+cpu +memory +pids' > "$root/cgroup.subtree_control"

install -d -m 700 "$state"
"$node" "$artifact/tools/manifest.mjs" "$artifact" "$root" "$state/config.json" > /dev/null
export LD_LIBRARY_PATH="$artifact/launcher-lib"

if [ "$mode" = qualify ]; then
  exec "$node" "$artifact/tools/kernel-qualification.mjs" "$artifact" "$state/config.json"
fi

# Worker credentials stay in this private file; the launcher starts with a
# clean environment and learner jails never inherit one.
umask 077
"$node" -e '
const { readFileSync, writeFileSync, renameSync } = require("node:fs");
const [state, shared] = process.argv.slice(1);
const config = JSON.parse(readFileSync(state + "/config.json", "utf8"));
writeFileSync(state + "/manifest.json", JSON.stringify(config.manifest), { mode: 0o600 });
const env = process.env, worker = {
  JUDGE_RUNTIME_FAMILY: "native",
  NATIVE_GRADING_MANIFEST: state + "/manifest.json",
  NATIVE_GRADING_SOCKET: config.socketPath,
  DATABASE_URL: env.DATABASE_URL, REDIS_URL: env.REDIS_URL,
  DATABASE_POOL_MAX: env.NATIVE_DATABASE_POOL_MAX ?? "4",
  DATABASE_CONNECTION_BUDGET: env.DATABASE_CONNECTION_BUDGET ?? "60",
  DATABASE_API_POOL_BUDGET: env.DATABASE_API_POOL_BUDGET ?? "30",
  DATABASE_OPERATIONAL_RESERVE: env.DATABASE_OPERATIONAL_RESERVE ?? "6",
  JUDGE_FLEET_WORKER_COUNT: "1",
  JUDGE_HEALTH_PORT: env.NATIVE_HEALTH_PORT ?? "4102",
  JUDGE_COMPARATOR_POOL_SIZE: env.NATIVE_COMPARATOR_POOL_SIZE ?? "2",
};
writeFileSync(state + "/worker.json", JSON.stringify(worker), { mode: 0o600 });
// The API admits work by this manifest. Not secret: runtime identity, sizing and
// scope. Replaced atomically so a reader never sees half of it.
writeFileSync(shared + "/manifest.json.next", JSON.stringify(config.manifest), { mode: 0o644 });
renameSync(shared + "/manifest.json.next", shared + "/manifest.json");
' "$state" "$shared"
umask 022
exec env -i PATH=/usr/bin:/bin /bin/bash "$artifact/tools/start-node.sh" "$artifact" "$state/config.json" "$state/worker.json"
