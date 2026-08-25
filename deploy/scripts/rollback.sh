#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

previous="$deploy_root/state/previous-deployment.env"
require_file "$previous"

current_copy="$deploy_root/state/failed-deployment.env"
install -m 600 "$deployment_env" "$current_copy"
install -m 600 "$previous" "$deployment_env"

compose pull home studio api judge-worker mvp
compose up -d --remove-orphans
"$script_dir/wait-healthy.sh"
"$script_dir/smoke.sh"

printf 'Rollback completed. Database migrations were not reversed.\n'
