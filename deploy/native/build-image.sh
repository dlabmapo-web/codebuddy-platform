#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
native_endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
case "$native_endpoint" in unix:///*) ;; *) echo 'Local Docker required' >&2; exit 1;; esac
docker() { command docker --host "$native_endpoint" "$@"; }
native_tag="${1:-cove-native-node:qualification}"
docker build -f packages/grading-runtime/guest/Dockerfile -t cove-native-guest:qualification packages/grading-runtime/guest
native_guest_id="$(docker image inspect -f '{{.Id}}' cove-native-guest:qualification)"
# BuildKit cannot resolve a bare local config digest as FROM. Bind a digest-derived
# local tag, verify before and after build, and record the immutable config ID.
native_guest_tag="cove-native-guest:sha-${native_guest_id#sha256:}"
docker tag "$native_guest_id" "$native_guest_tag"
[ "$(docker image inspect -f '{{.Id}}' "$native_guest_tag")" = "$native_guest_id" ]
docker build -f deploy/docker/native-grading.Dockerfile --build-arg "NATIVE_GUEST_IMAGE=$native_guest_tag" -t "$native_tag" .
[ "$(docker image inspect -f '{{.Id}}' "$native_guest_tag")" = "$native_guest_id" ]
docker image inspect --format '{{json .}}' "$native_tag"
