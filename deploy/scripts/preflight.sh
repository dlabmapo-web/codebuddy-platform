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
(( available_kb >= 2 * 1024 * 1024 )) || fail "less than 2 GiB memory is currently available"
cpu_count="$(getconf _NPROCESSORS_ONLN)"
(( cpu_count >= 6 )) || fail "production requires at least 6 online CPU cores"
available_disk_kb="$(df -Pk "$deploy_root" | awk 'NR==2 {print $4}')"
(( available_disk_kb >= 20 * 1024 * 1024 )) || fail "less than 20 GB disk is currently available"

docker info >/dev/null
printf 'Production preflight passed.\n'
