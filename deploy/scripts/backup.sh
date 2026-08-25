#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_command restic
require_command curl
require_file "$deploy_root/secrets/backup.env"

set -a
source "$deploy_root/secrets/backup.env"
set +a

staging="$(mktemp -d "$deploy_root/backups/backup.XXXXXX")"
cleanup() {
  [[ "$staging" == "$deploy_root/backups/backup."* ]] && rm -rf -- "$staging"
}
report_failure() {
  status=$?
  if [[ -n "${BACKUP_HEALTHCHECK_URL:-}" ]]; then
    curl --silent --show-error --max-time 15 --retry 2 \
      --data-raw "Cove backup failed with status $status" \
      "${BACKUP_HEALTHCHECK_URL%/}/fail" >/dev/null || true
  fi
  exit "$status"
}
trap cleanup EXIT
trap report_failure ERR

mkdir -p "$staging/volumes" "$staging/config"

redis_password="$(tr -d '\r\n' < "$deploy_root/secrets/redis-password")"
compose exec -T redis redis-cli --no-auth-warning -a "$redis_password" BGSAVE >/dev/null

redis_snapshot_ready=false
for _ in $(seq 1 60); do
  if compose exec -T redis redis-cli --no-auth-warning -a "$redis_password" INFO persistence \
    | tr -d '\r' \
    | grep -q '^rdb_bgsave_in_progress:0$'; then
    redis_snapshot_ready=true
    break
  fi
  sleep 1
done
[[ "$redis_snapshot_ready" == "true" ]] || fail "Redis snapshot did not finish within 60 seconds"

for volume in redis_data caddy_data caddy_config; do
  docker run --rm \
    -v "cove-production_${volume}:/source:ro" \
    -v "$staging/volumes:/backup" \
    alpine:3.22.1 \
    tar -C /source -czf "/backup/${volume}.tar.gz" .
done

tar -C "$deploy_root" -czf "$staging/config/deployment-config.tar.gz" \
  compose.production.yml deployment.env caddy monitoring generated scripts systemd secrets

restic snapshots >/dev/null 2>&1 || restic init
restic backup "$staging" --tag cove-production
restic forget --keep-daily 7 --keep-weekly 5 --keep-monthly 12 --prune
restic check --read-data-subset=2.5%

if [[ -n "${BACKUP_HEALTHCHECK_URL:-}" ]]; then
  curl --fail --silent --show-error --max-time 15 --retry 2 \
    "${BACKUP_HEALTHCHECK_URL%/}" >/dev/null
fi

trap - ERR
printf 'Encrypted off-server backup completed and checked.\n'
