#!/usr/bin/env bash
# Expected to fail closed on ordinary Docker Desktop: no delegated host controls.
set -euo pipefail
native_image="${1:?Immutable local image ID required}"
case "$native_image" in sha256:????????????????????????????????????????????????????????????????) ;; *) exit 2;; esac
native_endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
case "$native_endpoint" in unix:///*) ;; *) echo 'Local Docker required' >&2; exit 2;; esac
command docker --host "$native_endpoint" run --rm --network none --read-only --cap-drop ALL \
 --security-opt no-new-privileges --cpus 2 --memory 3g --pids-limit 256 \
 --tmpfs /tmp:rw,nosuid,nodev,noexec,size=128m --entrypoint /bin/sh "$native_image" -c \
 'mkdir -m 700 /tmp/qualification; /opt/cove/node /opt/cove/tools/manifest.mjs /opt/cove /sys/fs/cgroup /tmp/qualification/config.json && /opt/cove/node /opt/cove/tools/container-preflight.mjs /tmp/qualification/config.json'
