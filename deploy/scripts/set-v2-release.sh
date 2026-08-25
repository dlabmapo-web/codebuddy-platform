#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

namespace="${1:-}"
tag="${2:-}"
[[ "$namespace" =~ ^ghcr\.io/[a-z0-9_.-]+$ ]] || fail "invalid GHCR namespace"
assert_safe_tag "$tag"
require_file "$deployment_env"

mkdir -p "$deploy_root/state"
chmod 700 "$deploy_root/state"
candidate="$(mktemp "$deploy_root/state/v2-release.XXXXXX")"
cp "$deployment_env" "$candidate"
chmod 600 "$candidate"

python3 - "$candidate" "$namespace" "$tag" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
namespace = sys.argv[2]
tag = sys.argv[3]
updates = {
    "HOME_IMAGE": f"{namespace}/cove-home:{tag}",
    "STUDIO_IMAGE": f"{namespace}/cove-studio:{tag}",
    "API_IMAGE": f"{namespace}/cove-api:{tag}",
    "JUDGE_IMAGE": f"{namespace}/cove-judge:{tag}",
    "MIGRATION_IMAGE": f"{namespace}/cove-migration:{tag}",
}
seen = set()
lines = []
for line in path.read_text().splitlines():
    key = line.split("=", 1)[0]
    if key in updates:
        lines.append(f"{key}={updates[key]}")
        seen.add(key)
    else:
        lines.append(line)
missing = updates.keys() - seen
if missing:
    raise SystemExit("deployment manifest lacks: " + ", ".join(sorted(missing)))
path.write_text("\n".join(lines) + "\n")
PY

"$script_dir/deploy.sh" "$candidate"
