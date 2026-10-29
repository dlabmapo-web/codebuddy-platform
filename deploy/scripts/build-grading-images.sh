#!/usr/bin/env bash
# Build only; no publishing, systemd, daemon setup or workload start.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
grading_tag="${1:?usage: build-grading-images.sh LOCAL_TAG [PLATFORM]}"
[[ "$grading_tag" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || exit 1
grading_platform="${2:-linux/amd64}"
[[ "$grading_platform" == linux/amd64 || "$grading_platform" == linux/arm64 ]] || exit 1
node packages/grading-runtime/guest/prepare-artifacts.mjs
for engine in cpython pyodide; do
  hash="$(node -e 'console.log(require(process.argv[1]).packageManifestHash)' "./packages/grading-runtime/guest/artifacts/$engine-identity.json")"
  kind=native; [[ "$engine" == cpython ]] || kind=compatibility
  docker build --platform "$grading_platform" -f "packages/grading-runtime/guest/Dockerfile.$kind" --build-arg "PACKAGE_MANIFEST_HASH=$hash" -t "cove-grading-$kind:$grading_tag" .
done
docker build --platform "$grading_platform" -f packages/grading-runtime/Dockerfile.broker -t "cove-grading-broker:$grading_tag" .
# Config IDs are NOT registry manifest digests. Publication must add immutable
# registry pull references and verify both identities after pulling.
docker image inspect "cove-grading-native:$grading_tag" "cove-grading-compatibility:$grading_tag" "cove-grading-broker:$grading_tag" --format '{{json .Id}} {{json .Architecture}} {{json .Config.Labels}}'
