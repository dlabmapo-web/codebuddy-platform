#!/usr/bin/env bash
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"
case "${1:-}" in
  --help|-h) printf 'Usage: drain-turtle-browser.sh [--resume]\n'; exit 0 ;;
  ''|--resume) (( $# <= 1 )) || fail "usage: drain-turtle-browser.sh [--resume]" ;;
  *) fail "usage: drain-turtle-browser.sh [--resume]" ;;
esac
# The candidate image may be broken or not yet pulled. Use the immutable image
# of the installed API container, including a stopped/unhealthy one.
installed="$(compose ps --all -q api)"
[[ "$installed" =~ ^[a-f0-9]{12,64}$ ]] || fail "cannot identify the installed API image for a safe browser drain"
image="$(docker inspect --format '{{.Image}}' "$installed")"
[[ "$image" =~ ^sha256:[a-f0-9]{64}$ ]] || fail "invalid installed API image identity"
mkdir -p "$deploy_root/state"
override="$(mktemp "$deploy_root/state/browser-drain.XXXXXX")"
trap 'rm -f "$override"' EXIT
python3 - "$override" "$image" <<'PY'
import json, pathlib, sys
pathlib.Path(sys.argv[1]).write_text(json.dumps({'services':{'api':{'image':sys.argv[2]}}}))
PY
# Mount the tool into that image; it uses Redis only, without starting Nest.
compose -f "$override" run --rm --no-deps --entrypoint node \
  -v "$script_dir/turtle-browser-drain.mjs:/app/turtle-browser-drain.mjs:ro" \
  api /app/turtle-browser-drain.mjs "$@"
if [[ "${1:-}" != '--resume' ]]; then
  # Controlled clients must lose their 30-second leases before an unaware API
  # can start. This does not pause grading or the full-Python broker.
  sleep 31
fi
