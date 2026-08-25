#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

namespace="${1:-}"
tag="${2:-}"
[[ "$namespace" =~ ^ghcr\.io/[a-z0-9_.-]+$ ]] || fail "invalid GHCR namespace"
assert_safe_tag "$tag"
require_file "$deployment_env"

mkdir -p "$deploy_root/state"
chmod 700 "$deploy_root/state"
candidate="$(mktemp "$deploy_root/state/mvp-release.XXXXXX")"
cp "$deployment_env" "$candidate"
chmod 600 "$candidate"
python3 - "$candidate" "$namespace/cove-mvp:$tag" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
image = sys.argv[2]
lines = path.read_text().splitlines()
for index, line in enumerate(lines):
    if line.startswith("MVP_IMAGE="):
        lines[index] = "MVP_IMAGE=" + image
        break
else:
    raise SystemExit("deployment manifest lacks MVP_IMAGE")
path.write_text("\n".join(lines) + "\n")
PY

"$script_dir/deploy.sh" "$candidate"
