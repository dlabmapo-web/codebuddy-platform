#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

candidate="${1:-}"
[[ -n "$candidate" ]] || fail "usage: deploy.sh PATH_TO_CANDIDATE_DEPLOYMENT_ENV"
require_file "$candidate"
require_command flock

state_dir="$deploy_root/state"
mkdir -p "$state_dir"
chmod 700 "$state_dir"

exec 9>"$state_dir/deploy.lock"
flock -n 9 || fail "another production deployment is already running"

candidate_copy="$state_dir/candidate-deployment.env"
install -m 600 "$candidate" "$candidate_copy"

had_previous=false
library_gates_may_exist=false
if [[ -f "$deployment_env" ]]; then
  install -m 600 "$deployment_env" "$state_dir/previous-deployment.env"
  had_previous=true
fi

install -m 600 "$candidate_copy" "$deployment_env"

rollback_on_error() {
  status=$?
  if (( status == 0 )); then
    return
  fi
  printf 'Deployment failed; attempting application rollback.\n' >&2
  if [[ "$had_previous" == true ]]; then
    # A newer web can require endpoints absent from the restored API.
    compose stop --timeout 30 studio || true
    # Fail closed: an unaware API must never see browser run IDs.
    "$script_dir/drain-turtle-browser.sh" || { printf 'Browser drain failed; rollback stopped before restoring the old API.\n' >&2; exit "$status"; }
    stop_learning_services
    if [[ "$library_gates_may_exist" == true ]]; then
      prepare_library_rollback "$state_dir/previous-deployment.env" || { printf 'Library gate cleanup failed; refusing to restore an incompatible API.\n' >&2; exit "$status"; }
    fi
    install -m 600 "$state_dir/previous-deployment.env" "$deployment_env"
    if feature_enabled GUI_ENABLED; then
      "$script_dir/pin-gui-runtime.sh" || true
    fi
    "$script_dir/publish-turtle-browser.sh" || { printf 'Previous runtime assets could not be restored.\n' >&2; exit "$status"; }
    compose up -d --remove-orphans || true
    stop_native_without_image
  fi
  exit "$status"
}
trap rollback_on_error ERR

"$script_dir/render-monitoring-config.sh"
"$script_dir/preflight.sh"

# pdf-converter (PPT/PPTX → PDF) is about 1.7 GB on first pull; pulling it here
# keeps that download out of the switchover below.
compose pull home studio api judge-worker judge-sandbox migrate mvp caddy redis \
  pdf-converter prometheus alertmanager grafana node-exporter cadvisor
if feature_enabled VIDEO_LESSONS_ENABLED; then
  compose pull video-worker
fi
if feature_enabled GUI_ENABLED; then
  compose pull gui-service
  "$script_dir/pin-gui-runtime.sh"
fi
if native_enabled; then
  compose pull native-grader
fi
"$script_dir/publish-turtle-browser.sh"
compose --profile operations run --rm migrate
compose --profile operations run --rm --entrypoint node migrate \
  node_modules/tsx/dist/cli.mjs scripts/setup-learning-storage.mts --production
# Academy browsing reads immutable snapshots even when job draining is off.
# Prepare existing published masters before replacing the API; fail closed if
# one cannot be captured, rather than making the library disappear on rollout.
compose --profile operations run --rm --entrypoint node migrate \
  node_modules/tsx/dist/cli.mjs src/library-sync/prepare-production.ts
# Keep the existing web serving until the new API passes its health check.
# getOutline is additive: the old web remains compatible during this stage.
compose up -d --wait --wait-timeout "${HEALTH_TIMEOUT_SECONDS:-300}" api
# Only the new API can deserialize the new internal feature enum. The old API
# continues serving during snapshot capture and must not see these rows yet.
if feature_enabled LIBRARY_SYNC_ENABLED; then
  library_gates_may_exist=true
  compose --profile operations run --rm --entrypoint node migrate \
    node_modules/tsx/dist/cli.mjs src/library-sync/prepare-production.ts --enable-all-academies
fi
compose up -d --remove-orphans
compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
"$script_dir/wait-healthy.sh"
"$script_dir/smoke.sh"

cp "$deployment_env" "$state_dir/current-deployment.env"
chmod 600 "$state_dir/current-deployment.env"
trap - ERR
printf 'Production deployment completed successfully.\n'
