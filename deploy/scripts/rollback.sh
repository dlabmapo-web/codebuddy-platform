#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

previous="$deploy_root/state/previous-deployment.env"
require_file "$previous"

current_copy="$deploy_root/state/failed-deployment.env"
install -m 600 "$deployment_env" "$current_copy"
stop_learning_services
install -m 600 "$previous" "$deployment_env"

compose pull home studio api judge-worker judge-sandbox mvp
if feature_enabled VIDEO_LESSONS_ENABLED; then
  compose pull video-worker
fi
if feature_enabled GUI_ENABLED; then
  compose pull gui-service
  "$script_dir/pin-gui-runtime.sh"
fi
compose up -d --remove-orphans
compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
"$script_dir/wait-healthy.sh"
"$script_dir/smoke.sh"

printf 'Rollback completed. Database migrations were not reversed.\n'
