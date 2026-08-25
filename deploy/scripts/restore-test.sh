#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_command restic
require_file "$deploy_root/secrets/backup.env"
set -a
source "$deploy_root/secrets/backup.env"
set +a

restore_dir="$(mktemp -d "$deploy_root/backups/restore-test.XXXXXX")"
cleanup() {
  [[ "$restore_dir" == "$deploy_root/backups/restore-test."* ]] && rm -rf -- "$restore_dir"
}
trap cleanup EXIT

restic restore latest --tag cove-production --target "$restore_dir"

for archive in redis_data caddy_data caddy_config; do
  restored="$(find "$restore_dir" -path "*/volumes/${archive}.tar.gz" -type f -print -quit)"
  [[ -n "$restored" ]] || fail "restored backup lacks ${archive}.tar.gz"
  tar -tzf "$restored" >/dev/null
done

config_archive="$(find "$restore_dir" -path '*/config/deployment-config.tar.gz' -type f -print -quit)"
[[ -n "$config_archive" ]] || fail "restored backup lacks deployment configuration"
tar -tzf "$config_archive" >/dev/null

printf 'Latest encrypted backup restored and validated successfully.\n'
