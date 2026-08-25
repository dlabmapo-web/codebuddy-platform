#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_command python3
require_file "$deploy_root/secrets/monitoring.env"
require_file "$deploy_root/monitoring/alertmanager.yml.template"

python3 "$script_dir/render-monitoring-config.py" \
  "$deploy_root/secrets/monitoring.env" \
  "$deploy_root/monitoring/alertmanager.yml.template" \
  "$deploy_root/generated/alertmanager.yml"

printf 'Rendered Alertmanager configuration without exposing secrets.\n'
