#!/usr/bin/env bash
set -euo pipefail
native_image="${1:?Immutable image ID required}"
case "$native_image" in sha256:????????????????????????????????????????????????????????????????) ;; *) exit 2;; esac
native_endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}')";case "$native_endpoint" in unix:///*) ;; *) exit 2;; esac
command docker --host "$native_endpoint" run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
 --tmpfs /verify:rw,nosuid,nodev,exec,size=128m --memory 512m --cpus 1 --pids-limit 64 --entrypoint /bin/sh "$native_image" -c '
 set -e
 readelf -d /opt/cove/nsjail | grep -F '\''$ORIGIN/launcher-lib'\''
 /opt/cove/node /opt/cove/tools/verify-linkage.mjs /opt/cove
 /opt/cove/node /opt/cove/tools/worker-closure.mjs --verify /opt/cove/worker
 /opt/cove/node --input-type=module -e '\''import {validateLauncherLibraries} from "/opt/cove/tools/validate-artifacts.mjs";await validateLauncherLibraries("/opt/cove");await import("/opt/cove/worker/dist/src/judge/native-worker.js");console.log("artifact closure and launcher dependency hashes PASS")'\''
 if find /opt/cove/worker -name ".env*" -o -name "*authority*.json" -o -path "*/.auth/*" | grep .; then exit 1; fi
 '
