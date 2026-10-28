#!/usr/bin/env bash
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"
mkdir -p "$deploy_root/runtime/turtle-browser" "$deploy_root/generated/turtle-browser"
# First installs with both flags off need no artifact, DNS or certificate.
if ! feature_enabled TURTLE_TRIAL_BROWSER_ENABLED && ! feature_enabled TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED; then
  python3 "$script_dir/turtle-browser-assets.py" --env "$deployment_env" \
    --destination "$deploy_root/runtime/turtle-browser" --snippet "$deploy_root/generated/turtle-browser/runtime.caddy"
  exit 0
fi
image="$(python3 - "$deployment_env" <<'PY'
import pathlib, sys
for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
    key, sep, value = line.partition('=')
    if sep and key == 'STUDIO_IMAGE': print(value.strip().strip("\"'"))
PY
)"
[[ "$image" =~ ^ghcr\.io/[a-z0-9_.-]+/[a-z0-9_.-]+:sha-[a-f0-9]{40}$ ]] || fail "invalid pinned studio image"
artifact="$(mktemp -d)"
container=''
cleanup() { [[ -z "$container" ]] || docker rm "$container" >/dev/null; rm -rf "$artifact"; }
trap cleanup EXIT
container="$(docker create --network none --entrypoint /bin/true "$image")"
docker cp "$container:/opt/cove/turtle-browser-runtime/." "$artifact/"
python3 "$script_dir/turtle-browser-assets.py" --env "$deployment_env" \
  --destination "$deploy_root/runtime/turtle-browser" --artifact "$artifact" \
  --snippet "$deploy_root/generated/turtle-browser/runtime.caddy"
