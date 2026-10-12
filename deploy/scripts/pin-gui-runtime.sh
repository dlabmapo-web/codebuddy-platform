#!/usr/bin/env bash
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"
require_file "$deployment_env"
require_file "$deploy_root/secrets/gui.env"
runtime_image="$(sed -n 's/^GUI_RUNTIME_IMAGE=//p' "$deployment_env" | tail -n 1)"
[[ "$runtime_image" =~ ^ghcr\.io/[a-z0-9_.-]+/[a-z0-9_.-]+:sha-[0-9a-f]{40}$ ]] \
  || fail "GUI runtime must use a release SHA tag"
docker pull "$runtime_image"
runtime_digest="$(docker image inspect --format '{{index .RepoDigests 0}}' "$runtime_image")"
[[ "$runtime_digest" =~ ^ghcr\.io/[a-z0-9_.-]+/[a-z0-9_.-]+@sha256:[0-9a-f]{64}$ ]] \
  || fail "GUI runtime registry digest could not be verified"
retained_images="$(python3 - "$deploy_root/secrets/gui.env" "$runtime_digest" <<'PY'
import pathlib, re, sys
values = dict(line.split("=", 1) for line in pathlib.Path(sys.argv[1]).read_text().splitlines() if "=" in line and not line.startswith("#"))
retained = [ref.strip() for ref in values.get("GUI_RETAINED_RUNTIME_IMAGES", "").split(",") if ref.strip()]
previous = values.get("GUI_RUNTIME_IMAGE", "")
if previous and previous != sys.argv[2]:
    retained.append(previous)
retained = list(dict.fromkeys(ref for ref in retained if ref != sys.argv[2]))
if len(retained) > 16:
    raise SystemExit("GUI retention limit reached; review saved lessons and submissions before removing a runtime")
for ref in retained:
    if not re.fullmatch(r"ghcr\.io/[a-z0-9_.-]+/[a-z0-9_.-]+@sha256:[0-9a-f]{64}", ref):
        raise SystemExit("Retained GUI runtime must be an approved registry digest")
print("\n".join(retained))
PY
)"
while IFS= read -r image_ref; do
  [[ -z "$image_ref" ]] || docker pull "$image_ref"
done <<< "$retained_images"
python3 - "$deploy_root/secrets/gui.env" "$runtime_digest" "$retained_images" <<'PY'
import os, pathlib, sys, tempfile
path = pathlib.Path(sys.argv[1])
lines = [line for line in path.read_text().splitlines() if not line.startswith(("GUI_RUNTIME_IMAGE=", "GUI_RETAINED_RUNTIME_IMAGES="))]
lines.append("GUI_RUNTIME_IMAGE=" + sys.argv[2])
lines.append("GUI_RETAINED_RUNTIME_IMAGES=" + ",".join(sys.argv[3].splitlines()))
with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as output:
    os.fchmod(output.fileno(), 0o600)
    output.write("\n".join(lines) + "\n")
    temporary = output.name
os.replace(temporary, path)
PY
printf 'GUI runtime pinned to the approved registry digest.\n'
