#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_command docker
require_command python3
require_file "$compose_file"
require_file "$deployment_env"

required_files=(
  "$deployment_env"
  "$deploy_root/secrets/api.env"
  "$deploy_root/secrets/studio.env"
  "$deploy_root/secrets/mvp.env"
  "$deploy_root/secrets/monitoring.env"
  "$deploy_root/secrets/backup.env"
  "$deploy_root/secrets/redis-password"
  "$deploy_root/generated/alertmanager.yml"
)
if feature_enabled VIDEO_LESSONS_ENABLED; then
  required_files+=("$deploy_root/secrets/video-worker.env")
fi
if feature_enabled GUI_ENABLED; then
  required_files+=("$deploy_root/secrets/gui.env")
fi

for required in "${required_files[@]}"; do
  require_file "$required"
  if permissions="$(stat -c '%a' "$required" 2>/dev/null)"; then
    :
  else
    permissions="$(stat -f '%Lp' "$required")"
  fi
  if [[ "$permissions" != "600" ]]; then
    fail "$required permissions are $permissions; production secret files must be 0600"
  fi
done

if grep -ERnqi \
  'replace_with|sha-replace|PROJECT_REF|OLD_PROJECT_REF|operator@example\.com|build-placeholder|your-production-domain' \
  "$deployment_env" "${required_files[@]}"; then
  fail "placeholder values remain in production configuration"
fi

set -a
# deployment.env contains only operator-controlled non-secret KEY=VALUE lines.
source "$deployment_env"
set +a

for image_variable in HOME_IMAGE STUDIO_IMAGE API_IMAGE JUDGE_IMAGE MIGRATION_IMAGE MVP_IMAGE; do
  image_value="${!image_variable:-}"
  [[ "$image_value" =~ ^ghcr\.io/[a-z0-9_.-]+/[a-z0-9_.-]+:sha-[0-9a-f]{40}$ ]] \
    || fail "$image_variable must be a private GHCR image pinned to sha-<40 lowercase hex>"
done
if feature_enabled VIDEO_LESSONS_ENABLED; then
  [[ "${VIDEO_WORKER_IMAGE:-}" =~ ^ghcr\.io/[a-z0-9_.-]+/[a-z0-9_.-]+:sha-[0-9a-f]{40}$ ]] \
    || fail "VIDEO_WORKER_IMAGE must be pinned to the approved release SHA"
  scratch_path="${VIDEO_SCRATCH_HOST_PATH:-/opt/cove/video-scratch}"
  [[ -d "$scratch_path" ]] || fail "video scratch directory must be provisioned before enabling video"
  [[ "$(stat -c '%u' "$scratch_path")" == "1001" ]] || fail "video scratch must be owned by worker UID 1001"
  scratch_available_kb="$(df -Pk "$scratch_path" | awk 'NR==2 {print $4}')"
  (( scratch_available_kb >= 40 * 1024 * 1024 )) || fail "video processing requires at least 40 GiB free scratch space"
  python3 - "$deploy_root/secrets/api.env" "$deploy_root/secrets/video-worker.env" <<'PY'
import pathlib, sys
def read(path):
    values = {}
    for line in pathlib.Path(path).read_text().splitlines():
        key, separator, value = line.strip().partition("=")
        if separator and not key.startswith("#"):
            values[key.strip()] = value.strip().strip("\"'")
    return values
api, worker = map(read, sys.argv[1:])
for key in ("DATABASE_URL", "SUPABASE_URL", "SUPABASE_SECRET_KEY"):
    if not api.get(key) or api[key] != worker.get(key):
        raise SystemExit(f"video worker {key} must match the API environment")
PY
fi

if feature_enabled GUI_ENABLED; then
  for image_variable in GUI_SERVICE_IMAGE GUI_RUNTIME_IMAGE; do
    image_value="${!image_variable:-}"
    [[ "$image_value" =~ ^ghcr\.io/[a-z0-9_.-]+/[a-z0-9_.-]+:sha-[0-9a-f]{40}$ ]] \
      || fail "$image_variable must be pinned to the approved release SHA"
  done
  python3 - "$deploy_root/secrets/api.env" "$deploy_root/secrets/gui.env" <<'PY'
import pathlib, sys
def read(path):
    values = {}
    for line in pathlib.Path(path).read_text().splitlines():
        key, separator, value = line.strip().partition("=")
        if separator and not key.startswith("#"):
            values[key.strip()] = value.strip().strip("\"'")
    return values
api, gui = map(read, sys.argv[1:])
secret = gui.get("GUI_SERVICE_SECRET", "")
if len(secret) < 32 or api.get("GUI_SERVICE_SECRET") != secret:
    raise SystemExit("GUI broker and API shared secrets must match")
if api.get("GUI_SERVICE_URL") != "http://gui-service:4010":
    raise SystemExit("API GUI_SERVICE_URL must use the private GUI broker")
if api.get("GUI_PUBLIC_WS_URL") != "wss://cs.coveedu.com/gui":
    raise SystemExit("API GUI_PUBLIC_WS_URL must use the protected studio WebSocket route")
if gui.get("GUI_ALLOWED_ORIGINS") != "https://cs.coveedu.com":
    raise SystemExit("GUI_ALLOWED_ORIGINS must be the exact production studio origin")
capacity = int(gui.get("GUI_SESSION_CAPACITY", "0"))
if not 1 <= capacity <= 64:
    raise SystemExit("GUI_SESSION_CAPACITY must explicitly reserve 1..64 learner slots")
PY
fi


[[ "$ACME_EMAIL" == *@*.* ]] || fail "ACME_EMAIL is not a valid operational email address"

