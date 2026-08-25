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
    install -m 600 "$state_dir/previous-deployment.env" "$deployment_env"
    compose up -d --remove-orphans || true
  fi
  exit "$status"
}
trap rollback_on_error ERR

"$script_dir/render-monitoring-config.sh"
"$script_dir/preflight.sh"

compose pull home studio api judge-worker migrate mvp caddy redis \
  prometheus alertmanager grafana node-exporter cadvisor
compose --profile operations run --rm migrate
compose up -d --remove-orphans
"$script_dir/wait-healthy.sh"
"$script_dir/smoke.sh"

cp "$deployment_env" "$state_dir/current-deployment.env"
chmod 600 "$state_dir/current-deployment.env"
trap - ERR
printf 'Production deployment completed successfully.\n'
