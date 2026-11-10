#!/usr/bin/env bash
# Real-kernel checks inside an isolated local container, with production flags.
# This proves only the local architecture; qualify amd64 on the deployment host.
set -euo pipefail
native_image="${1:?Immutable local image ID required}"
case "$native_image" in sha256:????????????????????????????????????????????????????????????????) ;; *) echo 'Immutable local image ID required' >&2; exit 2;; esac
native_endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
case "$native_endpoint" in unix:///*) ;; *) echo 'Local Docker required' >&2; exit 2;; esac
command docker --host "$native_endpoint" run --rm --network none --cgroupns=private --read-only \
  --security-opt no-new-privileges:true --security-opt apparmor=unconfined --security-opt seccomp=unconfined \
  --cap-drop ALL --cap-add SYS_ADMIN --cap-add SYS_PTRACE --cap-add SETUID --cap-add SETGID \
  --cap-add SYS_RESOURCE --cap-add DAC_OVERRIDE --cap-add CHOWN --cap-add SETPCAP \
  --cpus 2 --memory 2560m --memory-swap 2560m --pids-limit 256 \
  --tmpfs /run/cove-native:rw,nosuid,nodev,noexec,size=64m,mode=0700 \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=64m \
  --tmpfs /run/cove-native-shared:rw,nosuid,nodev,noexec,size=1m \
  --tmpfs /var/lib/cove-native/artifacts:rw,nosuid,nodev,exec,size=256m,mode=0700 \
  --tmpfs /var/lib/cove-native/staging:rw,nosuid,nodev,noexec,size=192m,mode=0700 \
  --entrypoint /bin/sh "$native_image" /opt/cove/tools/container-node.sh qualify