api_bff="$(sed -n 's/^BFF_SHARED_SECRET=//p' "$deploy_root/secrets/api.env" | tail -n 1)"
studio_bff="$(sed -n 's/^BFF_SHARED_SECRET=//p' "$deploy_root/secrets/studio.env" | tail -n 1)"
[[ -n "$api_bff" && ${#api_bff} -ge 32 ]] || fail "API BFF_SHARED_SECRET must contain at least 32 characters"
[[ "$api_bff" == "$studio_bff" ]] || fail "API and Studio BFF_SHARED_SECRET values do not match"

redis_password="$(tr -d '\r\n' < "$deploy_root/secrets/redis-password")"
[[ "$redis_password" =~ ^[A-Za-z0-9_-]{32,}$ ]] \
  || fail "Redis password must be 32+ URL-safe characters (letters, numbers, underscore, hyphen)"
api_redis_password="$(sed -nE 's#^REDIS_URL=redis://:([^@]+)@redis:6379/0$#\1#p' "$deploy_root/secrets/api.env" | tail -n 1)"
[[ "$redis_password" == "$api_redis_password" ]] || fail "Redis secret and API REDIS_URL password do not match"

python3 - \
  "$deploy_root/secrets/api.env" \
  "$deploy_root/secrets/studio.env" \
  "$deploy_root/secrets/mvp.env" \
  "$deploy_root/secrets/backup.env" <<'PY'
import pathlib
import sys
from urllib.parse import urlparse


def read_env(path: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in pathlib.Path(path).read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator:
            raise SystemExit(f"invalid environment line in {path}")
        values[key.strip()] = value.strip().strip("\"'")
    return values


api, studio, mvp, backup = map(read_env, sys.argv[1:])

# The MVP signs its own session cookie. A missing secret is invisible until
# someone signs in with a correct password, so it is checked before release.
if len(mvp.get("JWT_SECRET", "")) < 32:
    raise SystemExit("MVP JWT_SECRET must contain at least 32 characters")
expected = {
    "API WEB_ORIGIN": (api.get("WEB_ORIGIN"), "https://cs.coveedu.com"),
    "Studio NEXT_PUBLIC_API_URL": (
        studio.get("NEXT_PUBLIC_API_URL"),
        "https://api.coveedu.com/api/rpc",
    ),
    "Studio NEXT_PUBLIC_SITE_URL": (
        studio.get("NEXT_PUBLIC_SITE_URL"),
        "https://cs.coveedu.com",
    ),
    "MVP JUDGE_CALLBACK_BASE_URL": (
        mvp.get("JUDGE_CALLBACK_BASE_URL"),
        "https://mvp.coveedu.com",
    ),
}
for label, (actual, wanted) in expected.items():
    if actual != wanted:
        raise SystemExit(f"{label} must be {wanted}")

for label, value in {
    "API SUPABASE_URL": api.get("SUPABASE_URL"),
    "Studio NEXT_PUBLIC_SUPABASE_URL": studio.get("NEXT_PUBLIC_SUPABASE_URL"),
    "MVP NEXT_PUBLIC_SUPABASE_URL": mvp.get("NEXT_PUBLIC_SUPABASE_URL"),
    "backup health check": backup.get("BACKUP_HEALTHCHECK_URL"),
}.items():
    parsed = urlparse(value or "")
    if parsed.scheme != "https" or not parsed.hostname:
        raise SystemExit(f"{label} must be an HTTPS URL")

repository = backup.get("RESTIC_REPOSITORY", "")
if not repository.startswith("s3:https://"):
    raise SystemExit("RESTIC_REPOSITORY must use an HTTPS S3 endpoint")
PY

compose config --quiet
compose_json="$(compose config --format json)"
python3 - "$compose_json" <<'PY'
import json
import sys

configuration = json.loads(sys.argv[1])
violations = []
for name, service in configuration.get("services", {}).items():
    ports = service.get("ports") or []
    if not ports or name == "caddy":
        continue
    if name == "grafana" and all(
        port.get("host_ip") in {"127.0.0.1", "::1"} for port in ports
    ):
        continue
    violations.append(name)
if violations:
    raise SystemExit("unexpected public ports on: " + ", ".join(sorted(violations)))
PY

if [[ -r /proc/meminfo ]]; then
  total_kb="$(awk '/MemTotal:/ {print $2}' /proc/meminfo)"
  available_kb="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)"
else
  total_kb="$(( $(sysctl -n hw.memsize) / 1024 ))"
  available_kb="$total_kb"
fi
(( total_kb >= 10 * 1024 * 1024 )) || fail "production requires a VPS with at least 10 GiB total memory"
reserved_available_kb=$((2 * 1024 * 1024))
if feature_enabled VIDEO_LESSONS_ENABLED; then
  reserved_available_kb=$((reserved_available_kb + 2 * 1024 * 1024))
fi
if feature_enabled GUI_ENABLED; then
  gui_capacity="$(sed -n 's/^GUI_SESSION_CAPACITY=//p' "$deploy_root/secrets/gui.env" | tail -n 1)"
  reserved_available_kb=$((reserved_available_kb + 256 * 1024 + gui_capacity * 512 * 1024))
fi
(( available_kb >= reserved_available_kb )) || fail "insufficient available memory for application headroom and enabled learning runtimes"
cpu_count="$(getconf _NPROCESSORS_ONLN)"
(( cpu_count >= 6 )) || fail "production requires at least 6 online CPU cores"
available_disk_kb="$(df -Pk "$deploy_root" | awk 'NR==2 {print $4}')"
(( available_disk_kb >= 20 * 1024 * 1024 )) || fail "less than 20 GB disk is currently available"

docker info >/dev/null
printf 'Production preflight passed.\n'
