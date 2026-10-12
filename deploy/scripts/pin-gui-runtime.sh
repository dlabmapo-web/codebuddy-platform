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
python3 - "$deploy_root/secrets/gui.env" "$runtime_digest" <<'PY'
import os, pathlib, sys, tempfile
path = pathlib.Path(sys.argv[1])
lines = [line for line in path.read_text().splitlines() if not line.startswith("GUI_RUNTIME_IMAGE=")]
lines.append("GUI_RUNTIME_IMAGE=" + sys.argv[2])
with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as output:
    os.fchmod(output.fileno(), 0o600)
    output.write("\n".join(lines) + "\n")
    temporary = output.name
os.replace(temporary, path)
PY
printf 'GUI runtime pinned to the approved registry digest.\n'
