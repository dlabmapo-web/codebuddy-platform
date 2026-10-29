#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

# A disabled selection flag does not retire accepted native/v4 snapshots.
[[ ! -e "$deploy_root/state/grading-handover.json" ]] || fail "Rootless grading handover is retained; use the forward-compatible grading release procedure. Ordinary release/rollback refused before mutation."

namespace="${1:-}"
tag="${2:-}"
gui="${3:-}"
short_answer="${4:-}"
choice="${5:-}"
video="${6:-}"
trial="${7:-false}"
browser_config="${8:-}"
[[ "$namespace" =~ ^ghcr\.io/[a-z0-9_.-]+$ ]] || fail "invalid GHCR namespace"
assert_safe_tag "$tag"
require_file "$deployment_env"

mkdir -p "$deploy_root/state"
chmod 700 "$deploy_root/state"
candidate="$(mktemp "$deploy_root/state/v2-release.XXXXXX")"
cp "$deployment_env" "$candidate"
chmod 600 "$candidate"

python3 - "$candidate" "$namespace" "$tag" "$gui" "$short_answer" "$choice" "$video" "$trial" "$browser_config" "$script_dir" <<'PY'
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
    "VIDEO_WORKER_IMAGE": f"{namespace}/cove-video-worker:{tag}",
    "GUI_SERVICE_IMAGE": f"{namespace}/cove-gui-service:{tag}",
    "GUI_RUNTIME_IMAGE": f"{namespace}/cove-gui-runtime:{tag}",
    "DLAB_OS_BASE_URL": "https://os.dlabcampus.com/v1",
}
for key, value in zip(
    ("GUI_ENABLED", "SHORT_ANSWER_ENABLED", "MULTIPLE_CHOICE_ENABLED", "VIDEO_LESSONS_ENABLED", "TURTLE_TRIAL_ENABLED"),
    sys.argv[4:9],
):
    if value:
        if value not in ("true", "false"):
            raise SystemExit(f"{key} must be true or false")
        updates[key] = value
browser_keys = set()
if sys.argv[9]:
    import importlib.util
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location('browser_release', pathlib.Path(sys.argv[10]) / 'turtle-browser-release.py')
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    current = {}
    for line in path.read_text().splitlines():
        key, separator, value = line.partition('=')
        if separator and not key.startswith('#'):
            current[key.strip()] = value.strip().strip("\"'")
    browser = helper.release_updates(sys.argv[9], {**current, **updates})
    updates.update(browser)
    browser_keys = set(browser)
seen = set()
lines = []
for line in path.read_text().splitlines():
    key = line.split("=", 1)[0]
    if key in updates:
        lines.append(f"{key}={updates[key]}")
        seen.add(key)
    else:
        lines.append(line)
optional = {"VIDEO_WORKER_IMAGE", "GUI_SERVICE_IMAGE", "GUI_RUNTIME_IMAGE", "DLAB_OS_BASE_URL"}
optional.update(browser_keys)
optional.update(key for key in updates if key.endswith("_ENABLED"))
missing = (updates.keys() - optional) - seen
if missing:
    raise SystemExit("deployment manifest lacks: " + ", ".join(sorted(missing)))
for key in sorted(optional - seen):
    lines.append(f"{key}={updates[key]}")
path.write_text("\n".join(lines) + "\n")
PY

"$script_dir/deploy.sh" "$candidate"
