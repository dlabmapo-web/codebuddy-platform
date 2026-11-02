#!/usr/bin/env bash
# Read-only image builds, never deploys or pushes. Source/context excludes private state.
set -euo pipefail
native_repo="$(cd "$(dirname "$0")/../.." && pwd)";cd "$native_repo"
native_out="${1:?New evidence directory required}";mkdir -m 700 "$native_out"
native_endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
case "$native_endpoint" in unix:///*) ;; *) echo 'Local Docker required' >&2;exit 2;; esac
for native_recipe in api judge-worker web home; do
 command docker --host "$native_endpoint" build --target dependencies -f "deploy/docker/$native_recipe.Dockerfile" -t "cove-native-bridge-$native_recipe:dependencies" . > "$native_out/$native_recipe-dependencies.log" 2>&1
 done
# Worker builder follows API source imports and proves both shared/runtime build order.
command docker --host "$native_endpoint" build --target builder -f deploy/docker/judge-worker.Dockerfile -t cove-native-bridge-worker:qualification . > "$native_out/worker-builder.log" 2>&1
