#!/usr/bin/env bash
# Invoke inside an already delegated, limited systemd unit. No host provisioning.
set -euo pipefail
native_artifact="${1:?Artifact path required}"; native_config="${2:?Config required}"; native_env="${3:?Private worker JSON required}"
native_node="$native_artifact/node"
"$native_node" "$native_artifact/tools/validate-deployment.mjs" "$native_config" "$native_config.deployment.json"
native_launcher=''; native_worker=''
cleanup() {
 # Drain accepted descriptor-bound jobs while the launcher is still available.
 if [ -n "$native_worker" ]; then kill -TERM "$native_worker" 2>/dev/null || true; wait "$native_worker" || true; fi
 if [ -n "$native_launcher" ]; then kill -TERM "$native_launcher" 2>/dev/null || true; wait "$native_launcher" || true; fi
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
env -i PATH=/usr/bin:/bin LD_LIBRARY_PATH="$native_artifact/launcher-lib" "$native_node" "$native_artifact/worker/node_modules/@cove/grading-runtime/dist/main.js" "$native_config" & native_launcher=$!
# Worker bootstrap independently probes readiness; do not start consumers before socket exists.
for native_try in {1..100}; do
 if "$native_node" -e 'const f=require("fs"),c=JSON.parse(f.readFileSync(process.argv[1]));process.exit(f.existsSync(c.socketPath)?0:1)' "$native_config"; then break; fi
 kill -0 "$native_launcher"; sleep .1
done
setpriv --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs \
 env -i PATH=/usr/bin:/bin DOTENV_CONFIG_PATH=/dev/null "$native_node" --max-old-space-size=512 "$native_artifact/tools/worker-entry.mjs" "$native_artifact" "$native_env" & native_worker=$!
# A failed component removes node availability; accepted work stays on its recorded family.
wait -n "$native_launcher" "$native_worker"
exit 1
